import {cleanNames} from './studio-metadata.js';

// Studio policy is separate from legacy document uploads.
export function studioUploadLimit(env){
  const raw=env.STUDIO_MAX_UPLOAD_BYTES;
  const limit=raw===undefined?50*1024*1024:Number(raw);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100*1024*1024)throw Error('Invalid Studio upload size policy');
  return limit;
}
export class StudioUploadError extends Error{constructor(message,status){super(message);this.status=status;}}
function uploadError(message,status){return new StudioUploadError(message,status);}
export async function readStudioUpload(request,limit){
  if(!/^multipart\/form-data\s*;/i.test(request.headers.get('Content-Type')||''))throw uploadError('Multipart media upload required',415);
  const maxBody=limit+65536;
  if(Number(request.headers.get('Content-Length'))>maxBody)throw uploadError('Upload exceeds size limit',413);
  if(!request.body)throw uploadError('No file uploaded',400);
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBody){await reader.cancel();throw uploadError('Upload exceeds size limit',413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  let form;
  try{form=await new Request(request.url,{method:'POST',headers:request.headers,body:new Blob(chunks)}).formData();}
  catch{throw uploadError('Invalid multipart upload',400);}
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function'||typeof file.name!=='string'||file.size===0)throw uploadError('Choose a nonempty media file',400);
  if(file.size>limit)throw uploadError('Upload exceeds size limit',413);
  if(file.name.length>160||/[\u0000-\u001f\u007f<>]/.test(file.name))throw uploadError('Invalid media filename',400);
  if(!/\.(?:png|jpe?g|gif|webp|bmp|avif|apng|ico|mp4|webm|mov|ogg|m4v|mkv|avi)$/i.test(file.name))throw uploadError('Unsupported media extension',415);
  return form;
}

export function readStudioUploadTags(form){
  const fields=form.getAll('tags');
  if(!fields.length)return [];
  if(fields.length!==1||typeof fields[0]!=='string')throw uploadError('Invalid upload tags',400);
  let raw;
  try{raw=JSON.parse(fields[0]);}catch{throw uploadError('Invalid upload tags',400);}
  const tags=cleanNames(raw,48,30);
  if(!tags)throw uploadError('Upload tags must contain at most 30 valid names of up to 48 characters each',400);
  return tags;
}
