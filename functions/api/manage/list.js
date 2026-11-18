import {onRequestGet as searchLibrary} from './search.js';
import {catalogStatus} from '../../utils/studio-catalog.js';
import {overlayStudioMetadata} from '../../utils/studio-metadata.js';
import {hasStudioD1,getStudioMediaFolders} from '../../utils/studio-d1.js';
import { jsonResponse } from "../../utils/http.js";
import { isInternalKey } from "../../utils/kv-keys.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Studio explicitly requests library-wide order; old clients keep KV cursors.
  const order=url.searchParams.get('order');
  if(order!==null&&!['new','old','name'].includes(order))return jsonResponse({error:'Invalid list order'},{status:400});
  const ready=Boolean((await catalogStatus(env))?.ready);
  if(order!==null&&ready){
    if(url.searchParams.has('prefix'))return jsonResponse({error:'Prefix is not supported with ordered listing'},{status:400});
    const search=new URL('/api/manage/search',url.origin);
    for(const key of ['order','limit','cursor'])if(url.searchParams.has(key))search.searchParams.set(key,url.searchParams.get(key));
    const response=await searchLibrary({request:new Request(search,{headers:request.headers}),env});
    if(!response.ok)return response;
    return jsonResponse({...await response.json(),catalogReady:true,orderScope:'library'},{headers:{'Cache-Control':'no-store'}});
  }
  const raw = url.searchParams.get("limit");
  let limit = parseInt(raw || "100", 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  if (limit > 1000) limit = 1000;

  const cursor = url.searchParams.get("cursor") || undefined;
  const prefix = url.searchParams.get("prefix") || undefined;
  const value = await env.img_url.list({ limit, cursor, prefix });

  const keys=await overlayStudioMetadata(env,value.keys.filter(key => !isInternalKey(key.name)));
  if(hasStudioD1(env)){
    const memberships=await getStudioMediaFolders(env.MEDIA_STUDIO_DB,keys.map(k=>k.name));
    // D1 is authoritative: missing mapping means unfiled, even if KV has an
    // older folderId from before the migration.
    for(const key of keys){
      key.metadata={...(key.metadata||{}),folderId:memberships.get(key.name)||null};
    }
  }
  return jsonResponse({...value,keys,orderScope:'loaded',...(ready?{catalogReady:true}:{})},{headers:{'Cache-Control':'no-store'}});
}
