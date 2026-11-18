import {sourceRecord} from '../../utils/studio-records.js';
import {overlayStudioMetadata} from '../../utils/studio-metadata.js';
import {hasStudioD1,getStudioMediaFolders,listStudioFolders} from '../../utils/studio-d1.js';
import {CATALOG_FILE,catalogType} from '../../utils/studio-catalog.js';
import {jsonResponse} from '../../utils/http.js';
const reply=(body,status=200)=>jsonResponse(body,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Cross-origin requests forbidden'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON request required'},415);
 let payload;
 try{const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid JSON'},400);let size=0,parts=[];
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>20000){await reader.cancel();return reply({error:'Request too large'},413);}parts.push(r.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}payload=JSON.parse(new TextDecoder().decode(bytes));
 }catch{return reply({error:'Invalid JSON'},400);}
 if(!Array.isArray(payload?.ids)||!payload.ids.length||payload.ids.length>50||payload.ids.some(id=>typeof id!=='string'||!CATALOG_FILE.test(id)))return reply({error:'Choose 1-50 valid media IDs'},400);
 try{
  const ids=[...new Set(payload.ids)],raw=[];for(const id of ids){const r=await sourceRecord(env,id);if(r?.metadata)raw.push({name:id,metadata:r.metadata});}
  const keys=await overlayStudioMetadata(env,raw),d1=hasStudioD1(env),memberships=d1?await getStudioMediaFolders(env.MEDIA_STUDIO_DB,ids):null;
  const folders=d1?new Map((await listStudioFolders(env.MEDIA_STUDIO_DB)).map(f=>[f.id,f])):new Map();
  const path=id=>{const names=[],seen=new Set();while(id&&folders.has(id)&&!seen.has(id)){seen.add(id);const f=folders.get(id);names.unshift(f.name);id=f.parentId;}return names.join(' / ');};
  const current=new URL(request.url),base=current.hostname.endsWith('.my-image-bed.pages.dev')?'https://my-image-bed.pages.dev':current.origin;
  const strings=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'):[];
  const records=keys.map(({name:id,metadata:m})=>{const folderId=d1?(memberships.get(id)||null):(m.folderId||null);return {id,description:typeof m.description==='string'?m.description:'',sourceUrl:typeof m.sourceUrl==='string'?m.sourceUrl:'',prompt:typeof m.prompt==='string'?m.prompt:'',fileName:typeof m.fileName==='string'?m.fileName:id,type:catalogType(id),sizeBytes:Number(m.fileSize)||0,uploadedAt:Number(m.TimeStamp)||0,tags:strings(m.tags),albums:strings(m.albums),category:typeof m.category==='string'?m.category:'',folderId,folderPath:path(folderId),liked:m.liked===true,aiPublished:m.aiPublished===true,metadataVersion:m.metadataVersion??null,url:base+'/file/'+encodeURIComponent(id)};});
  const found=new Set(records.map(r=>r.id));return reply({records,missing:ids.filter(id=>!found.has(id))});
 }catch{return reply({error:'Export temporarily unavailable'},503);}
}
