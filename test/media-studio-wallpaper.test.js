const assert=require('assert'),wallpaper=require('../studio/wallpaper');
function fixture(reduced=false){
 const listeners=new Map(),changes=new Map();const classes=()=>({set:new Set(),add(v){this.set.add(v)},remove(v){this.set.delete(v)},toggle(v,on){on?this.add(v):this.remove(v)}});
 const elements=[],status=[];const container={children:[],replaceChildren(){this.children=[]},append(v){this.children.push(v)}};
 const motion={matches:reduced,addEventListener(k,f){changes.set(k,f)},removeEventListener(k){changes.delete(k)}};
 const doc={hidden:false,body:{classList:classes(),style:{setProperty(){}}},addEventListener(k,f){listeners.set(k,f)},removeEventListener(k){listeners.delete(k)},createElement(tag){
  const events=new Map(),m={tagName:tag.toUpperCase(),paused:true,playCount:0,pauseCount:0,loadCount:0,events,
   setAttribute(){},removeAttribute(k){delete this[k]},addEventListener(k,f){events.set(k,f)},
   play(){this.playCount++;this.paused=false;return this.rejected?Promise.reject(Error('blocked')):Promise.resolve()},pause(){this.pauseCount++;this.paused=true},load(){this.loadCount++}};elements.push(m);return m;
 }};
 const layer={classList:classes()};const controller=wallpaper.create({host:{document:doc,matchMedia:()=>motion},layer,container,urlFor:id=>'/file/'+id,onStatus:s=>status.push(s)});
 return {doc,layer,container,controller,elements,status,listeners,motion,changes};
}
describe('Studio browser-local image and video wallpapers',()=>{
 it('accepts only supported library IDs and discards URLs, secrets and invalid stored data',()=>{
  for(const id of ['https://example.com/photo.jpg','../photo.jpg','photo.svg','tiny.exe'])assert.strictEqual(wallpaper.normalize({type:'image',id}).type,'default');
  assert.strictEqual(wallpaper.normalize({type:'image',id:'sample.mp4'}).type,'default');
  assert.strictEqual(wallpaper.normalize({type:'video',id:'sample.webm'}).type,'video');
  let saved;const host={localStorage:{setItem(k,v){saved=v},getItem(){return saved}}};
  wallpaper.save(host,{type:'image',id:'sample.jpg',mask:999,surface:1,paused:true,password:'discard',name:'discard'});
  assert.deepStrictEqual(wallpaper.read(host),{type:'image',id:'sample.jpg',mask:85,surface:80,paused:true});assert.ok(!saved.includes('discard'));
  assert.deepStrictEqual(wallpaper.read({get localStorage(){throw Error('denied')}}),wallpaper.normalize());
  assert.strictEqual(wallpaper.save({get localStorage(){throw Error('denied')}},{}),false);
 });
 it('does not request media until applied and releases video when switching to image/default',()=>{
  const f=fixture();assert.strictEqual(f.elements.length,0);
  f.controller.apply({type:'video',id:'sample.mp4'});const video=f.elements[0];
  assert.strictEqual(video.muted,true);assert.strictEqual(video.loop,true);assert.strictEqual(video.playsInline,true);assert.strictEqual(video.src,'/file/sample.mp4');
  f.controller.apply({type:'image',id:'sample.jpg'});assert.strictEqual(video.src,undefined);assert.strictEqual(video.loadCount,1);assert.strictEqual(f.container.children.length,1);
  assert.strictEqual(f.elements[1].src,'/file/sample.jpg');f.controller.apply({});assert.strictEqual(f.container.children.length,0);assert.ok(f.layer.classList.set.has('hidden'));
 });
 it('pauses in hidden tabs, resumes on return and preserves a manual pause',async()=>{
  const f=fixture();f.controller.apply({type:'video',id:'sample.mp4'});await Promise.resolve();const v=f.elements[0];
  f.doc.hidden=true;f.listeners.get('visibilitychange')();assert.strictEqual(v.paused,true);
  f.doc.hidden=false;f.listeners.get('visibilitychange')();await Promise.resolve();assert.strictEqual(v.paused,false);
  assert.strictEqual(f.controller.toggle(),true);f.doc.hidden=true;f.listeners.get('visibilitychange')();f.doc.hidden=false;f.listeners.get('visibilitychange')();assert.strictEqual(v.paused,true);
 });
 it('respects reduced motion until an explicit play gesture',async()=>{
  const f=fixture(true);f.controller.apply({type:'video',id:'sample.mp4'});const v=f.elements[0];assert.strictEqual(v.playCount,0);
  assert.strictEqual(f.controller.toggle(),false);await Promise.resolve();assert.strictEqual(v.paused,false);
  f.motion.matches=true;f.changes.get('change')();assert.strictEqual(v.paused,true);
 });
 it('handles autoplay rejection and media failure without a stale result affecting a new background',async()=>{
  const f=fixture();f.controller.apply({type:'video',id:'sample.mp4'});const old=f.elements[0];old.rejected=true;old.events.get('loadeddata')();await Promise.resolve();await Promise.resolve();
  assert.ok(f.status.some(s=>s.message.includes('自动播放')));
  f.controller.apply({type:'image',id:'sample.jpg'});old.events.get('error')();assert.ok(!f.layer.classList.set.has('hidden'));
  f.elements[1].events.get('error')();assert.ok(f.layer.classList.set.has('hidden'));assert.ok(!f.doc.body.classList.set.has('has-wallpaper'));
 });
 it('tears down listeners, streaming source and pending callbacks',async()=>{
  const f=fixture();f.controller.apply({type:'video',id:'sample.mp4'});f.controller.destroy();const count=f.status.length;await Promise.resolve();await Promise.resolve();
  assert.strictEqual(f.status.length,count);assert.strictEqual(f.listeners.size,0);assert.strictEqual(f.changes.size,0);assert.strictEqual(f.elements[0].src,undefined);
 });
});
