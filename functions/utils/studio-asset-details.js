export const ASSET_FIELDS=['description','sourceUrl','prompt'];
export function parseAssetDetails(payload){
 const result={};for(const [field,max] of [['description',4000],['sourceUrl',2048],['prompt',8000]]){
  if(!Object.prototype.hasOwnProperty.call(payload,field))continue;
  const value=payload[field];if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error('Invalid asset details');
  result[field]=field==='sourceUrl'?value.trim():value;
 }
 if(result.sourceUrl){
  if(!/^https?:\/\//i.test(result.sourceUrl)||/\s/.test(result.sourceUrl))throw Error('Source must be an HTTP(S) URL');
  const url=new URL(result.sourceUrl);if(url.username||url.password||!url.hostname)throw Error('Source credentials are forbidden');
 }
 return result;
}
