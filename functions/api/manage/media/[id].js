import {sourceRecord} from '../../../utils/studio-records.js';
import {imageDimensions,metadataD1Enabled,overlayStudioMetadata,recordImageDimensions} from '../../../utils/studio-metadata.js';
import {hasStudioD1,getStudioMediaFolders} from '../../../utils/studio-d1.js';
import {jsonResponse} from '../../../utils/http.js';
const imageId=/^[A-Za-z0-9_-]{5,300}\.(?:jpe?g|png|gif|webp|bmp|tiff?|ico|avif|apng)$/i;

export async function onRequestPost({request,env,params}){
  const reply=(body,status=200)=>jsonResponse(body,{status,headers:{'Cache-Control':'no-store'}});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'Cross-origin writes are forbidden'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON request required'},415);
  if(!imageId.test(params.id))return reply({error:'Invalid image ID'},400);
  let dimensions;
  try{
    const body=await request.text();
    if(body.length>256)return reply({error:'Request too large'},413);
    dimensions=imageDimensions(JSON.parse(body));
  }catch{return reply({error:'Invalid image dimensions'},400);}
  if(!dimensions.width)return reply({error:'Invalid image dimensions'},400);
  if(!metadataD1Enabled(env))return reply({error:'Image dimensions require D1 metadata storage'},503);
  const current=await sourceRecord(env,params.id);
  if(!current?.metadata)return reply({error:'Media not found'},404);
  try{
    return reply(await recordImageDimensions(env.MEDIA_STUDIO_DB,params.id,current.metadata,dimensions));
  }catch(error){
    if(error?.code==='MEDIA_DELETED')return reply({error:'Media not found'},404);
    throw error;
  }
}
export async function onRequestGet({env,params}){
  const headers={'Cache-Control':'no-store'};
  if(!/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/.test(params.id))return jsonResponse({error:'Invalid media ID'},{status:400,headers});
  const current=await sourceRecord(env,params.id);
  if(!current?.metadata)return jsonResponse({error:'Media not found'},{status:404,headers});
  const records=await overlayStudioMetadata(env,[{name:params.id,metadata:current.metadata}]);
  if(!records.length)return jsonResponse({error:'Media not found'},{status:404,headers});
  const record=records[0];
  if(hasStudioD1(env))record.metadata.folderId=(await getStudioMediaFolders(env.MEDIA_STUDIO_DB,[params.id])).get(params.id)||null;
  return jsonResponse({record},{headers});
}
