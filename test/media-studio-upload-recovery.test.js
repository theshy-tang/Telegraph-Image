const assert=require('assert');const {createMockKV,makeContext}=require('./helpers');
function fixture(){const kv=createMockKV(),stored=[];return {stored,env:{BASIC_USER:'test',BASIC_PASS:'fixture',STORAGE_PROVIDER:'r2',img_url:kv,img_r2:{put:async(id)=>{stored.push(id)}}}};}
function request(){const data=new FormData();data.append('file',new File(['fixture'],'sample.png',{type:'image/png'}));return new Request('https://example.com/api/manage/upload',{method:'POST',headers:{Authorization:'Basic '+btoa('test:fixture'),Origin:'https://example.com'},body:data});}
describe('Studio upload registration error recovery',()=>{
 let handler;before(async()=>handler=(await import('../functions/api/manage/upload.js')).onRequestPost);
 it('keeps the original link and classifies a failed KV write without exposing provider exception text',async()=>{const f=fixture();f.env.img_url.put=async()=>{throw Error('KV put() limit exceeded private-provider-secret')};
  const r=await handler(makeContext({env:f.env,request:request()})),body=await r.json();assert.strictEqual(r.status,503);assert.strictEqual(body.code,'MEDIA_KV_WRITE_LIMIT');assert.strictEqual(body.recovery.id,f.stored[0]);assert.strictEqual(body.recovery.src,'/file/'+f.stored[0]);assert.ok(!JSON.stringify(body).includes('private-provider-secret'));
 });
 it('distinguishes catalog failure after a successful original record write',async()=>{const f=fixture();f.env.MEDIA_STUDIO_METADATA_D1='true';f.env.MEDIA_STUDIO_DB={prepare(){return {first:async()=>({ready:1}),bind(){return this},run:async()=>{throw Error('private-database-detail')}}}};
  const r=await handler(makeContext({env:f.env,request:request()})),body=await r.json();assert.strictEqual(body.code,'MEDIA_CATALOG_WRITE_FAILED');assert.ok(f.env.img_url.snapshot(f.stored[0]));assert.ok(body.recovery.id);assert.ok(!JSON.stringify(body).includes('private-database-detail'));
 });
 it('does not invent a recovery link when the provider upload itself failed',async()=>{const f=fixture();f.env.img_r2.put=async()=>{throw Error('private-provider-detail')};const r=await handler(makeContext({env:f.env,request:request()})),body=await r.json();assert.strictEqual(r.status,503);assert.strictEqual(body.recovery,undefined);assert.ok(!JSON.stringify(body).includes('private-provider-detail'));
 });
});
