/**
 * Media Studio virtual folders (albums).
 * Folder records live in img_url KV under studio:folder:<id>.
 * Media files themselves never move; file metadata stores a stable folderId.
 */
export const FOLDER_PREFIX = 'studio:folder:';
export const FOLDER_ID = /^[a-f0-9]{32}$/;
const MAX_FOLDERS = 1000;

export function folderResponse(body, status=200) {
  return new Response(JSON.stringify(body), {
    status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
export function folderReady(env) {
  return Boolean(env?.BASIC_USER && env?.BASIC_PASS && env?.img_url
    && typeof env.img_url.list === 'function' && typeof env.img_url.getWithMetadata === 'function');
}
export function safeMutation(request) {
  if(new URL(request.url).origin !== request.headers.get('Origin')) {
    // Native tools may omit Origin; requests from the Studio browser must send it.
    return false;
  }
  return /^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'');
}
export async function parseFolderBody(request) {
  const body=await request.text();
  if(body.length>4096)throw new Error('Request body too large');
  return JSON.parse(body);
}
export function folderName(value) {
  if(typeof value !== 'string')return null;
  const name=value.trim();
  return name.length>=1 && name.length<=64 && !/[\u0000-\u001f\u007f<>/\\]/.test(name) ? name : null;
}
export function folderId(value) {
  return typeof value==='string' && FOLDER_ID.test(value);
}
export function folderKey(id) { return FOLDER_PREFIX + id; }

export async function allFolders(kv) {
  const folders=[], seen=new Set();
  let cursor;
  for(let page=0;page<20;page++) {
    const response=await kv.list({prefix:FOLDER_PREFIX,limit:1000,...(cursor?{cursor}:{})});
    for(const x of response.keys || []) {
      const id=x.name?.slice(FOLDER_PREFIX.length);
      if(!folderId(id) || seen.has(id))continue;
      const m=x.metadata;
      if(!m || !folderName(m.name))continue;
      folders.push({id,name:m.name,parentId:folderId(m.parentId)?m.parentId:null,
        createdAt:Number(m.createdAt)||null,updatedAt:Number(m.updatedAt)||null});
      seen.add(id);
      if(folders.length>MAX_FOLDERS)throw new Error('Folder limit exceeded');
    }
    if(response.list_complete) return folders;
    if(!response.cursor)throw new Error('Folder pagination failed');
    cursor=response.cursor;
  }
  throw new Error('Too many folder pages');
}
export function createsCycle(folders,id,newParentId) {
  if(!newParentId)return false;
  const byId=new Map(folders.map(f=>[f.id,f]));
  const visited=new Set([id]);
  let current=newParentId;
  while(current) {
    if(visited.has(current))return true;
    visited.add(current);
    current=byId.get(current)?.parentId||null;
  }
  return false;
}
export function siblingExists(folders,name,parentId,excludeId=null) {
  return folders.some(f=>f.id!==excludeId && f.parentId===parentId && f.name.localeCompare(name,'zh-CN',{sensitivity:'base'})===0);
}
export function hasChildFolder(folders,id) {
  return folders.some(f=>f.parentId===id);
}
export async function containsMedia(kv,id) {
  let cursor;
  const FILE=/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/;
  for(let page=0;page<100;page++){
    const resp=await kv.list({limit:1000,...(cursor?{cursor}:{})});
    if((resp.keys||[]).some(x=>FILE.test(x.name)&&x.metadata?.folderId===id))return true;
    if(resp.list_complete)return false;
    if(!resp.cursor)throw new Error('Could not verify folder emptiness');
    cursor=resp.cursor;
  }
  throw new Error('Too many media records to verify folder emptiness');
}
