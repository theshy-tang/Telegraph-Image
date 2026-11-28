const assert=require('assert');const {createStudioDB}=require('./studio-runtime');const {createMockKV,makeContext}=require('./helpers');
describe('Studio indexed full-library search',function(){
 this.timeout(30000);let runtime,env,search,catalog,meta;
 before(async()=>{runtime=await createStudioDB();env={MEDIA_STUDIO_DB:runtime.db,MEDIA_STUDIO_METADATA_D1:'true',img_url:createMockKV(),BASIC_USER:'admin',BASIC_PASS:'fixture'};search=(await import('../functions/api/manage/search.js')).onRequestGet;catalog=await import('../functions/utils/studio-catalog.js');meta=await import('../functions/utils/studio-metadata.js');});
 after(async()=>{if(runtime)await runtime.dispose();});
 beforeEach(async()=>{for(const table of ['studio_media_folders','studio_media_metadata','studio_media_inventory'])await runtime.db.prepare('DELETE FROM '+table).run();for(let depth=0;depth<8;depth++)await runtime.db.prepare('DELETE FROM studio_folders WHERE NOT EXISTS (SELECT 1 FROM studio_folders c WHERE c.parent_id=studio_folders.id)').run();await runtime.db.prepare('UPDATE studio_catalog_state SET ready=1 WHERE id=1').run();});
 const add=(id,props={})=>catalog.indexStudioMedia(env,id,{fileName:id,TimeStamp:100,fileSize:10,tags:[],albums:[],category:'',...props});
 async function request(params={}){return search(makeContext({env,request:new Request('https://example.com/api/manage/search?'+new URLSearchParams(params))}));}
 async function data(params={}){const response=await request(params);assert.strictEqual(response.status,200,await response.clone().text());return response.json();}
 it('finds records not present in KV list or loaded browser pages',async()=>{
  await add('older.jpg',{fileName:'Searchable older asset',tags:['Shop']});await add('newer.mp4',{fileName:'Other'});
  assert.strictEqual((await env.img_url.list({limit:1})).keys.length,0);
  const r=await data({q:'older'});assert.strictEqual(r.total,1);assert.strictEqual(r.keys[0].name,'older.jpg');assert.strictEqual(r.backend,'d1');
 });
 it('paginates tied timestamps in both directions without duplicates',async()=>{
  for(let n=0;n<57;n++)await add('sample'+String(n).padStart(3,'0')+'.jpg',{TimeStamp:n%3});
  for(const order of ['new','old']){let cursor,seen=[];do{const page=await data({limit:'10',order,...(cursor?{cursor}:{})});assert.strictEqual(page.total,57);seen.push(...page.keys.map(k=>k.name));cursor=page.cursor;}while(cursor);assert.strictEqual(seen.length,57);assert.strictEqual(new Set(seen).size,57);}
 });
 it('paginates names with a stable ID tiebreaker and rejects cursor reuse under new filters',async()=>{
  await add('first.jpg',{fileName:'同名'});await add('second.jpg',{fileName:'同名'});await add('third.jpg',{fileName:'a'});await add('fourth.jpg',{fileName:'A'});
  let cursor,ids=[];do{const r=await data({limit:'1',order:'name',...(cursor?{cursor}:{})});ids.push(...r.keys.map(x=>x.name));cursor=r.cursor;}while(cursor);assert.strictEqual(new Set(ids).size,4);
  const first=await data({limit:'1'});assert.strictEqual((await request({cursor:first.cursor,q:'changed'})).status,400);
 });
 it('combines exact tags, type, favorites and folders; descendants are opt-in',async()=>{
  const a='a'.repeat(32),b='b'.repeat(32);await runtime.db.prepare('INSERT INTO studio_folders VALUES (?,?,NULL,1,1)').bind(a,'Parent').run();await runtime.db.prepare('INSERT INTO studio_folders VALUES (?,?,?,1,1)').bind(b,'Child',a).run();
  await add('direct.jpg',{tags:['Shop'],liked:true});await add('nested.jpg',{tags:['Shop'],liked:true});await add('otherx.mp4',{tags:['Shopify']});
  await runtime.db.batch([runtime.db.prepare('INSERT INTO studio_media_folders VALUES (?,?,1)').bind('direct.jpg',a),runtime.db.prepare('INSERT INTO studio_media_folders VALUES (?,?,1)').bind('nested.jpg',b)]);
  assert.strictEqual((await data({folder:a,tag:'Shop',view:'image'})).total,1);
  assert.strictEqual((await data({folder:a,descendants:'true',tag:'Shop',view:'favorites'})).total,2);
  assert.strictEqual((await data({folder:'unfiled'})).total,1);assert.strictEqual((await data({tag:'Shopify',view:'video'})).keys[0].name,'otherx.mp4');
 });
 it('searches latest D1 edits and excludes deleted records and their tag suggestions immediately',async()=>{
  await add('sample.jpg',{tags:['Old']});await meta.mutateStudioMetadata(runtime.db,'sample.jpg',{tags:['Old'],fileName:'Old'},m=>({...m,tags:['New'],fileName:'Latest',liked:true}));
  assert.strictEqual((await data({q:'Latest',tag:'New',view:'favorites'})).total,1);assert.strictEqual((await data({tag:'Old'})).total,0);
  await meta.markStudioMediaDeleted(runtime.db,'sample.jpg',{});const r=await data();assert.strictEqual(r.total,0);assert.deepStrictEqual(r.tags,[]);
 });
 it('treats wildcard characters and SQL-like text as literals',async()=>{
  await add('sample.jpg',{fileName:'100%_done'});await add('otherx.jpg',{fileName:'100xy_done'});
  assert.strictEqual((await data({q:'%_'})).total,1);assert.strictEqual((await data({q:"' OR 1=1 --"})).total,0);
 });
 it('fails closed until import is ready and validates search inputs',async()=>{
  for(const params of [{limit:'101'},{limit:'0'},{order:'random'},{folder:'bad'},{cursor:'bad'},{q:'a'.repeat(257)}])assert.strictEqual((await request(params)).status,400);
  await runtime.db.prepare('UPDATE studio_catalog_state SET ready=0').run();assert.strictEqual((await request()).status,503);
 });
});
