// Disposable local browser acceptance server. Uses real Pages handlers and Miniflare D1,
// in-memory fixture KV, and fixture-only login. No remote resources or credentials.
const http=require('http');const fs=require('fs');const path=require('path');
const {createStudioDB}=require('../studio-runtime');const {createMockKV}=require('../helpers');
(async()=>{
 const runtime=await createStudioDB();const port=Number(process.env.STUDIO_FIXTURE_PORT||8083);
 const env={BASIC_USER:'studio-test',BASIC_PASS:'local-test',MEDIA_STUDIO_DB:runtime.db,STORAGE_PROVIDER:'r2',img_r2:runtime.bucket,MEDIA_STUDIO_METADATA_D1:'true',SHOPIFY_AI_CATALOG_ENABLED:'true',img_url:createMockKV({'sample.jpg':{fileName:'Local sample.jpg',tags:['Fixture'],albums:[],liked:false,aiPublished:false,fileSize:100,TimeStamp:1700000000000}})};
 await runtime.bucket.put('r2-download.png',new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhT8AAAAASUVORK5CYII=','base64')),{httpMetadata:{contentType:'image/png'}});
 await env.img_url.put('r2-download.png','',{metadata:{fileName:'Download fixture.png',tags:['Download'],albums:[],fileSize:68,TimeStamp:1700000000300}});
 const sync=await import('../../functions/api/manage/catalog-sync.js');
 const exported=await import('../../functions/api/manage/export.js');const download=await import('../../functions/api/manage/download/[id].js');
 const catalog=await import('../../functions/utils/studio-catalog.js');
 // A fixture beyond the first 100 KV records makes unloaded-result acceptance reproducible.
 for(let n=0;n<Number(process.env.STUDIO_FIXTURE_MEDIA_COUNT||105);n++)await env.img_url.put('fixture'+String(n).padStart(3,'0')+'.jpg','',{metadata:{fileName:'Fixture '+n,tags:['Fixture'],albums:[],TimeStamp:1700000000000+n}});
 await env.img_url.put('zzzzz_target.jpg','',{metadata:{fileName:'Unloaded target',tags:['Global-only'],albums:[],TimeStamp:1700000000200}});
 let seedCursor;do{const page=await env.img_url.list({limit:100,...(seedCursor?{cursor:seedCursor}:{})});const statements=page.keys.map(k=>{const m=catalog.catalogMetadata(k.metadata,k.name);return runtime.db.prepare('INSERT INTO studio_media_inventory VALUES (?,?,?,?,?)').bind(k.name,catalog.catalogType(k.name),m.TimeStamp,JSON.stringify(m),Date.now());});if(statements.length)await runtime.db.batch(statements);seedCursor=page.list_complete?null:page.cursor;}while(seedCursor);
 await runtime.db.prepare('UPDATE studio_catalog_state SET ready=1 WHERE id=1').run();
 await env.img_url.put('unindexed.jpg','',{metadata:{fileName:'Index repair fixture.jpg',tags:['Index-repair'],TimeStamp:1700000000400}});
 const search=await import('../../functions/api/manage/search.js');const tags=await import('../../functions/api/manage/tags.js');
 const manage=await import('../../functions/api/manage/_middleware.js');
 const collection=await import('../../functions/api/manage/folders.js');const detail=await import('../../functions/api/manage/folders/[id].js');
 const upload=await import('../../functions/api/manage/upload.js');
 const bulk=await import('../../functions/api/manage/bulk.js');const list=await import('../../functions/api/manage/list.js');const media=await import('../../functions/api/manage/media/[id].js');
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:'+port);
   if(url.pathname.startsWith('/file/')){if(url.pathname.startsWith('/file/r2-')){const item=await runtime.bucket.get(decodeURIComponent(url.pathname.slice(6)));if(!item){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':item.httpMetadata?.contentType||'application/octet-stream'});res.end(Buffer.from(await item.arrayBuffer()));return;}res.writeHead(200,{'Content-Type':'image/png'});res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhT8AAAAASUVORK5CYII=','base64'));return;}
   if(['/studio/export-utils.js','/studio/grid-window.js'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(fs.readFileSync(path.join(__dirname,'../..'+url.pathname)));return;}
   if(!url.pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../../studio/index.html')));return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const id=decodeURIComponent(url.pathname.split('/').pop());let handler;
   if(url.pathname==='/api/manage/catalog-sync')handler=req.method==='GET'?sync.onRequestGet:sync.onRequestPost;
   else if(url.pathname==='/api/manage/export')handler=exported.onRequestPost;
   else if(url.pathname.startsWith('/api/manage/download/'))handler=download.onRequestGet;
   else if(url.pathname==='/api/manage/tags')handler=req.method==='GET'?tags.onRequestGet:tags.onRequestPost;
   else if(url.pathname==='/api/manage/search')handler=search.onRequestGet;
   else if(url.pathname==='/api/manage/upload')handler=upload.onRequestPost;
   else if(url.pathname==='/api/manage/list')handler=list.onRequest;
   else if(url.pathname==='/api/manage/bulk')handler=bulk.onRequestPost;
   else if(url.pathname==='/api/manage/folders')handler=req.method==='GET'?collection.onRequestGet:collection.onRequestPost;
   else if(url.pathname.startsWith('/api/manage/folders/'))handler=req.method==='PATCH'?detail.onRequestPatch:detail.onRequestDelete;
   else if(url.pathname.startsWith('/api/manage/media/'))handler=media.onRequestGet;
   let stage=-1;const context={env,request,params:{id},data:{},next:async()=>{stage++;return stage<manage.onRequest.length?manage.onRequest[stage](context):handler?handler(context):new Response('Not found',{status:404});}};
   const response=await context.next();res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Local test service failed"}');}
 });
 server.listen(port,'127.0.0.1',()=>console.log('Local fixture Studio: http://127.0.0.1:'+port+'/studio/'));
 const stop=()=>server.close(async()=>{await runtime.dispose();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(error=>{console.error(error.message);process.exit(1);});
