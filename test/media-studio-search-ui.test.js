const assert=require('assert');const fs=require('fs');const page=fs.readFileSync(require('path').join(__dirname,'../studio/index.html'),'utf8');
const source=page.slice(page.indexOf('const catalogSearch='),page.indexOf('let detailSession='));
function harness(api){
 const state={items:[],seen:new Set(),selected:new Set(['picked.jpg'])};
 const elements={catalogQuery:{value:'first'},catalogTag:{value:''},catalogAlbum:{value:''},catalogView:{value:'all'},catalogFolder:{value:'all'},catalogDescendants:{checked:false},catalogOrder:{value:'new'},catalogMore:{disabled:false},catalogStatus:{textContent:''},catalogTagOptions:{replaceChildren(){},append(){}}};
 const h=new Function('state','$','api','normalize','isSafeId','elt',source+';renderCatalogResults=()=>{};return {searchCatalog,catalogSearch};')(state,id=>elements[id],api,r=>({id:r.name,metadataVersion:r.metadata.metadataVersion,name:r.metadata.fileName}),()=>true,()=>({}));
 return {...h,state,elements};
}
describe('Studio global search request coordination',function(){
 it('ignores late results after the search conditions change',async()=>{
  const pending=[];const h=harness((url,options)=>new Promise(resolve=>pending.push({url,options,resolve})));
  const first=h.searchCatalog(true);h.elements.catalogQuery.value='second';const second=h.searchCatalog(true);
  assert.strictEqual(pending[0].options.signal.aborted,true);
  pending[1].resolve({keys:[{name:'newest.jpg',metadata:{fileName:'New',metadataVersion:2}}],total:1,cursor:null,tags:[]});await second;
  pending[0].resolve({keys:[{name:'staler.jpg',metadata:{fileName:'Stale',metadataVersion:1}}],total:1,cursor:null,tags:[]});assert.strictEqual(await first,false);
  assert.deepStrictEqual(h.state.items.map(x=>x.id),['newest.jpg']);assert.ok(h.state.selected.has('picked.jpg'));assert.strictEqual(h.catalogSearch.busy,false);
 });
 it('continues a frozen query across pages and never downgrades newer metadata',async()=>{
  let call=0;const urls=[];const h=harness(async url=>{urls.push(url);call++;return call===1?{keys:[{name:'sample.jpg',metadata:{fileName:'New',metadataVersion:2}}],total:2,cursor:'next',tags:[]}:{keys:[{name:'sample.jpg',metadata:{fileName:'Old',metadataVersion:1}},{name:'otherx.jpg',metadata:{fileName:'Other',metadataVersion:0}}],total:2,cursor:null,tags:[]};});
  await h.searchCatalog(true);h.elements.catalogQuery.value='not submitted';await h.searchCatalog(false);
  assert.match(urls[1],/q=first/);assert.match(urls[1],/cursor=next/);assert.strictEqual(h.state.items.find(x=>x.id==='sample.jpg').name,'New');assert.strictEqual(h.catalogSearch.items.length,2);assert.strictEqual(h.elements.catalogMore.disabled,true);
 });
});
