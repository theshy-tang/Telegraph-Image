import {catalogStatus,CATALOG_FILE} from '../../utils/studio-catalog.js';
import {jsonResponse} from '../../utils/http.js';
const DOC='COALESCE(m.metadata,i.metadata)';
const NAME=`COALESCE(json_extract(${DOC},'$.fileName'),i.media_id)`;
const FROM=' FROM studio_media_inventory i LEFT JOIN studio_media_metadata m ON m.media_id=i.media_id LEFT JOIN studio_media_folders f ON f.media_id=i.media_id';
class SearchInputError extends Error{}
const reject=()=>{throw new SearchInputError('Invalid search filters or cursor');};
function parseSearch(url){
  const p=url.searchParams;
  const filters={q:(p.get('q')||'').trim(),tag:p.get('tag')||'',album:p.get('album')||'',view:p.get('view')||'all',folder:p.get('folder')||'all',descendants:p.get('descendants')==='true',order:p.get('order')||'new'};
  if(filters.q.length>256||filters.tag.length>48||filters.album.length>48||!['all','image','video','other','favorites','published'].includes(filters.view)||!['new','old','name'].includes(filters.order)||(!['all','unfiled'].includes(filters.folder)&&!/^[a-f0-9]{32}$/.test(filters.folder)))reject();
  const limit=Number(p.get('limit')||50);if(!Number.isInteger(limit)||limit<1||limit>100)reject();
  let cursor=null;
  if(p.has('cursor')){
    try{const value=p.get('cursor');if(value.length>4096)reject();cursor=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),x=>x.charCodeAt(0))));}catch{reject();}
    if(!cursor||cursor.signature!==JSON.stringify(filters)||typeof cursor.id!=='string'||!CATALOG_FILE.test(cursor.id)||typeof cursor.value!==(filters.order==='name'?'string':'number')||(typeof cursor.value==='string'&&cursor.value.length>1024)||(typeof cursor.value==='number'&&(!Number.isSafeInteger(cursor.value)||cursor.value<0)))reject();
  }
  return {filters,limit,cursor};
}
function encodeCursor(filters,row){
  const value=JSON.stringify({signature:JSON.stringify(filters),id:row.media_id,value:row.sort_value});
  return btoa(Array.from(new TextEncoder().encode(value),x=>String.fromCharCode(x)).join(''));
}
export async function onRequestGet({request,env}){
  const headers={'Cache-Control':'no-store'};
  try{
    const {filters:s,limit,cursor}=parseSearch(new URL(request.url));
    if(!(await catalogStatus(env))?.ready)return jsonResponse({error:'Full-library search index is not ready'},{status:503,headers});
    const where=['COALESCE(m.deleted,0)=0'],params=[];
    if(s.q){
      const pattern='%'+s.q.replace(/[\\%_]/g,'\\$&')+'%';
      where.push(`(i.media_id LIKE ? ESCAPE '\\' OR ${NAME} LIKE ? ESCAPE '\\' OR json_extract(${DOC},'$.category') LIKE ? ESCAPE '\\' OR json_extract(${DOC},'$.description') LIKE ? ESCAPE '\\' OR json_extract(${DOC},'$.sourceUrl') LIKE ? ESCAPE '\\' OR json_extract(${DOC},'$.prompt') LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(${DOC},'$.tags') t WHERE t.value LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM json_each(${DOC},'$.albums') a WHERE a.value LIKE ? ESCAPE '\\'))`);
      params.push(pattern,pattern,pattern,pattern,pattern,pattern,pattern,pattern);
    }
    if(s.tag){where.push(`EXISTS (SELECT 1 FROM json_each(${DOC},'$.tags') t WHERE t.value=?)`);params.push(s.tag);}
    if(s.album){where.push(`EXISTS (SELECT 1 FROM json_each(${DOC},'$.albums') a WHERE a.value=?)`);params.push(s.album);}
    if(['image','video','other'].includes(s.view)){where.push('i.media_type=?');params.push(s.view);}
    if(s.view==='favorites')where.push(`json_extract(${DOC},'$.liked')=1`);
    if(s.view==='published')where.push(`json_extract(${DOC},'$.aiPublished')=1`);
    if(s.folder==='unfiled')where.push('f.folder_id IS NULL');
    else if(s.folder!=='all'){
      where.push(s.descendants?'f.folder_id IN (WITH RECURSIVE sub(id) AS (SELECT ? UNION SELECT child.id FROM studio_folders child JOIN sub ON child.parent_id=sub.id) SELECT id FROM sub)':'f.folder_id=?');params.push(s.folder);
    }
    const base=' WHERE '+where.join(' AND '),sort=s.order==='name'?NAME:'i.uploaded_at',direction=s.order==='new'?'DESC':'ASC',op=s.order==='new'?'<':'>';
    const collate=s.order==='name'?' COLLATE NOCASE':'';
    let seek='';const seekParams=[];
    if(cursor){seek=` AND (${sort}${collate} ${op} ? OR (${sort}${collate} = ? AND i.media_id ${op} ?))`;seekParams.push(cursor.value,cursor.value,cursor.id);}
    const db=env.MEDIA_STUDIO_DB;
    const statements=[
      db.prepare('SELECT COUNT(*) AS total'+FROM+base).bind(...params),
      db.prepare(`SELECT i.media_id,i.metadata AS base_metadata,m.metadata AS editable,m.version,f.folder_id,${sort} AS sort_value${FROM}${base}${seek} ORDER BY ${sort}${collate} ${direction},i.media_id ${direction} LIMIT ?`).bind(...params,...seekParams,limit+1),
      db.prepare(`SELECT DISTINCT t.value AS name${FROM} JOIN json_each(${DOC},'$.tags') t WHERE COALESCE(m.deleted,0)=0 AND t.type='text' ORDER BY t.value COLLATE NOCASE LIMIT 500`)
    ];
    const [count,page,tags]=await db.batch(statements);
    const more=page.results.length>limit,rows=page.results.slice(0,limit);
    return jsonResponse({keys:rows.map(row=>({name:row.media_id,metadata:{...JSON.parse(row.base_metadata),...(row.editable?JSON.parse(row.editable):{}),folderId:row.folder_id||null,metadataVersion:row.version||0}})),total:count.results[0].total,list_complete:!more,cursor:more?encodeCursor(s,rows[rows.length-1]):null,tags:tags.results.map(x=>x.name),backend:'d1'},{headers});
  }catch(error){return jsonResponse({error:error instanceof SearchInputError?error.message:'Full-library search temporarily unavailable'},{status:error instanceof SearchInputError?400:503,headers});}
}
