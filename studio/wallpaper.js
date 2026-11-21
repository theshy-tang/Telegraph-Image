/* Browser-local wallpaper settings. Only existing same-site media IDs are accepted. */
(function(root){
 const KEY='studio-wallpaper-v1';
 function mediaType(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/.test(id))return null;
  if(/\.(?:png|jpe?g|gif|webp|bmp|avif|apng)$/i.test(id))return 'image';
  if(/\.(?:mp4|webm|mov|m4v|ogg)$/i.test(id))return 'video';return null;
 }
 function normalize(value){
  const v=value&&typeof value==='object'?value:{};
  const type=['image','video'].includes(v.type)&&mediaType(v.id)===v.type?v.type:'default';
  const number=(n,f,min,max)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):f;
  return {type,id:type==='default'?'':v.id,mask:number(v.mask,60,35,85),surface:number(v.surface,94,80,100),paused:v.paused===true};
 }
 function read(host){try{return normalize(JSON.parse(host.localStorage.getItem(KEY)));}catch{return normalize();}}
 function save(host,value){try{host.localStorage.setItem(KEY,JSON.stringify(normalize(value)));return true;}catch{return false;}}
 function create({host,layer,container,urlFor,onStatus=()=>{}}){
  const doc=host.document,motion=host.matchMedia?.('(prefers-reduced-motion: reduce)');
  let media=null,config=normalize(),generation=0,disposed=false,motionOverride=false;
  const status=message=>onStatus({message,video:config.type==='video'&&Boolean(media),paused:!media||media.paused!==false});
  function stop(){if(!media)return;media.pause?.();media.removeAttribute('src');if(media.tagName==='VIDEO')media.load();container.replaceChildren();media=null;}
  function failed(token){if(disposed||token!==generation)return;stop();layer.classList.add('hidden');doc.body.classList.remove('has-wallpaper');status('背景加载失败，已使用默认暖灰背景。可重新选择素材。');}
  function play(token){
   if(!media||media.tagName!=='VIDEO'||disposed||token!==generation)return;
   if(doc.hidden||config.paused||(motion?.matches&&!motionOverride)){media.pause();status(motion?.matches&&!motionOverride?'已按减少动态效果设置暂停背景。':'视频背景已暂停。');return;}
   const video=media;
   try{Promise.resolve(video.play()).then(()=>{if(token===generation&&!disposed)status('视频背景播放中。');}).catch(()=>{if(token===generation&&!disposed&&!doc.hidden&&!config.paused){config.paused=true;status('浏览器暂停了自动播放，点击「播放背景」即可继续。');}});}
   catch{config.paused=true;status('视频未能自动播放，可点击「播放背景」重试。');}
  }
  function apply(value){
   generation++;stop();config=normalize(value);motionOverride=false;
   doc.body.style.setProperty('--wallpaper-mask',config.mask/100);
   doc.body.style.setProperty('--wallpaper-surface',config.surface/100);
   const enabled=config.type!=='default';layer.classList.toggle('hidden',!enabled);doc.body.classList.toggle('has-wallpaper',enabled);
   if(!enabled){status('已使用默认暖灰背景。');return;}
   const token=generation;media=doc.createElement(config.type==='video'?'video':'img');
   media.setAttribute('aria-hidden','true');media.addEventListener('error',()=>failed(token));
   if(config.type==='video'){media.muted=true;media.defaultMuted=true;media.loop=true;media.playsInline=true;media.preload='metadata';media.addEventListener('loadeddata',()=>play(token));media.addEventListener('pause',()=>{if(token===generation)status('视频背景已暂停。');});media.addEventListener('playing',()=>{if(token===generation)status('视频背景播放中。');});}
   else{media.alt='';media.decoding='async';media.addEventListener('load',()=>{if(token===generation)status('图片背景已应用。');});}
   media.src=urlFor(config.id);container.append(media);status(config.type==='image'?'正在加载图片背景…':'正在加载视频背景…');if(config.type==='video')play(token);
  }
  function toggle(){if(config.type!=='video'||!media)return;
   const paused=!media.paused;config.paused=paused;if(!paused)motionOverride=true;
   if(paused){media.pause();status('视频背景已暂停。');}else play(generation);
   return config.paused;
  }
  const visibility=()=>{if(media?.tagName==='VIDEO'){if(doc.hidden)media.pause();else play(generation);}};
  const reduced=()=>{motionOverride=false;visibility();};
  doc.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',reduced);
  return {apply,toggle,destroy(){disposed=true;generation++;stop();doc.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',reduced);layer.classList.add('hidden');doc.body.classList.remove('has-wallpaper');}};
 }
 const api={mediaType,normalize,read,save,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioWallpaper=api;
})(typeof globalThis!=='undefined'?globalThis:this);
