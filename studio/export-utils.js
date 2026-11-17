/* Small dependency-free export helpers. ZIP uses STORE (no recompression). */
(function(root){
 'use strict';
 const MAX_BYTES=100*1024*1024,MAX_FILE_BYTES=50*1024*1024,MAX_FILES=100;
 function filename(name,id){
  const ext=id.slice(id.lastIndexOf('.'));let stem=String(name||id).replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f-\u009f/\\:*?"<>|]/g,'_').replace(/[. ]+$/g,'');
  stem=Array.from(stem).slice(0,120).join('')||'media';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem.split('.')[0]))stem='_'+stem;return stem+ext;
 }
 function csv(records){
  const columns=['id','fileName','type','sizeBytes','uploadedAt','tags','albums','category','folderId','folderPath','liked','aiPublished','metadataVersion','url','description','sourceUrl','prompt'];
  const cell=value=>{let s=Array.isArray(value)?JSON.stringify(value):String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+[columns.map(cell).join(','),...records.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n');
 }
 const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
 function zip(entries){
  if(entries.length<1||entries.length>MAX_FILES)throw Error('ZIP requires 1–100 files');
  let total=0,offset=0;const locals=[],central=[],encoder=new TextEncoder();
  entries.forEach((entry,index)=>{
   const data=entry.bytes;if(!(data instanceof Uint8Array))throw Error('Invalid ZIP bytes');total+=data.length;if(data.length>MAX_FILE_BYTES||total>MAX_BYTES)throw Error('Download size limit exceeded');
   const name=encoder.encode(String(index+1).padStart(3,'0')+'-'+filename(entry.name,entry.id)),crc=crc32(data),h=header(30+name.length),v=h.view;
   v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.bytes.set(name,30);
   const c=header(46+name.length),w=c.view;w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x0800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.bytes.set(name,46);
   locals.push(h.bytes,data);central.push(c.bytes);offset+=h.bytes.length+data.length;
  });
  const size=central.reduce((n,c)=>n+c.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,entries.length,true);end.view.setUint16(10,entries.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
  return new Blob([...locals,...central,end.bytes],{type:'application/zip'});
 }
 async function readBytes(response,budget,signal,onBytes=()=>{}){
  if(!response.ok){
   // Display only known codes, never upstream bodies/URLs/provider exception text.
   let info={};try{const data=await response.json();if(data&&typeof data==='object')info=data;}catch{}
   const messages={INVALID_MEDIA_ID:'素材标识无效',MEDIA_NOT_FOUND:'素材记录已不存在，请刷新列表',MEDIA_RESTRICTED:'素材受黑名单或白名单规则限制',SOURCE_FETCH_FAILED:'原文件请求失败，请稍后重试',SOURCE_REDIRECT:'原文件返回了重定向，下载已停止，请检查原链接',SOURCE_HTTP_ERROR:'原文件服务器未能返回文件',SOURCE_NOT_MEDIA:'原链接返回了网页或错误数据，未下载',DOWNLOAD_UNAVAILABLE:'下载服务暂时不可用'};
   const known=typeof info.code==='string'&&Object.hasOwn(messages,info.code);
   throw Error((known?messages[info.code]:'下载接口返回 '+response.status)+(info.code?' ['+(known?info.code:'UNKNOWN')+']':''));
  }
  const length=Number(response.headers.get('Content-Length'));if(length>budget){await response.body?.cancel();throw Error('文件超出剩余下载容量');}
  const reader=response.body?.getReader();if(!reader)throw Error('下载内容为空');const chunks=[];let size=0;
  try{while(true){if(signal?.aborted)throw new DOMException('已取消','AbortError');const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>budget)throw Error('文件超出剩余下载容量');chunks.push(value);onBytes(size);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  if(size===0)throw Error('下载内容为空');const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}return bytes;
 }
 const api={filename,csv,crc32,zip,readBytes,MAX_BYTES,MAX_FILE_BYTES,MAX_FILES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioExport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
