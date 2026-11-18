const assert=require('assert'),gallery=require('../studio/justified-layout');
describe('Studio justified image layout',()=>{
 const ratios=Array.from({length:100},(_,i)=>[16/9,2/3,1,3/2,9/16][i%5]);
 it('packs 100 mixed images in order without overlap, distortion or missing items',()=>{
  for(const width of [280,760,1440])for(const target of [140,200,320]){
   const g=gallery.layout(ratios,width,target,8);assert.strictEqual(g.boxes.length,100);
   for(const row of g.rows){let right=0;
    for(let i=row.start;i<row.end;i++){const b=g.boxes[i];assert.ok(b.width>0&&b.height>0);assert.ok(Math.abs(b.width/b.height-ratios[i])<1e-9);assert.ok(b.left>=right-1e-8);assert.ok(b.left+b.width<=width+1e-8);right=b.left+b.width;}
    if(row.end<100)assert.ok(Math.abs(right-width)<1e-8);else assert.ok(row.height<=target);
   }
   for(let i=1;i<g.rows.length;i++)assert.ok(g.rows[i].top>=g.rows[i-1].top+g.rows[i-1].height+8-1e-8);
  }
 });
 it('reaches the last image and navigates irregular rows by visual center',()=>{
  const g=gallery.layout(ratios,1000),r=gallery.visible(g,-g.height,800);assert.strictEqual(r.end,100);
  assert.strictEqual(gallery.target(0,'End',g),99);assert.strictEqual(gallery.target(99,'Home',g),0);
  assert.strictEqual(gallery.target(0,'ArrowLeft',g),0);assert.strictEqual(gallery.target(99,'ArrowRight',g),99);
  const next=gallery.target(0,'ArrowDown',g);assert.strictEqual(g.boxes[next].row,1);
  assert.strictEqual(gallery.target(0,'Enter',g),null);
 });
 it('handles empty, unknown ratios, panoramas and a narrow container',()=>{
  assert.deepStrictEqual(gallery.layout([],500),{boxes:[],rows:[],height:0});
  assert.deepStrictEqual(gallery.visible(gallery.layout([],500),0,800),{start:0,end:0});
  const g=gallery.layout([NaN,0,Infinity,100,0.01],280);assert.strictEqual(g.boxes.length,5);
  for(const b of g.boxes)assert.ok(Number.isFinite(b.height)&&b.height>0&&b.width<=280+1e-8);
  const one=gallery.layout([0.4],120);assert.ok(one.height<=200);assert.ok(one.boxes[0].width<=120);
 });
});
