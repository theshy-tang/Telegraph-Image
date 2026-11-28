const assert=require('assert');const {createStudioDB}=require('./studio-runtime');const {createMockKV,makeContext}=require('./helpers');
describe('Studio global tag management',function(){
 this.timeout(30000);let runtime,env,tags,catalog,meta,search,auth;
 before(async()=>{runtime=await createStudioDB();env={MEDIA_STUDIO_DB:runtime.db,MEDIA_STUDIO_METADATA_D1:'true',img_url:createMockKV(),BASIC_USER:'fixture',BASIC_PASS:'fixture'};tags=await import('../functions/api/manage/tags.js');catalog=await import('../functions/utils/studio-catalog.js');meta=await import('../functions/utils/studio-metadata.js');search=(await import('../functions/api/manage/search.js')).onRequestGet;auth=(await import('../functions/api/manage/_middleware.js')).onRequest;});
 after(async()=>{if(runtime)await runtime.dispose();});
 beforeEach(async()=>{await runtime.db.batch(['DELETE FROM studio_media_folders','DELETE FROM studio_media_metadata','DELETE FROM studio_media_inventory','UPDATE studio_catalog_state SET ready=1'].map(x=>runtime.db.prepare(x)));});
 const add=(id,props={})=>catalog.indexStudioMedia(env,id,{fileName:id,tags:[],albums:[],...props});
 const get=(params={})=>tags.onRequestGet(makeContext({env,request:new Request('https://example.com/api/manage/tags?'+new URLSearchParams(params))}));
 const post=(payload,headers={})=>tags.onRequestPost(makeContext({env,request:new Request('https://example.com/api/manage/tags',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)})}));
 const rename=(source,target,action='rename')=>post({source,target,action});
 const doc=async id=>{const row=await runtime.db.prepare('SELECT * FROM studio_media_metadata WHERE media_id=?').bind(id).first();return {...row,metadata:JSON.parse(row.metadata)};};
 it('counts distinct live media using D1 edits, including unseeded inventory',async()=>{
  await add('first.jpg',{tags:['A','A','B']});await add('second.jpg',{tags:['A']});await meta.mutateStudioMetadata(runtime.db,'second.jpg',{},m=>({...m,tags:['C']}));
  await add('third.jpg',{tags:['Ghost']});await meta.markStudioMediaDeleted(runtime.db,'third.jpg',{});
  const r=await get();assert.strictEqual(r.status,200);assert.deepStrictEqual((await r.json()).tags,[{name:'A',count:1},{name:'B',count:1},{name:'C',count:1}]);
 });
 it('renames all affected media atomically, preserves fields and bumps versions',async()=>{
  await add('first.jpg',{tags:['Old','Keep'],liked:true,aiPublished:true,category:'Product',fileName:'Original',ListType:'Block'});await add('second.jpg',{tags:['Old']});
  await meta.mutateStudioMetadata(runtime.db,'second.jpg',{},m=>({...m,tags:['Old','Added'],fileName:'Latest',liked:true}));
  const r=await rename('Old','New');assert.strictEqual(r.status,200,await r.clone().text());assert.strictEqual((await r.json()).changed,2);
  const a=await doc('first.jpg'),b=await doc('second.jpg');assert.deepStrictEqual(a.metadata.tags,['New','Keep']);assert.strictEqual(a.metadata.liked,true);assert.strictEqual(a.metadata.aiPublished,true);assert.strictEqual(a.metadata.category,'Product');assert.strictEqual(a.metadata.ListType,undefined);assert.strictEqual(a.version,1);assert.strictEqual(b.version,2);assert.strictEqual(b.metadata.fileName,'Latest');assert.deepStrictEqual(b.metadata.tags,['New','Added']);
  assert.strictEqual((await env.img_url.list()).keys.length,0);
  assert.strictEqual((await (await search(makeContext({env,request:new Request('https://example.com/api/manage/search?tag=New')}))).json()).total,2);
 });
 it('requires explicit merge and deduplicates target tags in their stable order',async()=>{
  await add('first.jpg',{tags:['Old','Keep','Target']});await add('second.jpg',{tags:['Target','Old','Keep']});
  assert.strictEqual((await rename('Old','Target')).status,409);assert.strictEqual(await runtime.db.prepare('SELECT COUNT(*) AS n FROM studio_media_metadata').first('n'),0);
  const r=await rename('Old','Target','merge');assert.strictEqual(r.status,200,await r.clone().text());assert.strictEqual((await r.json()).changed,2);assert.deepStrictEqual((await doc('first.jpg')).metadata.tags,['Target','Keep']);assert.deepStrictEqual((await doc('second.jpg')).metadata.tags,['Target','Keep']);
  assert.strictEqual((await rename('Old','Target','merge')).status,409);
 });
 it('never revives tombstones, changes memberships or overwrites other edits',async()=>{
  await add('first.jpg',{tags:['Old']});await add('second.jpg',{tags:['Old']});await meta.markStudioMediaDeleted(runtime.db,'second.jpg',{});
  const folder='a'.repeat(32);await runtime.db.prepare('INSERT INTO studio_folders VALUES (?,?,NULL,1,1)').bind(folder,'Fixture').run();await runtime.db.prepare('INSERT INTO studio_media_folders VALUES (?,?,1)').bind('first.jpg',folder).run();
  await rename('Old','New');assert.strictEqual(await runtime.db.prepare('SELECT folder_id FROM studio_media_folders WHERE media_id=?').bind('first.jpg').first('folder_id'),folder);assert.strictEqual((await doc('second.jpg')).deleted,1);assert.strictEqual((await doc('second.jpg')).version,1);
  await assert.rejects(()=>meta.mutateStudioMetadata(runtime.db,'first.jpg',{},m=>({...m,tags:['Stale']}),0),e=>e.code==='METADATA_CONFLICT');
  await meta.mutateStudioMetadata(runtime.db,'first.jpg',{},m=>({...m,liked:true}));assert.deepStrictEqual((await doc('first.jpg')).metadata.tags,['New']);
 });
 it('rolls back the entire global operation when any row fails',async()=>{
  await add('first.jpg',{tags:['Old']});await add('second.jpg',{tags:['Old']});
  await runtime.db.prepare("CREATE TRIGGER fixture_tag_abort BEFORE INSERT ON studio_media_metadata WHEN NEW.media_id='second.jpg' BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
  try{assert.strictEqual((await rename('Old','New')).status,503);assert.strictEqual(await runtime.db.prepare('SELECT COUNT(*) AS n FROM studio_media_metadata').first('n'),0);const listed=await(await get()).json();assert.deepStrictEqual(listed.tags,[{name:'Old',count:2}]);}
  finally{await runtime.db.prepare('DROP TRIGGER fixture_tag_abort').run();}
 });
 it('paginates more than 100 tags without loss and treats search wildcards literally',async()=>{
  for(let n=0;n<105;n++)await add('sample'+n+'.jpg',{tags:['Tag'+String(n).padStart(3,'0')]});
  await add('literal.jpg',{tags:['100%_done']});const first=await (await get()).json();assert.strictEqual(first.tags.length,100);assert.strictEqual(first.total,106);const next=await(await get({after:first.after})).json();assert.strictEqual(new Set([...first.tags,...next.tags].map(t=>t.name)).size,106);assert.strictEqual(next.after,null);assert.strictEqual((await(await get({q:'%_'})).json()).total,1);
 });
 it('keeps current source additions during concurrent metadata changes',async()=>{
  await add('first.jpg',{tags:['Old'],fileName:'First'});
  await Promise.all([rename('Old','New'),meta.mutateStudioMetadata(runtime.db,'first.jpg',{tags:['Old']},m=>({...m,tags:[...m.tags,'Concurrent'],liked:true}))]);
  const m=(await doc('first.jpg')).metadata;assert.ok(m.tags.includes('New'));assert.ok(m.tags.includes('Concurrent'));assert.strictEqual(m.liked,true);
 });
 it('rejects cross-origin, malformed, excessive and invalid writes; fails closed unready',async()=>{
  const p={action:'rename',source:'Old',target:'New'};assert.strictEqual((await post(p,{Origin:'https://evil.example'})).status,403);
  assert.strictEqual((await post(p,{'Content-Type':'text/plain'})).status,415);
  for(const payload of [{...p,target:'Old'},{...p,source:' Old'},{...p,target:'<bad>'},{...p,action:'delete'},{}])assert.strictEqual((await post(payload)).status,400);
  assert.strictEqual((await post({...p,junk:'x'.repeat(5000)})).status,413);await runtime.db.prepare('UPDATE studio_catalog_state SET ready=0').run();assert.strictEqual((await get()).status,503);assert.strictEqual((await post(p)).status,503);
 });
 it('inherits management authentication for both read and write routes',async()=>{
  for(const method of ['GET','POST']){const context=makeContext({env,request:new Request('https://example.com/api/manage/tags',{method}),next:()=>{throw Error('Must not reach handler');}});assert.strictEqual((await auth[1](context)).status,401);}
 });
});
