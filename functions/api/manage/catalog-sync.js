import {overlaySourceRecords} from '../../utils/studio-records.js';
import {catalogStatus,CATALOG_FILE,catalogMetadata,catalogType} from '../../utils/studio-catalog.js';
import {jsonResponse} from '../../utils/http.js';
const reply=(body,status=200)=>jsonResponse(body,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({env}){
 try{
  if(!(await catalogStatus(env))?.ready)return reply({error:'Catalog must be initialized before maintenance'},503);
  const db=env.MEDIA_STUDIO_DB;
  const r=await db.prepare(`SELECT
   (SELECT COUNT(*) FROM studio_media_inventory) AS indexed,
   (SELECT COUNT(*) FROM studio_media_inventory i LEFT JOIN studio_media_metadata m ON m.media_id=i.media_id WHERE COALESCE(m.deleted,0)=0) AS visible,
   (SELECT COUNT(*) FROM studio_media_metadata WHERE deleted=1) AS tombstones,
   (SELECT COUNT(*) FROM studio_media_metadata m WHERE deleted=0 AND NOT EXISTS(SELECT 1 FROM studio_media_inventory i WHERE i.media_id=m.media_id)) AS editableWithoutInventory,
   (SELECT COUNT(*) FROM studio_media_folders f WHERE NOT EXISTS(SELECT 1 FROM studio_media_inventory i WHERE i.media_id=f.media_id)) AS membershipsWithoutInventory`).first();
  return reply(r);
 }catch{return reply({error:'Catalog status temporarily unavailable'},503);}
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Cross-origin writes forbidden'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON request required'},415);
 let p;
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid JSON'},400);let size=0,parts=[];
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>5000){await reader.cancel();return reply({error:'Request too large'},413);}parts.push(r.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}p=JSON.parse(new TextDecoder().decode(bytes));
 }catch{return reply({error:'Invalid JSON'},400);}
 if(!p||typeof p!=='object'||Array.isArray(p)||(p.cursor!==null&&p.cursor!==undefined&&(typeof p.cursor!=='string'||!p.cursor||p.cursor.length>4096)))return reply({error:'Invalid scan cursor'},400);
 try{
  if(!(await catalogStatus(env))?.ready)return reply({error:'Catalog must be initialized before maintenance'},503);
  const page=await env.img_url.list({limit:100,...(p.cursor?{cursor:p.cursor}:{})});
  if(!Array.isArray(page.keys)||typeof page.list_complete!=='boolean'||(!page.list_complete&&(typeof page.cursor!=='string'||!page.cursor||page.cursor.length>4096||page.cursor===p.cursor)))throw Error('Invalid source page');
  const media=await overlaySourceRecords(env,page.keys.filter(k=>typeof k.name==='string'&&CATALOG_FILE.test(k.name)));
  if(media.some(k=>!k.metadata||typeof k.metadata!=='object'||Array.isArray(k.metadata)))throw Error('Missing source metadata');
  const now=Date.now(),db=env.MEDIA_STUDIO_DB;
  const writes=media.map(k=>{const m=catalogMetadata(k.metadata,k.name);return db.prepare(`INSERT INTO studio_media_inventory(media_id,media_type,uploaded_at,metadata,indexed_at) VALUES (?,?,?,?,?)
   ON CONFLICT(media_id) DO UPDATE SET media_type=excluded.media_type,uploaded_at=excluded.uploaded_at,metadata=excluded.metadata,indexed_at=excluded.indexed_at
   WHERE studio_media_inventory.media_type<>excluded.media_type OR studio_media_inventory.uploaded_at<>excluded.uploaded_at OR studio_media_inventory.metadata<>excluded.metadata`).bind(k.name,catalogType(k.name),m.TimeStamp,JSON.stringify(m),now);});
  const results=writes.length?await db.batch(writes):[];
  return reply({scannedKeys:page.keys.length,mediaKeys:media.length,skippedKeys:page.keys.length-media.length,changed:results.reduce((n,r)=>n+(r.meta?.changes||0),0),complete:page.list_complete,cursor:page.list_complete?null:page.cursor});
 }catch{return reply({error:'Index page could not be confirmed; retry this page safely'},503);}
}
