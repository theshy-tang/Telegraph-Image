import {recordsReady,registerStudioRecord,sourceRecord} from '../../utils/studio-records.js';
import {CATALOG_FILE,catalogType} from '../../utils/studio-catalog.js';
import {jsonResponse} from '../../utils/http.js';
const reply=(x,status=200)=>jsonResponse(x,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Same-origin recovery required'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON required'},415);
 let p;try{const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid recovery'},400);let n=0,text='';const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.byteLength;if(n>4096){await reader.cancel();return reply({error:'Recovery request too large'},413);}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}p=JSON.parse(text);}catch{return reply({error:'Invalid recovery'},400);}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['id','fileName','confirm'].includes(k))||p.confirm!==true||typeof p.id!=='string'||!CATALOG_FILE.test(p.id)||catalogType(p.id)==='other'||typeof p.fileName!=='string'||!p.fileName.trim()||p.fileName.length>200||/[\u0000-\u001f\u007f]/.test(p.fileName))return reply({error:'Confirm a valid media ID and filename'},400);
 try{
  if(!await recordsReady(env))return reply({error:'Durable registration is not enabled'},503);
  const deleted=await env.MEDIA_STUDIO_DB.prepare('SELECT deleted FROM studio_media_metadata WHERE media_id=?').bind(p.id).first();if(deleted?.deleted)return reply({error:'Deleted records need explicit restoration'},409);
  const existing=await sourceRecord(env,p.id);
  let metadata=existing?.metadata;
  if(!metadata){
   const current=new URL(request.url),origin=current.hostname.endsWith('.my-image-bed.pages.dev')?'https://my-image-bed.pages.dev':current.origin;
   const url=new URL('/file/'+encodeURIComponent(p.id),origin);
   let response;try{response=await fetch(url,{method:'HEAD',redirect:'manual',headers:{Accept:'image/*,video/*'},signal:AbortSignal.timeout(15000)});}catch{return reply({error:'Original media could not be verified; no record written'},502);}
   if(response.status!==200||! /^(image|video)\//i.test(response.headers.get('Content-Type')||''))return reply({error:'Original media could not be verified; no record written'},502);
   const bytes=Number(response.headers.get('Content-Length'));
   metadata={fileName:p.fileName.trim(),fileSize:Number.isSafeInteger(bytes)&&bytes>=0?bytes:0,TimeStamp:Date.now(),ListType:'None',Label:'None',liked:false,aiPublished:false,provider:p.id.startsWith('r2-')?'r2':'telegram'};
  }
  const saved=await registerStudioRecord(env,p.id,metadata);
  return reply({record:{name:p.id,metadata:saved.metadata},registration:{source:'d1',kvPending:saved.kvPending}});
 }catch{return reply({error:'Recovery registration failed; original file unchanged'},503);}
}
