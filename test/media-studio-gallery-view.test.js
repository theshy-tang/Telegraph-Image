const assert=require('assert');
const gallery=require('../studio/gallery-view');
const grid=require('../studio/grid-window');
describe('Studio gallery display preferences',()=>{
 it('recovers from corrupt/blocked storage and saves only validated display choices',()=>{
  for(const localStorage of [{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem(){return '{invalid';},setItem(){}}]){
   assert.deepStrictEqual(gallery.read({localStorage}),{size:200,info:false});
   assert.doesNotThrow(()=>gallery.save({localStorage},{size:320}));
  }
  let saved;const host={localStorage:{setItem(k,v){saved=v;},getItem(){return saved;}}};
  gallery.save(host,{fit:'cover',size:999,info:true,auth:'must never save',items:['private']});
  assert.deepStrictEqual(JSON.parse(saved),{size:320,info:true});
  assert.deepStrictEqual(gallery.read(host),{size:320,info:true});
  assert.deepStrictEqual(gallery.normalize({size:NaN,fit:'invalid',info:'true'}),{size:200,info:false});
 });
 it('keeps virtual spacer geometry exact across thumbnail sizes and information densities',()=>{
  for(const height of [184,212,244,272,364,392])for(const columns of [1,2,4,8])for(const top of [0,-800,-15000]){
   const count=1504,gap=14,r=grid.range({count,columns,height,gap,top,viewport:900});
   const rows=Math.ceil((r.end-r.start)/columns);
   const actual=r.before+(r.start?gap:0)+rows*height+Math.max(0,rows-1)*gap+(r.end<count?gap+r.after:0);
   assert.strictEqual(actual,r.totalHeight);assert.ok(r.end-r.start<100);
  }
 });
});
