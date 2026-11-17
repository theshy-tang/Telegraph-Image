// Disposable local browser acceptance server. Uses real Pages handlers and Miniflare D1,
// in-memory fixture KV, and fixture-only login. No remote resources or credentials.
const http=require('http');const fs=require('fs');const path=require('path');
const {createStudioDB}=require('../studio-runtime');const {createMockKV}=require('../helpers');
(async()=>{
 const runtime=await createStudioDB();
 const env={BASIC_USER:'studio-test',BASIC_PASS:'local-test',MEDIA_STUDIO_DB:runtime.db,STORAGE_PROVIDER:'r2',img_r2:runtime.bucket,MEDIA_STUDIO_METADATA_D1:'true',SHOPIFY_AI_CATALOG_ENABLED:'true',img_url:createMockKV({'sample.jpg':{fileName:'Local sample.jpg',tags:['Fixture'],albums:[],liked:false,aiPublished:false,fileSize:100,TimeStamp:1700000000000}})};
 const manage=await import('../../functions/api/manage/_middleware.js');
 const collection=await import('../../functions/api/manage/folders.js');const detail=await import('../../functions/api/manage/folders/[id].js');
 const upload=await import('../../functions/api/manage/upload.js');
 const bulk=await import('../../functions/api/manage/bulk.js');const list=await import('../../functions/api/manage/list.js');const media=await import('../../functions/api/manage/media/[id].js');
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:8083');
   if(url.pathname.startsWith('/file/')){if(url.pathname.startsWith('/file/r2-')){const item=await runtime.bucket.get(decodeURIComponent(url.pathname.slice(6)));if(!item){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':item.httpMetadata?.contentType||'application/octet-stream'});res.end(Buffer.from(await item.arrayBuffer()));return;}res.writeHead(200,{'Content-Type':'image/png'});res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhT8AAAAASUVORK5CYII=','base64'));return;}
   if(!url.pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../../studio/index.html')));return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const id=decodeURIComponent(url.pathname.split('/').pop());let handler;
   if(url.pathname==='/api/manage/upload')handler=upload.onRequestPost;
   else if(url.pathname==='/api/manage/list')handler=list.onRequest;
   else if(url.pathname==='/api/manage/bulk')handler=bulk.onRequestPost;
   else if(url.pathname==='/api/manage/folders')handler=req.method==='GET'?collection.onRequestGet:collection.onRequestPost;
   else if(url.pathname.startsWith('/api/manage/folders/'))handler=req.method==='PATCH'?detail.onRequestPatch:detail.onRequestDelete;
   else if(url.pathname.startsWith('/api/manage/media/'))handler=media.onRequestGet;
   let stage=-1;const context={env,request,params:{id},data:{},next:async()=>{stage++;return stage<manage.onRequest.length?manage.onRequest[stage](context):handler?handler(context):new Response('Not found',{status:404});}};
   const response=await context.next();res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Local test service failed"}');}
 });
 server.listen(8083,'127.0.0.1',()=>console.log('Local fixture Studio: http://127.0.0.1:8083/studio/'));
 const stop=()=>server.close(async()=>{await runtime.dispose();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(error=>{console.error(error.message);process.exit(1);});
