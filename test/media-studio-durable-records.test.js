const assert=require('assert');const {createSQLiteD1}=require('./sqlite-d1');const {createMockKV,makeContext,installFetchMock}=require('./helpers');
function fixture(){const runtime=createSQLiteD1(),objects=new Map(),kv=createMockKV();const env={BASIC_USER:'test',BASIC_PASS:'fixture',MEDIA_STUDIO_DB:runtime.db,MEDIA_STUDIO_METADATA_D1:'true',SHOPIFY_AI_CATALOG_ENABLED:'true',STORAGE_PROVIDER:'r2',img_url:kv,img_r2:{async put(id,bytes,options){objects.set(id,{bytes,options})},async get(id){const o=objects.get(id);return o?{body:o.bytes,size:o.bytes.byteLength,httpMetadata:o.options?.httpMetadata}:null}}};kv.put=async()=>{throw Error('KV put() daily limit exceeded')};return {...runtime,env,objects};}
const json=(payload,path='/api/manage/bulk')=>new Request('https://example.com'+path,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(payload)});
const m={fileName:'sample.png',TimeStamp:1700000000000,fileSize:7,ListType:'None',Label:'None',liked:false,aiPublished:false,tags:[],albums:[],provider:'telegram'};
describe('Studio durable D1 registrations while KV writes are rejected',()=>{
 let records,metadata,upload,details,bulk,exporter,download,listing,catalog,sync,recover;
 before(async()=>{records=await import('../functions/utils/studio-records.js');metadata=await import('../functions/utils/metadata.js');upload=(await import('../functions/api/manage/upload.js')).onRequestPost;details=(await import('../functions/api/manage/media/[id].js')).onRequestGet;bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;exporter=(await import('../functions/api/manage/export.js')).onRequestPost;download=(await import('../functions/api/manage/download/[id].js')).onRequestGet;listing=(await import('../functions/api/manage/list.js')).onRequest;catalog=(await import('../functions/api/shopify-assets.js')).onRequest;sync=(await import('../functions/api/manage/catalog-sync.js')).onRequestPost;recover=(await import('../functions/api/manage/recover-upload.js')).onRequestPost;});
 it('confirms a fixture provider upload only after all D1 records exist, then supports detail/edit/export/download without KV',async()=>{const f=fixture();try{
  const data=new FormData();data.append('file',new File(['fixture'],'sample.png',{type:'image/png'}));
  const request=new Request('https://example.com/api/manage/upload',{method:'POST',headers:{Origin:'https://example.com',Authorization:'Basic '+btoa('test:fixture')},body:data});
  const r=await upload(makeContext({env:f.env,request}));assert.strictEqual(r.status,200);const [result]=await r.json(),id=result.record.name;assert.strictEqual(result.registration.kvPending,true);assert.strictEqual(f.env.img_url.snapshot(id),undefined);
  for(const table of ['studio_media_records','studio_media_metadata','studio_media_inventory'])assert.strictEqual(f.sql.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1);
  assert.strictEqual((await details(makeContext({env:f.env,params:{id}}))).status,200);
  const changed=await bulk(makeContext({env:f.env,request:json({action:'add_tags',ids:[id],names:['Keep']})}));assert.strictEqual((await changed.json()).success,1);
  assert.deepStrictEqual((await metadata.getMetadata(f.env,id)).tags,['Keep']);
  const exported=await (await exporter(makeContext({env:f.env,request:json({ids:[id]},'/api/manage/export')}))).json();assert.strictEqual(exported.records[0].id,id);
  const file=await download(makeContext({env:f.env,params:{id},request:new Request('https://example.com/api/manage/download/'+id)}));assert.strictEqual(file.status,200);assert.strictEqual(await file.text(),'fixture');
  const page=await (await listing(makeContext({env:f.env,request:new Request('https://example.com/api/manage/list?order=new')}))).json();assert.strictEqual(page.keys[0].name,id);
 }finally{f.close();}});
 it('persists pixel dimensions and filters only published images by tag and size',async()=>{
  const f=fixture();
  try{
   await records.registerStudioRecord(f.env,'sample.png',m);
   const edit={action:'edit_details',ids:['sample.png'],metadataVersion:0,fileName:'Sample',category:'',tags:['Banner'],width:1920,height:1080};
   const changed=await bulk(makeContext({env:f.env,request:json(edit)}));
   assert.strictEqual((await changed.json()).results[0].metadata.width,1920);
   const search=async query=>(await (await catalog(makeContext({env:f.env,request:new Request('https://example.com/api/shopify-assets?cursor=records%3A&'+query)}))).json()).items;
   assert.deepStrictEqual(await search('tag=banner&min_width=1920'),[]);
   await bulk(makeContext({env:f.env,request:json({action:'publish',ids:['sample.png']})}));
   const [item]=await search('tag=banner&min_width=1920&min_height=1080');
   assert.strictEqual(item.height,1080);
   assert.deepStrictEqual(await search('tag=banner&min_width=1921'),[]);
   assert.deepStrictEqual(await search('tag=product'),[]);
  }finally{f.close();}
 });
 it('rolls back all registration writes if inventory fails',async()=>{const f=fixture();try{f.sql.exec("CREATE TRIGGER fail_inventory BEFORE INSERT ON studio_media_inventory BEGIN SELECT RAISE(ABORT,'fixture failure'); END");await assert.rejects(()=>records.registerStudioRecord(f.env,'sample.png',m));assert.strictEqual(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_media_records').get().n,0);assert.strictEqual(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_media_metadata').get().n,0);}finally{f.close();}});
 it('keeps D1 edits and moderation authoritative across reupload, KV synchronization and stale catalog scans',async()=>{const f=fixture();try{
  await records.registerStudioRecord(f.env,'sample.png',m);const sm=await import('../functions/utils/studio-metadata.js');await sm.mutateStudioMetadata(f.db,'sample.png',m,x=>({...x,fileName:'Edited',description:'private note',tags:['Keep']}));
  await metadata.updateMetadata(f.env,'sample.png',x=>({...x,ListType:'Block'}));const again=await records.registerStudioRecord(f.env,'sample.png',{...m,fileName:'New'});assert.strictEqual(again.metadata.fileName,'Edited');assert.strictEqual(again.metadata.ListType,'Block');assert.strictEqual(again.metadata.metadataVersion,1);
  let copied;f.env.img_url.put=async(id,value,options)=>{copied=options.metadata};assert.strictEqual((await records.syncPendingRecords(f.env)).pending,0);assert.strictEqual(copied.ListType,'Block');assert.ok(!Object.hasOwn(copied,'description'));
  f.env.img_url.getWithMetadata=async()=>({value:'',metadata:m});f.env.img_url.list=async()=>({keys:[{name:'sample.png',metadata:m}],list_complete:true});
  const response=await sync(makeContext({env:f.env,request:json({cursor:null},'/api/manage/catalog-sync')}));assert.strictEqual(response.status,200);assert.strictEqual(JSON.parse(f.sql.prepare('SELECT metadata FROM studio_media_inventory').get().metadata).ListType,'Block');
 }finally{f.close();}});
 it('publishes D1-only records only by explicit opt-in and checks fresh legacy moderation',async()=>{const f=fixture();try{
  await records.registerStudioRecord(f.env,'sample.png',m);const get=async()=>{const all=[];let cursor;do{const request=new Request('https://example.com/api/shopify-assets'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),page=await (await catalog(makeContext({env:f.env,request}))).json();all.push(...page.items);cursor=page.next_cursor;}while(cursor);return {count:all.length,items:all};};assert.strictEqual((await get()).count,0);
  const sm=await import('../functions/utils/studio-metadata.js');await sm.mutateStudioMetadata(f.db,'sample.png',m,x=>({...x,aiPublished:true,prompt:'private'}));let result=await get();assert.strictEqual(result.count,1);assert.ok(!JSON.stringify(result).includes('private'));
  await metadata.updateMetadata(f.env,'sample.png',x=>({...x,ListType:'Block'}));assert.strictEqual((await get()).count,0);
  f.sql.prepare('INSERT INTO studio_media_inventory VALUES (?,?,?,?,?)').run('legacy.png','image',1,JSON.stringify({...m,aiPublished:true}),1);
  f.env.img_url.list=async()=>({keys:[{name:'legacy.png',metadata:{...m,aiPublished:true,ListType:'Block'}}],list_complete:true});assert.strictEqual((await get()).count,0);
 }finally{f.close();}});
 it('never resurrects a deleted record or syncs its legacy copy',async()=>{const f=fixture();try{await records.registerStudioRecord(f.env,'sample.png',m);const sm=await import('../functions/utils/studio-metadata.js');await sm.markStudioMediaDeleted(f.db,'sample.png',m);await assert.rejects(()=>records.registerStudioRecord(f.env,'sample.png',m));assert.strictEqual(await metadata.getMetadata(f.env,'sample.png'),null);assert.strictEqual((await records.syncPendingRecords(f.env)).synced,0);const r=await recover(makeContext({env:f.env,request:json({id:'sample.png',fileName:'sample.png',confirm:true},'/api/manage/recover-upload')}));assert.strictEqual(r.status,409);}finally{f.close();}});
 it('recovers one verified original link using HEAD only, without forwarding auth or fetching arbitrary URLs',async()=>{const f=fixture();let mock;try{
  mock=installFetchMock(async(url,init)=>{assert.strictEqual(String(url),'https://example.com/file/sample.png');assert.strictEqual(init.method,'HEAD');assert.strictEqual(init.headers.Authorization,undefined);return new Response(null,{headers:{'Content-Type':'image/png','Content-Length':'7'}})});
  const r=await recover(makeContext({env:f.env,request:json({id:'sample.png',fileName:'Recovered.png',confirm:true},'/api/manage/recover-upload')}));assert.strictEqual(r.status,200);const result=await r.json();assert.strictEqual(result.registration.kvPending,true);assert.strictEqual(result.record.metadata.fileName,'Recovered.png');assert.strictEqual(mock.calls.length,1);
  const bad=await recover(makeContext({env:f.env,request:json({id:'https://evil.invalid/file.png',fileName:'x',confirm:true},'/api/manage/recover-upload')}));assert.strictEqual(bad.status,400);assert.strictEqual(mock.calls.length,1);
 }finally{mock?.restore();f.close();}});
 it('requires verification success before creating any recovery record',async()=>{const f=fixture();const mock=installFetchMock(async()=>new Response(null,{status:302,headers:{Location:'https://evil.invalid'}}));try{const r=await recover(makeContext({env:f.env,request:json({id:'sample.png',fileName:'Recovered.png',confirm:true},'/api/manage/recover-upload')}));assert.strictEqual(r.status,502);assert.strictEqual(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_media_records').get().n,0);}finally{mock.restore();f.close();}});
 it('preserves existing raw KV values and lists mirrored D1 items only once in the public catalog',async()=>{const f=fixture();try{
  const kv=createMockKV({'sample.png':{value:'preserve-original-value',metadata:m}});f.env.img_url=kv;
  await records.registerStudioRecord(f.env,'sample.png',m);assert.strictEqual(kv.snapshot('sample.png').value,'preserve-original-value');
  const sm=await import('../functions/utils/studio-metadata.js');await sm.mutateStudioMetadata(f.db,'sample.png',m,x=>({...x,aiPublished:true}));
  const items=[];let cursor;do{const page=await (await catalog(makeContext({env:f.env,request:new Request('https://example.com/api/shopify-assets?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''))}))).json();items.push(...page.items);cursor=page.next_cursor;}while(cursor);
  assert.strictEqual(items.length,1);assert.strictEqual(items[0].url,'https://example.com/file/sample.png');
 }finally{f.close();}});
 it('rejects missing recovery confirmation and cross-origin requests before verification',async()=>{const f=fixture();try{
  const missing=await recover(makeContext({env:f.env,request:json({id:'sample.png',fileName:'sample.png'},'/api/manage/recover-upload')}));assert.strictEqual(missing.status,400);
  const foreign=json({id:'sample.png',fileName:'sample.png',confirm:true},'/api/manage/recover-upload');foreign.headers.set('Origin','https://evil.invalid');assert.strictEqual((await recover(makeContext({env:f.env,request:foreign}))).status,403);
 }finally{f.close();}});

});
