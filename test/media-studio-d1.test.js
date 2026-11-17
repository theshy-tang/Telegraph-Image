const assert=require('assert');
const {createMockKV,makeContext}=require('./helpers');

function mockD1(){
  const folders=new Map(), media=new Map(),calls=[];
  const db={
    folders,media,calls,
    prepare(sql){
      return {
        all(){ return this.bind().all(); },
        first(){ return this.bind().first(); },
        run(){ return this.bind().run(); },
        bind(...args){
          return {
            async all(){
              calls.push({sql,args,method:'all'});
              if(sql.includes('FROM studio_folders ORDER BY'))return {results:[...folders.values()]};
              if(sql.startsWith('SELECT media_id, folder_id FROM studio_media_folders'))
                return {results:args.filter(id=>media.has(id)).map(media_id=>({media_id,folder_id:media.get(media_id)}))};
              throw Error('Unhandled D1.all SQL: '+sql);
            },
            async first(){
              calls.push({sql,args,method:'first'});
              if(sql.includes('FROM studio_folders WHERE id ='))return folders.get(args[0])||null;
              if(sql.includes('FROM studio_media_folders WHERE folder_id ='))
                return [...media.values()].includes(args[0])?{found:1}:null;
              if(sql.includes('FROM studio_folders WHERE parent_id ='))
                return [...folders.values()].some(f=>f.parent_id===args[0])?{found:1}:null;
              throw Error('Unhandled D1.first SQL: '+sql);
            },
            async run(){
              calls.push({sql,args,method:'run'});
              if(sql.startsWith('INSERT INTO studio_folders')){
                const [id,name,parent_id,created_at,updated_at]=args;
                if(parent_id&&!folders.has(parent_id))throw Error('FOREIGN KEY constraint failed');
                folders.set(id,{id,name,parent_id,created_at,updated_at});
                return {success:true,meta:{changes:1}};
              }
              if(sql.startsWith('UPDATE studio_folders')){
                const [name,parent_id,updated_at,id]=args;
                const f=folders.get(id);
                if(!f)return {success:true,meta:{changes:0}};
                folders.set(id,{...f,name,parent_id,updated_at});
                return {success:true,meta:{changes:1}};
              }
              if(sql.startsWith('DELETE FROM studio_folders')){
                const id=args[0], hasChild=[...folders.values()].some(f=>f.parent_id===id);
                const hasMedia=[...media.values()].includes(id);
                if(!folders.has(id)||hasChild||hasMedia)return {success:true,meta:{changes:0}};
                folders.delete(id);return {success:true,meta:{changes:1}};
              }
              if(sql.startsWith('INSERT INTO studio_media_folders')){
                const [id,folderId]=args;
                if(!folders.has(folderId))throw Error('FOREIGN KEY constraint failed');
                media.set(id,folderId);return {success:true,meta:{changes:1}};
              }
              if(sql.startsWith('DELETE FROM studio_media_folders')){
                const n=media.delete(args[0])?1:0;return {success:true,meta:{changes:n}};
              }
              throw Error('Unhandled D1.run SQL: '+sql);
            }
          };
        }
      };
    }
  };
  return db;
}
const request=(path,method,body)=>new Request('https://example.com'+path,{
  method,headers:{Origin:'https://example.com',...((method==='POST'||method==='PATCH')?{'Content-Type':'application/json'}:{})},
  ...((method==='POST'||method==='PATCH')?{body:JSON.stringify(body)}:{})
});
const envFor=(kv,db)=>({img_url:kv,MEDIA_STUDIO_DB:db,BASIC_USER:'admin',BASIC_PASS:'password'});

describe('Media Studio D1 folder backend',function(){
  let collection,detail,bulk,list;
  before(async function(){
    collection=await import('../functions/api/manage/folders.js');
    detail=await import('../functions/api/manage/folders/[id].js');
    bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;
    list=(await import('../functions/api/manage/list.js')).onRequest;
  });
  it('creates, renames, moves and safely deletes folders using D1, preserving original KV image',async function(){
    const db=mockD1(),kv=createMockKV({'sample.jpg':{fileName:'sample.jpg',liked:true,tags:['nature']}});
    const env=envFor(kv,db);
    async function create(name,parentId=null){
      const res=await collection.onRequestPost(makeContext({env,request:request('/api/manage/folders','POST',{name,parentId})}));
      assert.strictEqual(res.status,201,await res.clone().text());
      return (await res.json()).folder;
    }
    const root=await create('Shopify');
    const child=await create('装修',root.id);
    const before=(await (await collection.onRequestGet(makeContext({env}))).json());
    assert.strictEqual(before.backend,'d1');
    assert.strictEqual(before.folders.find(f=>f.id===child.id).parentId,root.id);
    assert.strictEqual(kv.operations.put.length,0,'D1 folder create must not create KV records');

    const rename=await detail.onRequestPatch(makeContext({env,params:{id:child.id},
      request:request('/api/manage/folders/'+child.id,'PATCH',{name:'店铺装修'})}));
    assert.strictEqual(rename.status,200);
    assert.strictEqual(db.folders.get(child.id).name,'店铺装修');

    const move=await bulk(makeContext({env,request:request('/api/manage/bulk','POST',{
      action:'move_folder',ids:['sample.jpg'],folderId:child.id})}));
    assert.strictEqual(move.status,200,await move.clone().text());
    assert.strictEqual(db.media.get('sample.jpg'),child.id);
    assert.strictEqual(kv.snapshot('sample.jpg').metadata.liked,true);
    assert.strictEqual(kv.operations.put.length,0,'D1 membership must not rewrite KV');

    const records=await list(makeContext({env,request:request('/api/manage/list?limit=100','GET')}));
    const data=await records.json();
    assert.strictEqual(data.keys.find(x=>x.name==='sample.jpg').metadata.folderId,child.id);

    const refused=await detail.onRequestDelete(makeContext({env,params:{id:child.id},
      request:request('/api/manage/folders/'+child.id,'DELETE')}));
    assert.strictEqual(refused.status,409);
    const removed=await bulk(makeContext({env,request:request('/api/manage/bulk','POST',{
      action:'move_folder',ids:['sample.jpg'],folderId:null})}));
    assert.strictEqual(removed.status,200);
    const clean=await detail.onRequestDelete(makeContext({env,params:{id:child.id},
      request:request('/api/manage/folders/'+child.id,'DELETE')}));
    assert.strictEqual(clean.status,200);
    assert.strictEqual(db.folders.has(child.id),false);
    assert.ok(kv.snapshot('sample.jpg'),'Deleting D1 folder never deletes Telegram media metadata');
  });
});
