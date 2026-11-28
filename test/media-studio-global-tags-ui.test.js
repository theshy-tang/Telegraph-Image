const assert=require('assert'),fs=require('fs'),path=require('path');const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8');const source=page.slice(page.indexOf('const tagManagerState='),page.indexOf('const catalogSearch='));
function harness(api,confirmation=true){
 const elements={};for(const id of ['tagManagerConfirm','tagManagerQuery','tagManagerMore','tagManagerStatus','tagManagerSource','tagManagerTarget','tagManagerAction','tagManagerEditStatus','tagManagerSave','tagManagerFields','tagManagerClose'])elements[id]={value:'',disabled:false,textContent:''};
 elements.tagManagerConfirm.checked=confirmation;elements.tagManagerSource.value='Original';elements.tagManagerTarget.value='Renamed';elements.tagManagerAction.value='rename';const state={busy:false};let reloads=0;const catalog={items:[{}],seen:new Set(['old']),requestId:0,cursor:'old',busy:false};
 const h=new Function('state','$','api','confirm','setBusyUI','loadPage','catalogSearch',source+';renderGlobalTags=()=>{};return {applyGlobalTag,loadGlobalTags,tagManagerState};')(state,id=>elements[id],api,()=>confirmation,()=>{},async reset=>{assert.strictEqual(reset,true);reloads++;},catalog);
 return {...h,elements,state,catalog,reloads:()=>reloads};
}
describe('Studio global tag UI coordination',function(){
 it('does not send invalid changes or unconfirmed global operations',async()=>{
  let calls=0;const h=harness(async()=>{calls++;},false);await h.applyGlobalTag({preventDefault(){}});assert.strictEqual(calls,0);assert.strictEqual(h.reloads(),0);
  const invalid=harness(async()=>{calls++;});for(const name of ['Original','<bad>','bad'+String.fromCharCode(0),'x'.repeat(49)]){invalid.elements.tagManagerTarget.value=name;await invalid.applyGlobalTag({preventDefault(){}});}assert.strictEqual(calls,0);
 });
 it('preserves failed inputs, prevents duplicate writes and reloads stale media after uncertain writes',async()=>{
  let rejectWrite;const h=harness(url=>url.includes('?')?Promise.resolve({tags:[],total:0,after:null}):new Promise((_,reject)=>{rejectWrite=reject;}));const pending=h.applyGlobalTag({preventDefault(){}});assert.strictEqual(h.tagManagerState.writing,true);assert.strictEqual(h.elements.tagManagerFields.disabled,true);assert.strictEqual(await h.applyGlobalTag({preventDefault(){}}),false);rejectWrite(Error('Timeout'));assert.strictEqual(await pending,false);assert.strictEqual(h.elements.tagManagerSource.value,'Original');assert.strictEqual(h.elements.tagManagerTarget.value,'Renamed');assert.strictEqual(h.reloads(),1);assert.deepStrictEqual(h.catalog.items,[]);assert.strictEqual(h.catalog.cursor,null);assert.strictEqual(h.tagManagerState.writing,false);assert.strictEqual(h.elements.tagManagerFields.disabled,false);
 });
 it('ignores late tag searches and freezes query while paginating',async()=>{
  const pending=[];const h=harness((url,options)=>new Promise(resolve=>pending.push({url,options,resolve})));h.elements.tagManagerQuery.value='Old';const first=h.loadGlobalTags(true);h.elements.tagManagerQuery.value='New';const second=h.loadGlobalTags(true);assert.strictEqual(pending[0].options.signal.aborted,true);pending[1].resolve({tags:[{name:'New',count:2}],total:2,after:'New'});await second;pending[0].resolve({tags:[{name:'Old',count:1}],total:1,after:null});await first;assert.strictEqual(h.tagManagerState.items[0].name,'New');h.elements.tagManagerQuery.value='Unsubmitted';const more=h.loadGlobalTags(false);assert.match(pending[2].url,/q=New/);pending[2].resolve({tags:[{name:'Newer',count:1}],total:2,after:null});await more;assert.strictEqual(h.tagManagerState.items.length,2);
 });
});
