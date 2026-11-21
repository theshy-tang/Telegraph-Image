import {getMetadata,isBlocked,isWhitelisted} from '../../../utils/metadata.js';
import {getServingProvider} from '../../../storage/index.js';
import {CATALOG_FILE} from '../../../utils/studio-catalog.js';
import {jsonResponse} from '../../../utils/http.js';
const fail=(error,status,code='DOWNLOAD_UNAVAILABLE',extra={})=>jsonResponse({error,code,...extra},{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({request,env,params}){
 const id=params.id||'';if(!CATALOG_FILE.test(id))return fail('Invalid media ID',400,'INVALID_MEDIA_ID');
 try{
  const m=await getMetadata(env,id);if(!m)return fail('Media not found',404,'MEDIA_NOT_FOUND');
  if(isBlocked(m)||(env.WhiteList_Mode==='true'&&!isWhitelisted(m)))return fail('Media download restricted',403,'MEDIA_RESTRICTED');
  const current=new URL(request.url),preview=current.hostname.endsWith('.my-image-bed.pages.dev');
  const origin=preview?'https://my-image-bed.pages.dev':current.origin;
  const url=new URL('/file/'+encodeURIComponent(id),origin);
  // Never forward management credentials, cookies, request query strings or provider errors.
  const clean=new Request(url,{headers:{Accept:'application/octet-stream'},signal:request.signal});
  let source;
  if(preview){
   // Workers supports manual/follow, not the Fetch-standard error mode.
   // Inspect redirects ourselves; never follow Location or forward credentials.
   try{source=await fetch(clean,{redirect:'manual'});}catch{return fail('Original media request failed',502,'SOURCE_FETCH_FAILED');}
  }
  else if(id.startsWith('r2-')){const object=await env.img_r2?.get(id);if(!object)return fail('Original media unavailable',502);source=new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Content-Length':String(object.size)}});}
  else source=await getServingProvider(id).fetchFile(env,clean,url,id);
  if(source.status>=300&&source.status<400){await source.body?.cancel();return fail('Original media redirected; redirect was not followed',502,'SOURCE_REDIRECT');}
  if(source.status!==200){await source.body?.cancel();return fail('Original media unavailable',502,'SOURCE_HTTP_ERROR',{upstreamStatus:source.status});}
  if(/text\/html|application\/json/i.test(source.headers.get('Content-Type')||'')){await source.body?.cancel();return fail('Original source did not return media',502,'SOURCE_NOT_MEDIA');}
  const ext=id.slice(id.lastIndexOf('.'));let stem=String(m.fileName||id).replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f-\u009f/\\:*?"<>|]/g,'_').replace(/[. ]+$/g,'');
  stem=Array.from(stem).slice(0,120).join('')||'media';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem.split('.')[0]))stem='_'+stem;
  const name=stem+ext,encoded=encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  const headers=new Headers({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="media${ext}"; filename*=UTF-8''${encoded}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});
  const size=source.headers.get('Content-Length');if(size&&/^\d+$/.test(size))headers.set('Content-Length',size);
  return new Response(source.body,{headers});
 }catch{return fail('Download temporarily unavailable',502);}
}
