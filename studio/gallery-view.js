/* Local-only display preferences; never stores account or media data. */
(function(root){
 const KEY='studio-gallery-view-v1';
 function normalize(value){
  const v=value&&typeof value==='object'?value:{};
  const size=typeof v.size==='number'&&Number.isFinite(v.size)?v.size:200;
  return {fit:v.fit==='cover'?'cover':'contain',size:Math.max(140,Math.min(320,Math.round(size/20)*20)),info:v.info===true};
 }
 function read(host){try{return normalize(JSON.parse(host.localStorage.getItem(KEY)));}catch{return normalize();}}
 function save(host,value){try{host.localStorage.setItem(KEY,JSON.stringify(normalize(value)));}catch{/* Storage may be disabled; controls still work. */}}
 const api={normalize,read,save};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioGallery=api;
})(typeof globalThis!=='undefined'?globalThis:this);
