const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {Miniflare}=require('miniflare');
const {createMockKV,makeContext}=require('./helpers');
const sql=n=>fs.readFileSync(path.join(__dirname,'../migrations',n),'utf8');
const id=n=>n.toString(16).padStart(32,'0');
const req=(method,body)=>new Request('https://example.com/api/manage/folders',{method,headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)});

describe('Media Studio real D1 SQL integrity',function(){
  this.timeout(30000);
  let mf,db;
  before(async function(){
    mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});
    db=await mf.getD1Database('DB');
    for(const statement of sql('0001_media_studio_folders_d1.sql').replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await db.prepare(statement).run();
    for(const statement of sql('0002_media_studio_folder_guards.sql').split('-- statement-boundary').filter(s=>s.includes('CREATE TRIGGER')))await db.prepare(statement.trim().replace(/\s+/g,' ')).run();
  });
  after(async()=>{if(mf)await mf.dispose();});
  beforeEach(async()=>{await db.prepare('DELETE FROM studio_media_folders').run();for(let i=0;i<8;i++)await db.prepare('DELETE FROM studio_folders WHERE NOT EXISTS (SELECT 1 FROM studio_folders c WHERE c.parent_id=studio_folders.id)').run();});
  const insert=(n,name,parent=null)=>db.prepare('INSERT INTO studio_folders(id,name,parent_id,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id(n),name,parent,1,1).run();
  it('rejects duplicate siblings while permitting the same name in another parent',async function(){
    await insert(1,'Shopify');await insert(2,'Other');
    await assert.rejects(insert(3,'shopify'),/STUDIO_FOLDER_DUPLICATE/);
    await insert(4,'Shopify',id(2));
    assert.strictEqual((await db.prepare('SELECT COUNT(*) AS n FROM studio_folders').first()).n,3);
  });
  it('rolls back cyclic and too-deep subtree moves',async function(){
    await insert(1,'Root');await insert(2,'Child',id(1));
    await assert.rejects(db.prepare('UPDATE studio_folders SET parent_id=? WHERE id=?').bind(id(2),id(1)).run(),/STUDIO_FOLDER_STRUCTURE/);
    assert.strictEqual((await db.prepare('SELECT parent_id FROM studio_folders WHERE id=?').bind(id(1)).first()).parent_id,null);
    for(let n=3;n<=8;n++)await insert(n,'Level '+n,id(n-1));
    await assert.rejects(insert(9,'Level 9',id(8)),/STUDIO_FOLDER_STRUCTURE/);
    await insert(10,'Another root');await insert(11,'Another child',id(10));
    await assert.rejects(db.prepare('UPDATE studio_folders SET parent_id=? WHERE id=?').bind(id(7),id(10)).run(),/STUDIO_FOLDER_STRUCTURE/);
  });
  it('rejects an inverse move validated against stale application reads with API 409',async function(){
    await insert(1,'A');await insert(2,'B');
    const snapshot=(await db.prepare('SELECT * FROM studio_folders').all()).results;
    const stale={prepare(query){return query.includes('ORDER BY name')?{all:async()=>({results:snapshot})}:db.prepare(query);}};
    const env={BASIC_USER:'admin',BASIC_PASS:'test',img_url:createMockKV(),MEDIA_STUDIO_DB:stale};
    const {onRequestPatch}=await import('../functions/api/manage/folders/[id].js');
    const patch=(n,parent)=>onRequestPatch(makeContext({env,params:{id:id(n)},request:req('PATCH',{parentId:id(parent)})}));
    assert.strictEqual((await patch(1,2)).status,200);
    assert.strictEqual((await patch(2,1)).status,409);
    assert.strictEqual((await db.prepare('SELECT parent_id FROM studio_folders WHERE id=?').bind(id(2)).first()).parent_id,null);
  });
  it('supports API create/read/rename/move/unfile/delete and preserves KV media',async function(){
    const env={BASIC_USER:'admin',BASIC_PASS:'test',img_url:createMockKV({'sample.jpg':{liked:true,tags:['keep']}}),MEDIA_STUDIO_DB:db};
    const collection=await import('../functions/api/manage/folders.js');
    const detail=await import('../functions/api/manage/folders/[id].js');
    const bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;
    const created=await collection.onRequestPost(makeContext({env,request:req('POST',{name:'Test'})}));
    assert.strictEqual(created.status,201);const folder=(await created.json()).folder;
    const folders=await (await collection.onRequestGet(makeContext({env}))).json();assert.ok(folders.folders.some(f=>f.id===folder.id));
    assert.strictEqual((await detail.onRequestPatch(makeContext({env,params:{id:folder.id},request:req('PATCH',{name:'Renamed'})}))).status,200);
    const move=folderId=>bulk(makeContext({env,request:req('POST',{action:'move_folder',ids:['sample.jpg'],folderId})}));
    assert.strictEqual((await (await move(folder.id)).json()).success,1);
    const del=()=>detail.onRequestDelete(makeContext({env,params:{id:folder.id},request:new Request('https://example.com/api/manage/folders/'+folder.id,{method:'DELETE',headers:{Origin:'https://example.com'}})}));
    assert.strictEqual((await del()).status,409);
    assert.strictEqual((await (await move(null)).json()).success,1);
    assert.strictEqual((await del()).status,200);
    assert.strictEqual((await db.prepare('SELECT COUNT(*) AS n FROM studio_folders').first()).n,0);
    assert.strictEqual(env.img_url.snapshot('sample.jpg').metadata.liked,true);
    assert.strictEqual(env.img_url.operations.put.length,0);
  });
});
