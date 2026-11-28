import {jsonResponse} from './http.js';
export const cutoverReadOnly=env=>env.MEDIA_STUDIO_CUTOVER_READ_ONLY==='true';
export const cutoverResponse=()=>jsonResponse({error:'Deployment cutover in progress; writes are temporarily paused',code:'CUTOVER_READ_ONLY'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
export function cutoverAllowsRead(request){
 if(!['GET','HEAD'].includes(request.method))return false;
 const path=new URL(request.url).pathname;
 return /^\/api\/manage\/(?:list|check|login|logout|folders|search|tags|catalog-sync|catalog-access)\/?$/.test(path)||/^\/api\/manage\/(?:media|download)\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path);
}
export function cutoverManagement(context){return cutoverReadOnly(context.env)&&!cutoverAllowsRead(context.request)?cutoverResponse():context.next();}
