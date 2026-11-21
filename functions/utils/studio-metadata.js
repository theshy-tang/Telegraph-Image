import {ASSET_FIELDS} from './studio-asset-details.js';
import {hasStudioD1} from './studio-d1.js';

export function metadataD1Enabled(env){
  if(env.MEDIA_STUDIO_METADATA_D1!=='true')return false;
  if(!hasStudioD1(env))throw Error('Metadata D1 binding required');
  return true;
}
export function imageDimensions(metadata){
  const {width,height}=metadata;
  const valid=value=>Number.isInteger(value)&&value>0&&value<=100000;
  return valid(width)&&valid(height)?{width,height}:{};
}
export function editableMetadata(m,id){
  return {...imageDimensions(m),fileName:typeof m.fileName==='string'?m.fileName:id,liked:m.liked===true,aiPublished:m.aiPublished===true,
    tags:Array.isArray(m.tags)?m.tags.filter(x=>typeof x==='string'):[],
    albums:Array.isArray(m.albums)?m.albums.filter(x=>typeof x==='string'):[],category:typeof m.category==='string'?m.category:'',...Object.fromEntries(ASSET_FIELDS.filter(k=>typeof m[k]==='string').map(k=>[k,m[k]]))};
}
function conflict(code){const error=new Error(code);error.code=code;return error;}
export async function seedStudioMetadata(db,id,base){
  await db.prepare('INSERT OR IGNORE INTO studio_media_metadata (media_id,metadata,version,deleted,updated_at) VALUES (?,?,0,0,?)')
    .bind(id,JSON.stringify(editableMetadata(base,id)),Date.now()).run();
}
export async function recordImageDimensions(db,id,base,dimensions){
  await seedStudioMetadata(db,id,base);
  // The original image does not change when the user edits its tags or name.
  const result=await db.prepare(`UPDATE studio_media_metadata
    SET metadata=json_patch(metadata, ?)
    WHERE media_id=? AND deleted=0 AND NOT COALESCE(
      json_type(metadata,'$.width')='integer' AND json_extract(metadata,'$.width') BETWEEN 1 AND 100000
      AND json_type(metadata,'$.height')='integer' AND json_extract(metadata,'$.height') BETWEEN 1 AND 100000, 0)`)
    .bind(JSON.stringify(dimensions),id).run();
  if(result.meta?.changes===1)return dimensions;
  return imageDimensions(await readStudioMetadata(db,id,base));
}
export async function readStudioMetadata(db,id,base){
  const row=await db.prepare('SELECT metadata,version,deleted FROM studio_media_metadata WHERE media_id=?').bind(id).first();
  if(row?.deleted)throw conflict('MEDIA_DELETED');
  return {...base,...(row?JSON.parse(row.metadata):editableMetadata(base,id)),metadataVersion:row?.version||0};
}
export async function overlayStudioMetadata(env,keys){
  if(!metadataD1Enabled(env))return keys;
  const rows=new Map();
  for(let offset=0;offset<keys.length;offset+=100){
    const ids=keys.slice(offset,offset+100).map(k=>k.name);
    const result=await env.MEDIA_STUDIO_DB.prepare('SELECT media_id,metadata,version,deleted FROM studio_media_metadata WHERE media_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
    for(const row of result.results||[])rows.set(row.media_id,row);
  }
  return keys.filter(k=>!rows.get(k.name)?.deleted).map(k=>{
    const row=rows.get(k.name);
    return {...k,metadata:{...(k.metadata||{}),...(row?JSON.parse(row.metadata):editableMetadata(k.metadata||{},k.name)),metadataVersion:row?.version||0}};
  });
}
export async function mutateStudioMetadata(db,id,base,updater,expectedVersion){
  await seedStudioMetadata(db,id,base);
  for(let attempt=0;attempt<12;attempt++){
    const current=await readStudioMetadata(db,id,base);
    if(expectedVersion!==undefined&&expectedVersion!==current.metadataVersion)throw conflict('METADATA_CONFLICT');
    const next=updater({...current});
    // A simultaneous original-size read may have added pixel dimensions without changing the edit version.
    const result=await db.prepare('UPDATE studio_media_metadata SET metadata=json_patch(metadata,?),version=version+1,updated_at=? WHERE media_id=? AND version=? AND deleted=0')
      .bind(JSON.stringify(editableMetadata(next,id)),Date.now(),id,current.metadataVersion).run();
    if(result.meta?.changes===1)return {...next,metadataVersion:current.metadataVersion+1};
  }
  throw conflict('METADATA_CONFLICT');
}
export async function markStudioMediaDeleted(db,id,base){
  await seedStudioMetadata(db,id,base);
  await db.batch([
    db.prepare('UPDATE studio_media_metadata SET deleted=1,version=version+1,updated_at=? WHERE media_id=?').bind(Date.now(),id),
    db.prepare('DELETE FROM studio_media_folders WHERE media_id=?').bind(id)
  ]);
}
