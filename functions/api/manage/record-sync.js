import {syncPendingRecords} from '../../utils/studio-records.js';
import {jsonResponse} from '../../utils/http.js';
export async function onRequestPost({request,env}){
 const reply=(x,status=200)=>jsonResponse(x,{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Same-origin request required'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON required'},415);
 try{const reader=request.body?.getReader();if(!reader)return reply({error:'Confirmation required'},400);let size=0,text='';const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1000){await reader.cancel();return reply({error:'Request too large'},413);}text+=decoder.decode(r.value,{stream:true});}}finally{reader.releaseLock();}if(JSON.parse(text+decoder.decode())?.confirm!==true)return reply({error:'Confirmation required'},400);}catch{return reply({error:'Invalid JSON'},400);}
 try{return reply(await syncPendingRecords(env));}catch{return reply({error:'Legacy record sync unavailable'},503);}
}
