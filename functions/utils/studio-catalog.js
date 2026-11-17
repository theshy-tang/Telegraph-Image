import {metadataD1Enabled,editableMetadata} from './studio-metadata.js';
export const CATALOG_FILE=/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/;
export async function catalogStatus(env){
  if(!metadataD1Enabled(env))return null;
  try{return await env.MEDIA_STUDIO_DB.prepare('SELECT ready FROM studio_catalog_state WHERE id=1').first();}
  catch(error){if(/no such table: studio_catalog_state/i.test(String(error.message)))return null;throw error;}
}
export function catalogMetadata(m,id){
  return {...editableMetadata(m,id),TimeStamp:Number.isSafeInteger(Number(m.TimeStamp))&&Number(m.TimeStamp)>0?Number(m.TimeStamp):0,
    fileSize:Number.isSafeInteger(Number(m.fileSize))&&Number(m.fileSize)>=0?Number(m.fileSize):0,
    ListType:['White','Block'].includes(m.ListType)?m.ListType:'None',Label:m.Label==='adult'?'adult':'None'};
}
export function catalogType(id){
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|ico|avif|apng)$/i.test(id)?'image':/\.(mp4|webm|mov|ogg|m4v|mkv|avi)$/i.test(id)?'video':'other';
}
export async function indexStudioMedia(env,id,metadata){
  if(!CATALOG_FILE.test(id)||!await catalogStatus(env))return;
  const m=catalogMetadata(metadata,id);
  await env.MEDIA_STUDIO_DB.prepare('INSERT INTO studio_media_inventory(media_id,media_type,uploaded_at,metadata,indexed_at) VALUES (?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET media_type=excluded.media_type,uploaded_at=excluded.uploaded_at,metadata=excluded.metadata,indexed_at=excluded.indexed_at')
    .bind(id,catalogType(id),m.TimeStamp,JSON.stringify(m),Date.now()).run();
}
