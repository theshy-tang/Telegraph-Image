const assert=require('assert');const fs=require('fs');const path=require('path');const {createMockKV,makeContext}=require('./helpers');const {createStudioDB}=require('./studio-runtime');
const {createSQLiteD1}=require('./sqlite-d1');
const auth='Basic '+btoa('admin:fixture-only');
function uploadRequest(file,{authorization=auth,origin='https://example.com',url='https://example.com/api/manage/upload',tags=[]}={}){
 const body=new FormData();if(file!==undefined)body.set('file',file);
 for(const value of tags)body.append('tags',value);
 return new Request(url,{method:'POST',headers:{...(authorization?{Authorization:authorization}:{}),...(origin?{Origin:origin}:{})},body});
}
function fixture(){const puts=[];return {puts,env:{BASIC_USER:'admin',BASIC_PASS:'fixture-only',STORAGE_PROVIDER:'r2',img_r2:{async put(...args){puts.push(args);}},img_url:createMockKV()}};}
describe('Studio authenticated upload channel',function(){
 this.timeout(30000);let handler,root;
 before(async()=>{handler=(await import('../functions/api/manage/upload.js')).onRequestPost;root=(await import('../functions/upload.js')).onRequestPost;});
 it('rejects missing or wrong admin credentials before any storage writes',async()=>{
  const {env,puts}=fixture();for(const authorization of [null,'Basic '+btoa('admin:wrong')]){const r=await handler(makeContext({env,request:uploadRequest(new File(['a'],'a.png'),{authorization})}));assert.strictEqual(r.status,401);}assert.strictEqual(puts.length,0);
 });
 it('fails closed for missing admin configuration and cross-origin requests',async()=>{
  const {env,puts}=fixture();delete env.BASIC_PASS;
  assert.strictEqual((await handler(makeContext({env,request:uploadRequest(new File(['a'],'a.png'))}))).status,503);
  env.BASIC_PASS='fixture-only';for(const origin of [null,'https://evil.example'])assert.strictEqual((await handler(makeContext({env,request:uploadRequest(new File(['a'],'a.png'),{origin})}))).status,403);
  assert.strictEqual(puts.length,0);
 });
 it('uses admin login independently of dedicated legacy credentials and returns a confirmed record',async()=>{
  const {env,puts}=fixture();env.UPLOAD_BASIC_USER='other';env.UPLOAD_BASIC_PASS='other-fixture';env.UPLOAD_AUTH_MODE='dedicated';env.ENABLE_SHORT_URLS='true';
  const response=await handler(makeContext({env,request:uploadRequest(new File(['png-fixture'],'fixture.png',{type:'image/png'}))}));
  assert.strictEqual(response.status,200);const [result]=await response.json();assert.ok(result.src.startsWith('/file/'));assert.match(result.record.name,/^r2-/);assert.strictEqual(result.record.metadata.liked,false);assert.strictEqual(result.record.metadata.aiPublished,false);assert.strictEqual(puts.length,1);assert.strictEqual(env.UPLOAD_AUTH_MODE,'dedicated');
  assert.ok(env.img_url.snapshot(result.record.name));assert.ok(result.record.metadata.shortId);
 });
 it('validates and stores Studio tags with the media even on the KV-only fallback',async()=>{
  const {env,puts}=fixture(),file=new File(['a'],'a.png');
  for(const tags of [
   ['{'],['["valid",42]'],['[" "]'],['["<bad>"]'],['[]','[]'],[new File(['[]'],'tags.json')],
   [JSON.stringify(Array(31).fill('tag'))],[JSON.stringify(['x'.repeat(49)])],
   [JSON.stringify(Array.from({length:30},(_,i)=>'长'.repeat(46)+i))]
  ]){
   const response=await handler(makeContext({env,request:uploadRequest(file,{tags})}));
   assert.strictEqual(response.status,400);
  }
  assert.strictEqual(puts.length,0);
  const response=await handler(makeContext({env,request:uploadRequest(file,{tags:['[" 湖畔 ","横幅","湖畔"]']})}));
  assert.strictEqual(response.status,200);
  const [{record}]=await response.json();
  assert.deepStrictEqual(record.metadata.tags,['湖畔','横幅']);
  assert.deepStrictEqual(env.img_url.snapshot(record.name).metadata.tags,['湖畔','横幅']);
 });
 it('registers tags in versioned D1 metadata and the search index if the KV mirror fails',async()=>{
  const runtime=createSQLiteD1();
  try{
   const {env}=fixture();
   env.MEDIA_STUDIO_DB=runtime.db;env.MEDIA_STUDIO_METADATA_D1='true';
   env.img_url.put=async()=>{throw Error('KV temporarily unavailable');};
   const response=await handler(makeContext({env,request:uploadRequest(new File(['a'],'湖畔.png'),{tags:['["湖畔","暮色"]']})}));
   assert.strictEqual(response.status,200);
   const [{record,registration}]=await response.json();
   assert.deepStrictEqual(record.metadata.tags,['湖畔','暮色']);
   assert.strictEqual(record.metadata.metadataVersion,0);
   assert.strictEqual(record.metadata.aiPublished,false);
   assert.strictEqual(registration.kvPending,true);
   const search=(await import('../functions/api/manage/search.js')).onRequestGet;
   const url=new URL('https://example.com/api/manage/search');
   url.searchParams.set('tag','暮色');
   const result=await (await search(makeContext({env,request:new Request(url)}))).json();
   assert.ok(result.keys.some(item=>item.name===record.name&&item.metadata.tags.includes('暮色')));
  }finally{runtime.close();}
 });
 it('rejects empty, unsafe-extension, oversized and malformed uploads without storage writes',async()=>{
  const {env,puts}=fixture();env.STUDIO_MAX_UPLOAD_BYTES='8';
  for(const [file,status] of [[undefined,400],[new File([],'empty.png'),400],[new File(['svg'],'a.svg'),415],[new File(['a'],'a.txt'),415],[new File(['123456789'],'a.png'),413]])assert.strictEqual((await handler(makeContext({env,request:uploadRequest(file)}))).status,status);
  const bad=new Request('https://example.com/api/manage/upload',{method:'POST',headers:{Authorization:auth,Origin:'https://example.com','Content-Type':'application/json'},body:'{}'});assert.strictEqual((await handler(makeContext({env,request:bad}))).status,415);assert.strictEqual(puts.length,0);
 });
 it('caps the streamed body even if Content-Length is understated',async()=>{
  const {env,puts}=fixture();env.STUDIO_MAX_UPLOAD_BYTES='1';
  const request=new Request('https://example.com/api/manage/upload',{method:'POST',duplex:'half',headers:{Authorization:auth,Origin:'https://example.com','Content-Type':'multipart/form-data; boundary=test','Content-Length':'1'},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(70000));c.close();}})});
  assert.strictEqual((await handler(makeContext({env,request}))).status,413);assert.strictEqual(puts.length,0);
 });
 it('does not disclose provider errors through the admin upload response',async()=>{
  const {env}=fixture();env.img_r2.put=async()=>{throw Object.assign(Error('private-provider-reference'),{status:400});};
  const r=await handler(makeContext({env,request:uploadRequest(new File(['a'],'a.png'))}));assert.strictEqual(r.status,503);assert.ok(!(await r.text()).includes('private-provider-reference'));
 });
 it('supports D1 versioned editing immediately after upload',async()=>{
  const runtime=await createStudioDB();try{
   const {env}=fixture();env.img_r2=runtime.bucket;env.MEDIA_STUDIO_DB=runtime.db;env.MEDIA_STUDIO_METADATA_D1='true';
   await runtime.db.prepare('UPDATE studio_catalog_state SET ready=1').run();
   const response=await handler(makeContext({env,request:uploadRequest(new File(['a'],'a.png'))}));
   assert.strictEqual(response.status,200);
   const [result]=await response.json();assert.strictEqual(result.record.metadata.metadataVersion,0);
   assert.strictEqual(await (await runtime.bucket.get(result.record.name)).text(),'a');
   const bulk=(await import('../functions/api/manage/bulk.js')).onRequestPost;
   const request=new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({action:'edit_details',ids:[result.record.name],fileName:'New',category:'',tags:['New'],metadataVersion:0})});
   assert.strictEqual((await (await bulk(makeContext({env,request}))).json()).success,1);
   assert.strictEqual(env.img_url.snapshot(result.record.name).metadata.liked,false);
  }finally{await runtime.dispose();}
 });
 it('allows native admin-mode uploads without Origin while refusing anonymous requests',async()=>{
  const {env,puts}=fixture();env.UPLOAD_AUTH_MODE='admin';
  assert.strictEqual((await root(makeContext({env,request:uploadRequest(new File(['doc'],'notes.txt'),{authorization:null,origin:null})}))).status,401);
  const response=await root(makeContext({env,request:uploadRequest(new File(['doc'],'notes.txt'),{origin:null,tags:['["Studio only"]']})}));
  assert.strictEqual(response.status,200);assert.strictEqual(puts.length,1);
  const [{src}]=await response.json();
  assert.strictEqual(env.img_url.snapshot(src.slice('/file/'.length)).metadata.tags,undefined);
 });
 it('explicit dedicated or unknown modes never silently become public',async()=>{
  const {env,puts}=fixture();delete env.UPLOAD_BASIC_USER;delete env.UPLOAD_BASIC_PASS;
  for(const mode of ['dedicated','typo']){env.UPLOAD_AUTH_MODE=mode;assert.strictEqual((await root(makeContext({env,request:uploadRequest(new File(['a'],'a.png'))}))).status,503);}assert.strictEqual(puts.length,0);
 });
 it('reports configured upload protection without exposing credentials',async()=>{
  const config=(await import('../functions/api/config.js')).onRequestGet;
  const {env}=fixture();env.UPLOAD_AUTH_MODE='admin';const body=await (await config(makeContext({env}))).json();assert.strictEqual(body.uploadRequiresAuth,true);assert.ok(!JSON.stringify(body).includes('fixture-only'));
 });
});
