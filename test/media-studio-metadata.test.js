const { enableFixtureCatalog, catalogRequest } = require('./catalog-access-fixture');
const assert=require('assert');const {createStudioDB}=require('./studio-runtime');const {createMockKV,makeContext}=require('./helpers');
const request=(action,extra={})=>new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify({action,ids:['sample.jpg'],...extra})});
describe('Studio authoritative D1 metadata',function(){
 this.timeout(30000);let runtime,db,env,bulk,list,metadata;
 before(async()=>{runtime=await createStudioDB();db=runtime.db;bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;list=(await import('../functions/api/manage/list.js')).onRequest;metadata=await import('../functions/utils/studio-metadata.js');});
 after(async()=>{if(runtime)await runtime.dispose();});
 beforeEach(async()=>{await db.prepare('DELETE FROM studio_media_folders').run();await db.prepare('DELETE FROM studio_media_metadata').run();await db.prepare('DELETE FROM studio_folders').run();env={BASIC_USER:'admin',BASIC_PASS:'test',MEDIA_STUDIO_DB:db,MEDIA_STUDIO_METADATA_D1:'true',img_url:createMockKV({'sample.jpg':{fileName:'Original',liked:false,aiPublished:false,tags:['Base'],albums:[],category:'',ListType:'None'}})};});
 const run=async(action,extra={})=>(await bulk(makeContext({env,request:request(action,extra)}))).json();
 const listing=async()=>(await list(makeContext({env,request:new Request('https://example.com/api/manage/list')}))).json();
 it('merges concurrent tag/favorite/category writes without rewriting original KV',async()=>{
  const responses=await Promise.all([run('add_tags',{names:['A']}),run('add_tags',{names:['B']}),run('favorite'),run('set_category',{category:'Shop'})]);
  assert.ok(responses.every(x=>x.success===1));const m=(await listing()).keys[0].metadata;
  assert.deepStrictEqual([...m.tags].sort(),['A','B','Base']);assert.strictEqual(m.liked,true);assert.strictEqual(m.category,'Shop');assert.strictEqual(m.metadataVersion,4);assert.strictEqual(env.img_url.operations.put.length,0);
 });
 it('rejects a stale details save and keeps the newer tags',async()=>{
  await run('add_tags',{names:['Other window']});
  const response=await run('edit_details',{fileName:'Stale',category:'',tags:[],metadataVersion:0});
  assert.strictEqual(response.results[0].code,'METADATA_CONFLICT');const m=(await listing()).keys[0].metadata;
  assert.strictEqual(m.fileName,'Original');assert.ok(m.tags.includes('Other window'));
  const saved=await run('edit_details',{fileName:'Fresh',category:'Shop',tags:['New'],metadataVersion:m.metadataVersion});assert.strictEqual(saved.success,1);
 });
 it('restricted catalog immediately observes D1 unpublish despite stale KV',async()=>{
  await enableFixtureCatalog(env);const catalog=(await import('../functions/api/shopify-assets.js')).onRequest;
  await run('publish');assert.strictEqual((await (await catalog(makeContext({env,request:catalogRequest()}))).json()).count,1);
  await run('unpublish');assert.strictEqual((await (await catalog(makeContext({env,request:catalogRequest()}))).json()).count,0);
 });
 it('legacy name/favorite handlers update D1 and do not overwrite tags',async()=>{
  await run('add_tags',{names:['Keep']});
  const toggle=(await import('../functions/api/manage/toggleLike/[id].js')).onRequest;
  const rename=(await import('../functions/api/manage/editName/[id].js')).onRequest;
  await toggle(makeContext({env,params:{id:'sample.jpg'}}));
  await rename(makeContext({env,params:{id:'sample.jpg'},request:new Request('https://example.com/api/manage/editName/sample.jpg?newName=Renamed')}));
  const m=(await listing()).keys[0].metadata;assert.strictEqual(m.fileName,'Renamed');assert.strictEqual(m.liked,true);assert.ok(m.tags.includes('Keep'));assert.strictEqual(env.img_url.operations.put.length,0);
 });
 it('deletion atomically hides metadata and removes membership even when KV deletion fails',async()=>{
  const folder='a'.repeat(32);await db.prepare('INSERT INTO studio_folders VALUES (?,?,NULL,1,1)').bind(folder,'Root').run();await run('move_folder',{folderId:folder});
  const remove=(await import('../functions/api/manage/delete/[id].js')).onRequest;
  const originalDelete=env.img_url.delete;env.img_url.delete=async()=>{throw Error('KV failure');};
  const context=()=>makeContext({env,params:{id:'sample.jpg'},request:new Request('https://example.com/api/manage/delete/sample.jpg',{method:'DELETE',headers:{Origin:'https://example.com'}})});
  await assert.rejects(remove(context()),/KV failure/);
  assert.strictEqual((await listing()).keys.length,0);assert.strictEqual((await db.prepare('SELECT COUNT(*) AS n FROM studio_media_folders').first()).n,0);
  assert.strictEqual((await run('favorite')).results[0].code,'MEDIA_DELETED');
  await assert.rejects(db.prepare('INSERT INTO studio_media_folders VALUES (?,?,1)').bind('sample.jpg',folder).run(),/STUDIO_MEDIA_DELETED/);
  env.img_url.delete=originalDelete;assert.strictEqual((await remove(context())).status,200);
 });
 it('requires same-origin DELETE on D1-backed legacy deletion',async()=>{
  const remove=(await import('../functions/api/manage/delete/[id].js')).onRequest;
  assert.strictEqual((await remove(makeContext({env,params:{id:'sample.jpg'},request:new Request('https://example.com/api/manage/delete/sample.jpg')}))).status,405);
  assert.strictEqual((await remove(makeContext({env,params:{id:'sample.jpg'},request:new Request('https://example.com/api/manage/delete/sample.jpg',{method:'DELETE',headers:{Origin:'https://evil.example'}})}))).status,403);
  assert.strictEqual(env.img_url.operations.delete.length,0);
 });
 it('fails closed if the metadata flag is set but the D1 binding is missing',async()=>{
  delete env.MEDIA_STUDIO_DB;const r=await bulk(makeContext({env,request:request('favorite')}));assert.strictEqual(r.status,503);assert.strictEqual(env.img_url.operations.put.length,0);
 });
 it('single-media reload returns authoritative metadata and does not revive deletion markers',async()=>{
  const get=(await import('../functions/api/manage/media/[id].js')).onRequestGet;
  await run('favorite');const response=await get(makeContext({env,params:{id:'sample.jpg'}}));
  const record=(await response.json()).record;assert.strictEqual(record.metadata.liked,true);assert.strictEqual(record.metadata.metadataVersion,1);
  await metadata.markStudioMediaDeleted(db,'sample.jpg',{});
  assert.strictEqual((await get(makeContext({env,params:{id:'sample.jpg'}}))).status,404);
 });
 it('unconfigured or partially configured admin credentials fail closed',async()=>{
  const auth=(await import('../functions/api/manage/_middleware.js')).onRequest[1];
  for(const creds of [{},{BASIC_USER:'admin'},{BASIC_PASS:'test'}]){
   const response=await auth(makeContext({env:{img_url:env.img_url,...creds},next:()=>new Response('should not run')}));assert.strictEqual(response.status,503);
  }
 });

});
