import {metadataD1Enabled,editableMetadata,readStudioMetadata} from './studio-metadata.js';
import {catalogStatus,catalogMetadata,catalogType,CATALOG_FILE} from './studio-catalog.js';
const readyBindings=new WeakSet();
export async function recordsReady(env){
 if(!metadataD1Enabled(env))return false;
 const db=env.MEDIA_STUDIO_DB;if(readyBindings.has(db))return true;
 const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_media_records'").first();
 if(row?.name!=='studio_media_records')return false;readyBindings.add(db);return true;
}
function sourceMetadata(m,id){
 const {description,sourceUrl,prompt,...base}=catalogMetadata(m,id);
 return {...base,Label:typeof m.Label==='string'&&m.Label.length<=32?m.Label:'None',...(['telegram','r2'].includes(m.provider)?{provider:m.provider}:{}),...(/^[A-Za-z0-9]{4,16}$/.test(m.shortId||'')?{shortId:m.shortId}:{})};
}
export async function d1Record(env,id){
 if(!await recordsReady(env))return null;
 const row=await env.MEDIA_STUDIO_DB.prepare('SELECT metadata,kv_pending,updated_at FROM studio_media_records WHERE media_id=?').bind(id).first();
 return row?{value:'',metadata:JSON.parse(row.metadata),source:'d1',kvPending:row.kv_pending===1,updatedAt:row.updated_at}:null;
}
export async function sourceRecord(env,id){return await d1Record(env,id)||await env.img_url.getWithMetadata(id);}
export async function overlaySourceRecords(env,keys){
 if(!keys.length||!await recordsReady(env))return keys;
 const rows=new Map();for(let n=0;n<keys.length;n+=100){const ids=keys.slice(n,n+100).map(k=>k.name);const r=await env.MEDIA_STUDIO_DB.prepare('SELECT media_id,metadata FROM studio_media_records WHERE media_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();for(const x of r.results)rows.set(x.media_id,JSON.parse(x.metadata));}
 return keys.map(k=>rows.has(k.name)?{...k,metadata:rows.get(k.name)}:k);
}
async function mirror(env,id,metadata){
 try{const current=await env.img_url.getWithMetadata(id);await env.img_url.put(id,current?.value??'',{metadata});const r=await env.MEDIA_STUDIO_DB.prepare('UPDATE studio_media_records SET kv_pending=0 WHERE media_id=? AND metadata=?').bind(id,JSON.stringify(metadata)).run();return r.meta?.changes===1;}catch{return false;}
}
export async function registerStudioRecord(env,id,input){
 if(typeof id!=='string'||!CATALOG_FILE.test(id)||!await recordsReady(env)||!(await catalogStatus(env))?.ready)throw Error('Durable media registration unavailable');
 const existing=await sourceRecord(env,id);
 const m=sourceMetadata({...input,...(existing?.metadata?{ListType:existing.metadata.ListType,Label:existing.metadata.Label}:{})},id),now=Date.now(),db=env.MEDIA_STUDIO_DB;
 const guard='NOT EXISTS(SELECT 1 FROM studio_media_metadata WHERE media_id=? AND deleted=1)';
 const r=await db.batch([
  db.prepare(`INSERT INTO studio_media_records(media_id,metadata,kv_pending,created_at,updated_at) SELECT ?,?,1,?,? WHERE ${guard} ON CONFLICT(media_id) DO UPDATE SET metadata=excluded.metadata,kv_pending=1,updated_at=excluded.updated_at`).bind(id,JSON.stringify(m),now,now,id),
  db.prepare(`INSERT OR IGNORE INTO studio_media_metadata(media_id,metadata,version,deleted,updated_at) SELECT ?,?,0,0,? WHERE ${guard}`).bind(id,JSON.stringify(editableMetadata({...input,...(existing?.metadata?editableMetadata(existing.metadata,id):{})},id)),now,id),
  db.prepare(`INSERT INTO studio_media_inventory(media_id,media_type,uploaded_at,metadata,indexed_at) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(media_id) DO UPDATE SET media_type=excluded.media_type,uploaded_at=excluded.uploaded_at,metadata=excluded.metadata,indexed_at=excluded.indexed_at`).bind(id,catalogType(id),m.TimeStamp,JSON.stringify(catalogMetadata(m,id)),now,id)
 ]);
 if(!r[0].meta?.changes)throw Error('Deleted record requires explicit restoration');
 const kvPending=!await mirror(env,id,m);
 const effective=await readStudioMetadata(db,id,m),folder=await db.prepare('SELECT folder_id FROM studio_media_folders WHERE media_id=?').bind(id).first();
 return {metadata:{...effective,folderId:folder?.folder_id||null},kvPending};
}
export async function persistOwnedRecord(env,id,metadata){
 if(!await d1Record(env,id))return false;
 const m=sourceMetadata(metadata,id),now=Date.now(),db=env.MEDIA_STUDIO_DB;
 await db.batch([
  db.prepare('UPDATE studio_media_records SET metadata=?,kv_pending=1,updated_at=? WHERE media_id=?').bind(JSON.stringify(m),now,id),
  db.prepare('UPDATE studio_media_inventory SET metadata=?,indexed_at=? WHERE media_id=?').bind(JSON.stringify(catalogMetadata(m,id)),now,id)
 ]);
 await mirror(env,id,m);return true;
}
export async function syncPendingRecords(env){
 if(!await recordsReady(env))throw Error('Durable records unavailable');
 const r=await env.MEDIA_STUDIO_DB.prepare('SELECT r.media_id,r.metadata,r.updated_at FROM studio_media_records r LEFT JOIN studio_media_metadata m ON m.media_id=r.media_id WHERE r.kv_pending=1 AND COALESCE(m.deleted,0)=0 ORDER BY r.media_id LIMIT 10').all();let synced=0;
 for(const row of r.results){if(!await mirror(env,row.media_id,JSON.parse(row.metadata)))break;synced++;}
 const count=await env.MEDIA_STUDIO_DB.prepare('SELECT COUNT(*) AS total FROM studio_media_records r LEFT JOIN studio_media_metadata m ON m.media_id=r.media_id WHERE r.kv_pending=1 AND COALESCE(m.deleted,0)=0').first();
 return {synced,pending:count.total};
}
export async function sourceCatalogPage(env,{limit,cursor}){
 if(!await recordsReady(env)||!(await catalogStatus(env))?.ready)return null;
 const prefix='records:';
 if(!cursor?.startsWith(prefix)){
  const page=await env.img_url.list({limit,...(cursor?{cursor}:{})}),keys=page.keys||[],owned=new Set();
  for(let n=0;n<keys.length;n+=100){const ids=keys.slice(n,n+100).map(k=>k.name);if(!ids.length)continue;const r=await env.MEDIA_STUDIO_DB.prepare('SELECT media_id FROM studio_media_records WHERE media_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();for(const x of r.results)owned.add(x.media_id);}
  const moreKV=page.list_complete===false;
  const hasOwned=moreKV?false:Boolean(await env.MEDIA_STUDIO_DB.prepare('SELECT media_id FROM studio_media_records LIMIT 1').first());
  return {keys:keys.filter(k=>!owned.has(k.name)),list_complete:!moreKV&&!hasOwned,cursor:moreKV?page.cursor:hasOwned?prefix:null};
 }
 if(cursor.length>512)throw Error('Invalid catalog cursor');
 const after=cursor===prefix?'':atob(cursor.slice(prefix.length));if(after&&!CATALOG_FILE.test(after))throw Error('Invalid catalog cursor');
 const r=await env.MEDIA_STUDIO_DB.prepare('SELECT media_id,metadata FROM studio_media_records WHERE media_id>? ORDER BY media_id LIMIT ?').bind(after,limit+1).all();
 const more=r.results.length>limit,rows=r.results.slice(0,limit);
 return {keys:rows.map(r=>({name:r.media_id,metadata:JSON.parse(r.metadata)})),list_complete:!more,cursor:more?prefix+btoa(rows[rows.length-1].media_id):null};
}
