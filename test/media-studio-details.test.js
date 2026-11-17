const assert=require('assert');const fs=require('fs');const {createMockKV,makeContext}=require('./helpers');
const html=fs.readFileSync(require('path').join(__dirname,'../studio/index.html'),'utf8');
const source=html.slice(html.indexOf('let detailSession='),html.indexOf('function preview(x){'));
function detailHarness(api){
 const item={id:'sample.jpg',name:'Original',category:'',tags:['A'],liked:false,published:false};
 const session={x:item,tags:['Draft'],name:{value:'Draft name'},category:{value:'Draft category'},fields:{disabled:false},message:{textContent:''}};
 const h=new Function('api','render','renderFolders',source+';return {detailTagList,detailDirty,detailWrite,setSession(d){detailSession=d;}};')(api,()=>{},()=>{});h.setSession(session);return {...h,session,item};
}
describe('Media Studio editable details',function(){
 it('edits details without changing KV payload, file ID, folder, favorite or AI state',async function(){
  const {onRequestPost}=await import('../functions/api/manage/bulk.js');
  const metadata={fileName:'old.jpg',category:'old',tags:['Old'],liked:true,aiPublished:false,folderId:'original-folder',provider:'telegram',fileSize:100,unknown:'keep'};
  const kv=createMockKV({'sample.jpg':{value:'unchanged-file-reference',metadata}});
  const response=await onRequestPost(makeContext({env:{BASIC_USER:'admin',BASIC_PASS:'test',img_url:kv},request:new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'edit_details',ids:['sample.jpg'],fileName:' New name.jpg ',category:' New category ',tags:['New','New']})})}));
  const result=await response.json();assert.strictEqual(result.success,1);assert.strictEqual(result.results[0].metadata.fileName,'New name.jpg');
  const stored=kv.snapshot('sample.jpg');assert.strictEqual(stored.value,'unchanged-file-reference');
  for(const key of ['liked','aiPublished','folderId','provider','fileSize','unknown'])assert.deepStrictEqual(stored.metadata[key],metadata[key]);
  assert.deepStrictEqual(stored.metadata.tags,['New']);assert.strictEqual(stored.metadata.category,'New category');
 });
 it('rejects invalid details and multi-file edits before any writes',async function(){
  const {onRequestPost}=await import('../functions/api/manage/bulk.js');
  const kv=createMockKV({'sample.jpg':{fileName:'Keep'}});
  const valid={action:'edit_details',ids:['sample.jpg'],fileName:'Name',category:'',tags:[]};
  for(const patch of [{fileName:''},{fileName:'<script>'},{tags:Array.from({length:31},(_,i)=>''+i)},{tags:['bad\u0000']},{category:'a'.repeat(49)},{ids:['sample.jpg','other.jpg']}]){
   const r=await onRequestPost(makeContext({env:{BASIC_USER:'admin',BASIC_PASS:'test',img_url:kv},request:new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,...patch})})}));assert.strictEqual(r.status,400);
  }
  assert.strictEqual(kv.operations.put.length,0);
 });
 it('supports deduplication and removal without accepting unsafe or overlong tags',function(){
  const h=detailHarness();assert.deepStrictEqual(h.detailTagList(['A',' A ','','B']),['A','B']);
  assert.throws(()=>h.detailTagList(['<bad>']));assert.throws(()=>h.detailTagList(['a'.repeat(49)]));assert.throws(()=>h.detailTagList(Array.from({length:31},(_,i)=>''+i)));
 });
 it('keeps the draft and restores controls when a request fails',async function(){
  const h=detailHarness(async()=>{throw Error('Network unavailable');});
  assert.strictEqual(await h.detailWrite('edit_details',{}),false);
  assert.strictEqual(h.item.name,'Original');assert.strictEqual(h.session.name.value,'Draft name');assert.deepStrictEqual(h.session.tags,['Draft']);
  assert.strictEqual(h.session.fields.disabled,false);assert.strictEqual(h.session.busy,false);assert.match(h.session.message.textContent,/Network unavailable/);
 });
 it('applies only server-confirmed metadata and blocks duplicate saves',async function(){
  let release,calls=0;
  const h=detailHarness(()=>{calls++;return new Promise(resolve=>release=resolve);});
  const first=h.detailWrite('favorite');assert.strictEqual(await h.detailWrite('favorite'),false);assert.strictEqual(calls,1);
  release({results:[{id:'sample.jpg',ok:true,metadata:{fileName:'Original',liked:true,aiPublished:false,tags:['A'],albums:[],category:'',folderId:null}}]});
  assert.strictEqual(await first,true);assert.strictEqual(h.item.liked,true);assert.strictEqual(h.item.published,false);
  assert.strictEqual(h.session.name.value,'Draft name');assert.strictEqual(h.detailDirty(),true);
 });
 it('detects unsaved text still in the add-tag input',function(){
  const h=detailHarness();h.session.name.value=h.item.name;h.session.category.value=h.item.category;h.session.tags=[...h.item.tags];
  assert.strictEqual(h.detailDirty(),false);h.session.addInput={value:'Not added yet'};assert.strictEqual(h.detailDirty(),true);
 });
 it('submits the draft baseline version, even when displayed metadata advances',async()=>{
  let sent;const h=detailHarness(async(url,options)=>{sent=JSON.parse(options.body);return {results:[{id:'sample.jpg',ok:false,error:'Conflict'}]};});
  h.session.baseVersion=3;h.item.metadataVersion=5;
  assert.strictEqual(await h.detailWrite('edit_details',{fileName:'Draft',category:'',tags:[]}),false);
  assert.strictEqual(sent.metadataVersion,3);assert.strictEqual(h.session.name.value,'Draft name');
 });

});
