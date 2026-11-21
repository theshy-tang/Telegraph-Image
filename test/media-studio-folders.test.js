const assert=require('assert');
const {createMockKV,makeContext}=require('./helpers');

const URL='https://example.com/api/manage/folders';
const credentials={BASIC_USER:'admin',BASIC_PASS:'test-pass'};
const envFor=kv=>({...credentials,img_url:kv});
const request=(path,method,body)=>new Request('https://example.com'+path,{
  method,headers:{Origin:'https://example.com',...((method==='POST'||method==='PATCH')?{'Content-Type':'application/json'}:{})},
  ...((method==='POST'||method==='PATCH')?{body:JSON.stringify(body)}:{})
});

describe('Media Studio nested folders',function(){
  let collection,folderDetail,bulk;
  before(async function(){
    collection=await import('../functions/api/manage/folders.js');
    folderDetail=await import('../functions/api/manage/folders/[id].js');
    bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;
  });
  const image={fileName:'portrait.jpg',liked:true,aiPublished:false,tags:['nature'],fileSize:5000};
  async function create(kv,name,parentId=null){
    const result=await collection.onRequestPost(makeContext({
      env:envFor(kv),request:request('/api/manage/folders','POST',{name,parentId})
    }));
    assert.strictEqual(result.status,201,await result.clone().text());
    return (await result.json()).folder;
  }
  it('creates and lists hierarchical folders with stable IDs',async function(){
    const kv=createMockKV({'portrait.jpg':image});
    const root=await create(kv,'个人收藏');
    const child=await create(kv,'旅行摄影',root.id);
    assert.match(root.id,/^[a-f0-9]{32}$/);
    assert.strictEqual(child.parentId,root.id);
    const result=await collection.onRequestGet(makeContext({env:envFor(kv)}));
    assert.strictEqual(result.status,200);
    const data=await result.json();
    assert.strictEqual(data.folders.length,2);
    assert.strictEqual(kv.snapshot('portrait.jpg').metadata.fileName,'portrait.jpg');
  });
  it('renames and reparents without changing image media keys',async function(){
    const kv=createMockKV({'portrait.jpg':image});
    const a=await create(kv,'设计');
    const b=await create(kv,'项目');
    const res=await folderDetail.onRequestPatch(makeContext({
      env:envFor(kv),params:{id:a.id},
      request:request('/api/manage/folders/'+a.id,'PATCH',{name:'设计灵感',parentId:b.id})
    }));
    assert.strictEqual(res.status,200);
    assert.strictEqual((await res.json()).folder.parentId,b.id);
    assert.strictEqual(kv.snapshot('portrait.jpg').metadata.fileName,'portrait.jpg');
  });
  it('prevents cycles and sibling duplicate names',async function(){
    const kv=createMockKV({});
    const root=await create(kv,'工作');
    const child=await create(kv,'Shopify',root.id);
    const cyclic=await folderDetail.onRequestPatch(makeContext({
      env:envFor(kv),params:{id:root.id},request:request('/api/manage/folders/'+root.id,'PATCH',{parentId:child.id})
    }));
    assert.strictEqual(cyclic.status,409);
    const duplicate=await collection.onRequestPost(makeContext({
      env:envFor(kv),request:request('/api/manage/folders','POST',{name:'Shopify',parentId:root.id})
    }));
    assert.strictEqual(duplicate.status,409);
  });
  it('bulk moves media while preserving favorite, tags and AI publish flags',async function(){
    const kv=createMockKV({'portrait.jpg':image});
    const folder=await create(kv,'风景作品');
    const req=request('/api/manage/bulk','POST',{action:'move_folder',ids:['portrait.jpg'],folderId:folder.id});
    const result=await bulk(makeContext({request:req,env:envFor(kv)}));
    assert.strictEqual(result.status,200);
    const metadata=kv.snapshot('portrait.jpg').metadata;
    assert.strictEqual(metadata.folderId,folder.id);
    assert.strictEqual(metadata.liked,true);
    assert.deepStrictEqual(metadata.tags,['nature']);
    assert.strictEqual(metadata.aiPublished,false);
    const invalid=await bulk(makeContext({env:envFor(kv),request:request('/api/manage/bulk','POST',{
      action:'move_folder',ids:['portrait.jpg'],folderId:'00000000000000000000000000000000'
    })}));
    assert.strictEqual(invalid.status,404);
  });
  it('refuses deletion of nonempty folders and folders with children',async function(){
    const kv=createMockKV({'portrait.jpg':image});
    const root=await create(kv,'项目');
    const child=await create(kv,'店铺A',root.id);
    let res=await folderDetail.onRequestDelete(makeContext({env:envFor(kv),params:{id:root.id},
      request:request('/api/manage/folders/'+root.id,'DELETE')}));
    assert.strictEqual(res.status,409);
    await bulk(makeContext({env:envFor(kv),request:request('/api/manage/bulk','POST',{
      action:'move_folder',ids:['portrait.jpg'],folderId:child.id
    })}));
    res=await folderDetail.onRequestDelete(makeContext({env:envFor(kv),params:{id:child.id},
      request:request('/api/manage/folders/'+child.id,'DELETE')}));
    assert.strictEqual(res.status,409);
    assert.strictEqual(kv.snapshot('portrait.jpg').metadata.folderId,child.id);
  });
  it('deletes an empty folder without deleting image records',async function(){
    const kv=createMockKV({'portrait.jpg':image});
    const root=await create(kv,'空相册');
    const res=await folderDetail.onRequestDelete(makeContext({env:envFor(kv),params:{id:root.id},
      request:request('/api/manage/folders/'+root.id,'DELETE')}));
    assert.strictEqual(res.status,200);
    assert.strictEqual(kv.snapshot('studio:folder:'+root.id),undefined);
    assert.strictEqual(kv.snapshot('portrait.jpg').metadata.fileName,'portrait.jpg');
  });
  it('checks folder children and media concurrently before deleting',async function(){
    const kv=createMockKV({});
    const folder=await create(kv,'快速删除测试');
    const originalList=kv.list.bind(kv);
    let pending=0,overlapped=false;
    kv.list=async options=>{
      pending++;
      if(pending>1)overlapped=true;
      await Promise.resolve();
      try{return await originalList(options);}
      finally{pending--;}
    };
    const res=await folderDetail.onRequestDelete(makeContext({env:envFor(kv),params:{id:folder.id},
      request:request('/api/manage/folders/'+folder.id,'DELETE')}));
    assert.strictEqual(res.status,200);
    assert.strictEqual(overlapped,true,'independent KV checks should run at the same time');
    assert.strictEqual(kv.snapshot('studio:folder:'+folder.id),undefined);
  });
  it('fails closed when admin credentials are unset or request is cross-origin',async function(){
    const kv=createMockKV({});
    const disabled=await collection.onRequestGet(makeContext({env:{img_url:kv}}));
    assert.strictEqual(disabled.status,503);
    const cross=new Request(URL,{method:'POST',headers:{
      Origin:'https://foreign.example','Content-Type':'application/json'
    },body:JSON.stringify({name:'Bad'})});
    const blocked=await collection.onRequestPost(makeContext({env:envFor(kv),request:cross}));
    assert.strictEqual(blocked.status,403);
    assert.strictEqual(kv.operations.put.length,0);
  });
});
