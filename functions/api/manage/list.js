import {overlayStudioMetadata} from '../../utils/studio-metadata.js';
import {hasStudioD1,getStudioMediaFolders} from '../../utils/studio-d1.js';
import { jsonResponse } from "../../utils/http.js";
import { isInternalKey } from "../../utils/kv-keys.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

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
  return jsonResponse({...value,keys},{headers:{'Cache-Control':'no-store'}});
}
