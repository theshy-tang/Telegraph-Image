const assert=require('assert');const fs=require('fs');const path=require('path');
const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8');
const fn=page.slice(page.indexOf('async function upload(files){'),page.indexOf("$('loginForm').addEventListener",page.indexOf('async function upload(files){')));
describe('Studio upload UI integration',function(){
 function harness(fetch){
  const state={busy:false,seen:new Set(),items:[]};const elements={uploadBtn:{disabled:false},status:{textContent:''}};
  const upload=new Function('state','$','fetch','authHeader','IS_PREVIEW','confirm','setBusyUI','loadPage','normalize','isSafeId','render','renderFolders','toast',fn+';return upload;')(
   state,id=>elements[id],fetch,()=>({Authorization:'Basic fixture-only'}),false,()=>true,()=>{},async()=>{assert.strictEqual(state.busy,false);state.items=[];state.seen.clear();},record=>({id:record.name}),()=>true,()=>{},()=>{},()=>{});
  return {state,elements,upload};
 }
 it('sends admin auth and retains server-confirmed uploads when the KV list is stale',async()=>{
  const h=harness(async(url,options)=>{assert.strictEqual(url,'/api/manage/upload');assert.strictEqual(options.headers.Authorization,'Basic fixture-only');assert.ok(options.body.get('file'));return Response.json([{src:'/file/sample.png',record:{name:'sample.png'}}]);});
  await h.upload([new File(['a'],'sample.png')]);assert.deepStrictEqual(h.state.items,[{id:'sample.png'}]);assert.strictEqual(h.state.busy,false);assert.strictEqual(h.elements.uploadBtn.disabled,false);
 });
 it('blocks duplicate upload starts while preserving failure feedback',async()=>{
  let resolve,calls=0;const h=harness(()=>{calls++;return new Promise(r=>resolve=r);});
  const first=h.upload([new File(['a'],'sample.png')]);await h.upload([new File(['b'],'other.png')]);assert.strictEqual(calls,1);
  resolve(Response.json({error:'Size policy rejected'},{status:413}));await first;
  assert.match(h.elements.status.textContent,/Size policy rejected/);assert.strictEqual(h.state.busy,false);assert.strictEqual(h.state.items.length,0);
 });
});
