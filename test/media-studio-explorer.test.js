const assert=require('assert');
const fs=require('fs');
const path=require('path');

const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8');
function extract(start,end){
  const a=page.indexOf(start), b=page.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'Missing frontend function: '+start);
  return page.slice(a,b);
}
const filterFn=extract('function inSelectedFolder(media){','function folderOptions(');
const ancestorFn=extract('function expandAncestors(id){','function renderBreadcrumbs(');
const folders=[
  {id:'root',name:'Shopify',parentId:null},
  {id:'child',name:'Shopify 装修',parentId:'root'},
  {id:'grandchild',name:'Banner',parentId:'child'},
  {id:'other',name:'个人',parentId:null},
];
const folderById=id=>folders.find(f=>f.id===id)||null;
const matching=(state,file)=>new Function('state','folderById','media',filterFn+'return inSelectedFolder(media)')(state,folderById,file);

describe('Media Studio explorer folder behavior',function(){
  it('shows only direct media in a selected folder by default',function(){
    const state={folderSelection:'root',includeDescendants:false};
    assert.equal(matching(state,{folderId:'root'}),true);
    assert.equal(matching(state,{folderId:'child'}),false);
    assert.equal(matching(state,{folderId:'grandchild'}),false);
    assert.equal(matching(state,{folderId:'other'}),false);
  });
  it('includes every descendant only when explicitly enabled',function(){
    const state={folderSelection:'root',includeDescendants:true};
    assert.equal(matching(state,{folderId:'root'}),true);
    assert.equal(matching(state,{folderId:'child'}),true);
    assert.equal(matching(state,{folderId:'grandchild'}),true);
    assert.equal(matching(state,{folderId:'other'}),false);
    assert.equal(matching(state,{folderId:null}),false);
  });
  it('preserves the special all/unfiled views',function(){
    assert.equal(matching({folderSelection:'all',includeDescendants:false},{folderId:'child'}),true);
    assert.equal(matching({folderSelection:'unfiled',includeDescendants:true},{folderId:null}),true);
    assert.equal(matching({folderSelection:'unfiled',includeDescendants:true},{folderId:'child'}),false);
  });
  it('expands every ancestor for a selected nested folder',function(){
    const state={expandedFolders:new Set()};
    new Function('state','folderById','id',ancestorFn+'return expandAncestors(id)')(state,folderById,'grandchild');
    assert.deepStrictEqual([...state.expandedFolders].sort(),['child','root']);
  });
  it('has separate disclosure toggles, folder buttons, breadcrumbs and recursive switch',function(){
    assert.match(page,/toggle\.setAttribute\('aria-expanded',String\(expanded\)\)/);
    assert.match(page,/toggle\.addEventListener\('click'/);
    assert.match(page,/button\.addEventListener\('click',\(\)=>selectFolder\(folder.id\)\)/);
    assert.match(page,/id="folderPath" class="folder-breadcrumb"/);
    assert.match(page,/id="includeDescendants" type="checkbox"/);
    assert.match(page,/state\.includeDescendants=false/);
    assert.match(page,/function renderChildFolderCards\(/);
  });
});
