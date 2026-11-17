import {overlayStudioMetadata} from '../../../utils/studio-metadata.js';
import {hasStudioD1,getStudioMediaFolders} from '../../../utils/studio-d1.js';
import {jsonResponse} from '../../../utils/http.js';
export async function onRequestGet({env,params}){
  const headers={'Cache-Control':'no-store'};
  if(!/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/.test(params.id))return jsonResponse({error:'Invalid media ID'},{status:400,headers});
  const current=await env.img_url.getWithMetadata(params.id);
  if(!current?.metadata)return jsonResponse({error:'Media not found'},{status:404,headers});
  const records=await overlayStudioMetadata(env,[{name:params.id,metadata:current.metadata}]);
  if(!records.length)return jsonResponse({error:'Media not found'},{status:404,headers});
  const record=records[0];
  if(hasStudioD1(env))record.metadata.folderId=(await getStudioMediaFolders(env.MEDIA_STUDIO_DB,[params.id])).get(params.id)||null;
  return jsonResponse({record},{headers});
}
