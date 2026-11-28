const assert=require('assert');
const fs=require('fs');
const path=require('path');
const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8');
const start=page.indexOf("const FOLDER_WRITE_CACHE_KEY=");
const end=page.indexOf("async function loadFolders(){",start);
assert(start>=0&&end>start,'Missing confirmed folder writes reconciler');
const source=page.slice(start,end);

function setup(){
  const storage=new Map();
  const sessionStorage={
    getItem:key=>storage.get(key)||null,
    setItem:(key,value)=>storage.set(key,value)
  };
  const api=new Function('sessionStorage',source+'return {recordConfirmedFolderWrite,applyConfirmedFolderWrites,pendingFolderWrites};')(sessionStorage);
  return api;
}
const folder=(id,name,parentId=null)=>({id,name,parentId,createdAt:1,updatedAt:2});

describe('Media Studio eventual KV consistency workaround',function(){
  it('displays a server-confirmed new folder when subsequent KV list is stale',function(){
    const api=setup();
    const added=folder('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Shopify');
    api.recordConfirmedFolderWrite('create',added);
    assert.deepStrictEqual(api.applyConfirmedFolderWrites([]),[added]);
  });
  it('preserves a confirmed rename when the KV list still has the old name',function(){
    const api=setup();
    const id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const oldFolder=folder(id,'Old');
    const updated={...oldFolder,name:'New'};
    api.recordConfirmedFolderWrite('upsert',updated);
    assert.strictEqual(api.applyConfirmedFolderWrites([oldFolder])[0].name,'New');
  });
  it('keeps a confirmed deletion hidden until the server listing catches up',function(){
    const api=setup();
    const removed=folder('cccccccccccccccccccccccccccccccc','Removed');
    api.recordConfirmedFolderWrite('delete',removed);
    assert.deepStrictEqual(api.applyConfirmedFolderWrites([removed]),[]);
    assert.strictEqual(api.pendingFolderWrites().length,1);
    assert.deepStrictEqual(api.applyConfirmedFolderWrites([]),[]);
    assert.strictEqual(api.pendingFolderWrites().length,0);
  });
  it('clears the overlay once KV returns the confirmed state',function(){
    const api=setup();
    const added=folder('dddddddddddddddddddddddddddddddd','New');
    api.recordConfirmedFolderWrite('create',added);
    assert.strictEqual(api.applyConfirmedFolderWrites([added]).length,1);
    assert.strictEqual(api.pendingFolderWrites().length,0);
  });
  it('uses returned create/edit payload directly instead of immediate full KV refresh',function(){
    const begin=page.indexOf('async function saveFolder(e){'),end=page.indexOf('async function deleteSelectedFolder(){',begin);
    assert(begin>=0&&end>begin);
    const fn=page.slice(begin,end);
    assert.match(fn,/recordConfirmedFolderWrite\(editing\?'upsert':'create',result\.folder\)/);
    assert.doesNotMatch(fn,/await loadFolders\(\)/);
    assert.match(fn,/selectFolder\(result\.folder\.id\)/);
  });
});
