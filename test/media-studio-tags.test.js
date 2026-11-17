const assert=require('assert');
const fs=require('fs');
const {createMockKV,makeContext}=require('./helpers');
const page=fs.readFileSync(require('path').join(__dirname,'../studio/index.html'),'utf8');
const helpers=page.slice(page.indexOf('const tagEditor='),page.indexOf('function actionPayload('));
function harness(){
 const elements={tagNames:{value:''},tagError:{textContent:''},tagDialog:{closed:false,close(){this.closed=true;}}};
 const calls=[];
 const h=new Function('$','runAction',helpers+';return {parseTagNames,collectTagChoices,saveTags,tagEditor};')(id=>elements[id],async(action,payload)=>calls.push({action,payload}));
 return {...h,elements,calls};
}
describe('Media Studio tag management',function(){
 it('accepts Chinese/English commas and lines and deduplicates exact tag names',function(){
  const h=harness();assert.deepStrictEqual(h.parseTagNames(' 店铺，Banner,店铺\n新品 '),['店铺','Banner','新品']);
 });
 it('rejects excessive or unsafe tag input before a request is sent',async function(){
  const h=harness();
  for(const raw of ['<script>','a'.repeat(49),'bad\u0000tag',Array.from({length:16},(_,i)=>'tag'+i).join(',')])assert.throws(()=>h.parseTagNames(raw));
  h.tagEditor.action='add_tags';h.elements.tagNames.value='<bad>';
  await h.saveTags({preventDefault(){}});
  assert.strictEqual(h.calls.length,0);assert.strictEqual(h.elements.tagDialog.closed,false);assert.ok(h.elements.tagError.textContent);
 });
 it('lists only selected media tags for removal and counts mixed membership',function(){
  const h=harness(),items=[{id:'a',tags:['Banner','Banner','Shop']},{id:'b',tags:['Shop']},{id:'c',tags:['Private']}];
  const choices=h.collectTagChoices(items,new Set(['a','b']),'remove_tags');
  assert.deepStrictEqual(choices.map(x=>x.name),['Banner','Shop']);
  assert.strictEqual(choices.find(x=>x.name==='Shop').selected,2);
  assert.strictEqual(choices.find(x=>x.name==='Banner').selected,1);
 });
 it('submits chosen and new tags together without changing the action',async function(){
  const h=harness();h.tagEditor.action='add_tags';h.tagEditor.chosen.add('Shop');h.elements.tagNames.value='Shop,New';
  await h.saveTags({preventDefault(){}});
  assert.deepStrictEqual(h.calls,[{action:'add_tags',payload:{names:['Shop','New']}}]);
  assert.strictEqual(h.elements.tagDialog.closed,true);
 });
 it('removal ignores the hidden input and only submits chosen tags',async function(){
  const h=harness();h.tagEditor.action='remove_tags';h.tagEditor.chosen.add('Shop');h.elements.tagNames.value='New';
  await h.saveTags({preventDefault(){}});
  assert.deepStrictEqual(h.calls,[{action:'remove_tags',payload:{names:['Shop']}}]);
 });
 it('filters exact tags alongside search and current folder constraints',function(){
  const src=page.slice(page.indexOf('function filterItems(){'),page.indexOf('function elt('));
  const elements={search:{value:''},albumFilter:{value:''},tagFilter:{value:'Shop'},order:{value:'new'}};
  const state={chip:'all',items:[{id:'a',name:'a',date:1,tags:['Shop'],albums:[]},{id:'b',name:'b',date:2,tags:['Shopify'],albums:[]},{id:'c',name:'c',date:3,tags:['Shop'],albums:[]}]};
  const filter=new Function('state','$','inSelectedFolder',src+';return filterItems;')(state,id=>elements[id],x=>x.id!=='c');
  assert.deepStrictEqual(filter().map(x=>x.id),['a']);
 });
 it('reports tag capacity per file and preserves all metadata on failure',async function(){
  const {onRequestPost}=await import('../functions/api/manage/bulk.js');
  const tags=Array.from({length:30},(_,i)=>'tag'+i);
  const kv=createMockKV({'sample.jpg':{tags,liked:true,aiPublished:false,folderId:'keep'}});
  const response=await onRequestPost(makeContext({env:{BASIC_USER:'admin',BASIC_PASS:'test',img_url:kv},request:new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add_tags',ids:['sample.jpg'],names:['extra']})})}));
  const result=await response.json();
  assert.strictEqual(result.failed,1);assert.match(result.results[0].error,/30 per file/);
  assert.strictEqual(kv.operations.put.length,0);
  assert.deepStrictEqual(kv.snapshot('sample.jpg').metadata,{tags,liked:true,aiPublished:false,folderId:'keep'});
 });
});
