const assert=require('assert');const fs=require('fs');const path=require('path');
const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8');
const fn=page.slice(page.indexOf('async function upload(files,'),page.indexOf("\nlet wallpaperConfig="));
const matching=page.slice(page.indexOf('function matchUploadTags('),page.indexOf('let uploadDraft='));
const tagValidation=page.slice(page.indexOf('function detailTagList('),page.indexOf('function detailDirty('));
const matchUploadTags=new Function(tagValidation+matching+';return matchUploadTags;')();
describe('Studio upload UI integration',function(){
 function harness(fetch,refresh){
  const feedback=[];const state={busy:false,seen:new Set(),items:[]};const elements={uploadBtn:{disabled:false},status:{textContent:''}};
  const upload=new Function('state','$','fetch','authHeader','IS_PREVIEW','confirm','setBusyUI','loadPage','normalize','isSafeId','render','renderFolders','toast','publicFileUrl','showUploadFeedback',fn+';return upload;')(
   state,id=>elements[id],fetch,()=>({Authorization:'Basic fixture-only'}),false,()=>true,()=>{},(refresh||(async()=>{assert.strictEqual(state.busy,false);state.items=[];state.seen.clear();})),record=>({id:record.name}),()=>true,()=>{},()=>{},()=>{},id=>'/file/'+encodeURIComponent(id),message=>feedback.push(message));
  return {state,elements,upload,feedback};
 }
 it('sends admin auth and retains server-confirmed uploads when the KV list is stale',async()=>{
  const h=harness(async(url,options)=>{assert.strictEqual(url,'/api/manage/upload');assert.strictEqual(options.headers.Authorization,'Basic fixture-only');assert.ok(options.body.get('file'));return Response.json([{src:'/file/sample.png',record:{name:'sample.png'}}]);});
  await h.upload([new File(['a'],'sample.png')]);assert.deepStrictEqual(h.state.items,[{id:'sample.png'}]);assert.strictEqual(h.state.busy,false);assert.strictEqual(h.elements.uploadBtn.disabled,false);
 });
 it('matches exact original filenames and leaves duplicates or invalid entries untagged',()=>{
  const files=['湖畔.png','Case.jpg','same.webp','same.webp','duplicate.png','bad.png','panel.png'].map(name=>({name}));
  const result=matchUploadTags(files,{version:1,items:[
   {fileName:'湖畔.png',tags:[' 湖畔 ','横幅','湖畔']},
   {fileName:'case.jpg',tags:['Unselected']},
   {fileName:'same.webp',tags:['Ambiguous']},
   {fileName:'duplicate.png',tags:['First']},{fileName:'duplicate.png',tags:['Second']},
   {fileName:'bad.png',tags:[42]},
   {fileName:'panel.png',tags:[]}
  ]});
  assert.deepStrictEqual([...result.tagsByName],[['湖畔.png',['湖畔','横幅']]]);
  assert.match(result.rows[1].reason,/未匹配/);
  assert.match(result.rows[2].reason,/同名/);
  assert.match(result.rows[4].reason,/重复/);
  assert.match(result.rows[5].reason,/无效/);
  assert.match(result.issues[0],/^case\.jpg.*未选入/);
  assert.throws(()=>matchUploadTags(files,{version:2,items:[]}),/格式无效/);
 });
 it('sends matched tags in the corresponding media request and counts server confirmation',async()=>{
  const requests=[];
  const h=harness(async(_url,{body})=>{
   const file=body.get('file'), tags=JSON.parse(body.get('tags')||'[]');
   requests.push([file.name,tags]);
   return Response.json([{src:'/file/'+file.name,record:{name:file.name,metadata:{tags}}}]);
  });
  await h.upload([new File(['a'],'a.png'),new File(['b'],'b.png')],new Map([['a.png',['暮色']]]));
  assert.deepStrictEqual(requests,[['a.png',['暮色']],['b.png',[]]]);
  assert.match(h.elements.status.textContent,/标签导入已确认 1 \/ 1/);
 });
 it('blocks duplicate upload starts while preserving failure feedback',async()=>{
  let resolve,calls=0;const h=harness(()=>{calls++;return new Promise(r=>resolve=r);});
  const first=h.upload([new File(['a'],'sample.png')]);await h.upload([new File(['b'],'other.png')]);assert.strictEqual(calls,1);
  resolve(Response.json({error:'Size policy rejected'},{status:413}));await first;
  assert.match(h.elements.status.textContent,/Size policy rejected/);assert.strictEqual(h.state.busy,false);assert.strictEqual(h.state.items.length,0);
 });
 it('keeps a safe original link in failed-registration feedback without claiming upload success',async()=>{
  const h=harness(async()=>Response.json({error:'registration failed',code:'MEDIA_KV_WRITE_LIMIT',recovery:{id:'sample.png',src:'https://untrusted.invalid'}},{status:503}));
  await h.upload([new File(['a'],'sample.png')]);assert.ok(h.elements.status.textContent.includes('/file/sample.png'));assert.ok(h.elements.status.textContent.includes('未确认 1'));assert.ok(!h.elements.status.textContent.includes('untrusted.invalid'));assert.deepStrictEqual(h.state.items,[]);
 });

 it('publishes the final result before a stalled list refresh and marks an aborted request unknown',async()=>{
  let finish;const refreshed=new Promise(r=>finish=r);const h=harness(async()=>{throw Object.assign(Error('aborted'),{name:'AbortError'})},()=>refreshed);
  const pending=h.upload([new File(['a'],'sample.png')]);for(let i=0;i<5;i++)await Promise.resolve();
  assert.ok(h.feedback[0].includes('准备上传'));assert.ok(h.feedback.some(x=>x.includes('结果未知')));finish();await pending;
 });

});
