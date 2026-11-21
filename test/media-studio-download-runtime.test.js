const assert=require('assert'),path=require('path'),fs=require('fs');const {Miniflare,Response:WorkerResponse}=require('miniflare');const {build}=require('esbuild');
describe('Studio download in the actual Workers runtime',function(){
 this.timeout(30000);let runtime,requests=[];let sourceStatus=200;
 before(async()=>{
  const code=(await build({stdin:{contents:"import {onRequestGet} from './functions/api/manage/download/[id].js'; export default {fetch(request,env){return onRequestGet({request,env,params:{id:'sample.jpg'}});}};",resolveDir:path.join(__dirname,'..'),sourcefile:'download-runtime-entry.js'},bundle:true,format:'esm',platform:'browser',write:false,absWorkingDir:path.join(__dirname,'..'),plugins:[{name:'workspace-js',setup(b){
   // Resolve this relative-only handler graph without scanning host parent dirs.
   b.onResolve({filter:/^\./},args=>({path:path.resolve(args.resolveDir,args.path),namespace:'studio-source'}));
   b.onLoad({filter:/\.js$/,namespace:'studio-source'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'js',resolveDir:path.dirname(args.path)}));
  }}]})).outputFiles[0].text;
  runtime=new Miniflare({modules:true,compatibilityDate:'2026-11-16',script:code,kvNamespaces:['img_url'],outboundService:request=>{requests.push({url:request.url,auth:request.headers.get('Authorization'),cookie:request.headers.get('Cookie')});return sourceStatus===200?new WorkerResponse(Uint8Array.from([0,1,2,255]),{headers:{'Content-Type':'image/jpeg'}}):new WorkerResponse(null,{status:302,headers:{Location:'https://not-followed.example/private-source'}});}});
  const kv=await runtime.getKVNamespace('img_url');await kv.put('sample.jpg','private-reference',{metadata:{fileName:'Runtime sample.jpg',fileSize:4}});
 });after(async()=>{if(runtime)await runtime.dispose();});
 it('streams original bytes on Preview using a Workers-supported redirect mode',async()=>{
  sourceStatus=200;requests=[];const r=await runtime.dispatchFetch('https://fixture.my-image-bed.pages.dev/api/manage/download/sample.jpg?private=query',{headers:{Authorization:'Basic fixture-only',Cookie:'fixture-cookie'}});
  assert.strictEqual(r.status,200,await r.clone().text());assert.deepStrictEqual(Array.from(new Uint8Array(await r.arrayBuffer())),[0,1,2,255]);assert.match(r.headers.get('Content-Disposition'),/^attachment;/);assert.strictEqual(requests.length,1);assert.strictEqual(requests[0].url,'https://my-image-bed.pages.dev/file/sample.jpg');assert.strictEqual(requests[0].auth,null);assert.strictEqual(requests[0].cookie,null);
 });
 it('rejects upstream redirects in Workers and never fetches the destination',async()=>{
  sourceStatus=302;requests=[];const r=await runtime.dispatchFetch('https://fixture.my-image-bed.pages.dev/api/manage/download/sample.jpg');assert.strictEqual(r.status,502);const data=await r.json();assert.strictEqual(data.code,'SOURCE_REDIRECT');assert.strictEqual(requests.length,1);assert.ok(!JSON.stringify(data).includes('private-source'));
 });
});
