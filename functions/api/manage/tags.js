import {catalogStatus} from '../../utils/studio-catalog.js';
import {jsonResponse} from '../../utils/http.js';
const TOO_LARGE=Symbol('TOO_LARGE');
const headers={'Cache-Control':'no-store'};
// Catalog fallback contains only editable fields plus these four derived fields.
const EFFECTIVE=`WITH effective AS MATERIALIZED (
 SELECT i.media_id,COALESCE(m.metadata,json_remove(i.metadata,'$.TimeStamp','$.fileSize','$.ListType','$.Label')) AS doc,COALESCE(m.version,0) AS version
 FROM studio_media_inventory i LEFT JOIN studio_media_metadata m ON m.media_id=i.media_id WHERE COALESCE(m.deleted,0)=0
)`;
const TAGS=`, tags AS (SELECT t.value AS name,COUNT(DISTINCT e.media_id) AS count FROM effective e JOIN json_each(e.doc,'$.tags') t WHERE t.type='text' GROUP BY t.value)`;
const response=(body,status=200)=>jsonResponse(body,{status,headers});
const validName=x=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=48&&!/[\u0000-\u001f\u007f<>]/.test(x);
export async function onRequestGet({request,env}){
 try{
  if(!(await catalogStatus(env))?.ready)return response({error:'Tag index is not ready'},503);
  const p=new URL(request.url).searchParams,q=p.get('q')||'',after=p.get('after')||'';
  if(q.length>48||after.length>48)return response({error:'Invalid tag filters'},400);
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const base=EFFECTIVE+TAGS;
  const [count,page]=await env.MEDIA_STUDIO_DB.batch([
   env.MEDIA_STUDIO_DB.prepare(base+` SELECT COUNT(*) AS total FROM tags WHERE name LIKE ? ESCAPE '\\'`).bind(pattern),
   env.MEDIA_STUDIO_DB.prepare(base+` SELECT name,count FROM tags WHERE name LIKE ? ESCAPE '\\' AND name>? ORDER BY name LIMIT 101`).bind(pattern,after)
  ]);
  const tags=page.results.slice(0,100);return response({tags,total:count.results[0].total,after:page.results.length>100?tags[tags.length-1].name:null});
 }catch{return response({error:'Tag service temporarily unavailable'},503);}
}
async function readPayload(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Invalid JSON');let length=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return TOO_LARGE;}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'Cross-origin writes are forbidden'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return response({error:'JSON request required'},415);
 let p;try{p=await readPayload(request);}catch{return response({error:'Invalid JSON'},400);}
 if(p===TOO_LARGE)return response({error:'Request too large'},413);
 if(!p||!['rename','merge'].includes(p.action)||!validName(p.source)||!validName(p.target)||p.source===p.target)return response({error:'Choose distinct valid source and target tags'},400);
 try{
  if(!(await catalogStatus(env))?.ready)return response({error:'Tag index is not ready'},503);
  // Materialize both documents and eligibility before any write. One SQLite statement
  // reads current versions, changes only tags and atomically updates every matched row.
  // A rename refuses an existing target; merging must be an explicit action.
  const sql=EFFECTIVE+`, eligible AS MATERIALIZED (
   SELECT * FROM effective e WHERE EXISTS(SELECT 1 FROM json_each(e.doc,'$.tags') WHERE value=? AND type='text')
   AND (EXISTS(SELECT 1 FROM effective all_media JOIN json_each(all_media.doc,'$.tags') t WHERE t.type='text' AND t.value=?) = ?)
  ) INSERT INTO studio_media_metadata(media_id,metadata,version,deleted,updated_at)
  SELECT media_id,json_set(doc,'$.tags',json((SELECT json_group_array(value) FROM (
   SELECT CASE WHEN t.value=? THEN ? ELSE t.value END AS value,MIN(CAST(t.key AS INTEGER)) AS position
   FROM json_each(eligible.doc,'$.tags') t WHERE t.type='text' GROUP BY CASE WHEN t.value=? THEN ? ELSE t.value END ORDER BY position
  )))),version+1,0,? FROM eligible WHERE true
  ON CONFLICT(media_id) DO UPDATE SET metadata=excluded.metadata,version=excluded.version,updated_at=excluded.updated_at WHERE studio_media_metadata.deleted=0`;
  const r=await env.MEDIA_STUDIO_DB.prepare(sql).bind(p.source,p.target,p.action==='merge'?1:0,p.source,p.target,p.source,p.target,Date.now()).run();
  const changed=r.meta?.changes||0;
  return changed?response({action:p.action,source:p.source,target:p.target,changed}):response({error:'Source is missing or target status changed. Refresh tags; use merge for an existing target.'},409);
 }catch{return response({error:'Tag update temporarily unavailable'},503);}
}
