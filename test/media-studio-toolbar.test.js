const assert=require('assert');
const fs=require('fs');
const page=fs.readFileSync(require('path').join(__dirname,'../studio/index.html'),'utf8');
const source=page.slice(page.indexOf('function actionPayload(action){'),page.indexOf('async function selectAllMatching(){'));

describe('Media Studio folder toolbar requests',function(){
  async function run(action,override){
    const state={busy:false,selected:new Set(['sample.jpg']),items:[{id:'sample.jpg',folderId:'old'}]};
    const requests=[],errors=[];
    let dialogs=0;
    const api=async(url,options)=>{
      const body=JSON.parse(options.body);requests.push({url,body});
      assert.strictEqual(body.action,'move_folder');
      assert.ok(Object.hasOwn(body,'folderId'),'Request must explicitly include folderId');
      return {success:1,failed:0,results:[{id:'sample.jpg',ok:true,metadata:{folderId:body.folderId,liked:true,aiPublished:true,tags:['keep'],albums:[],category:''}}]};
    };
    const runAction=new Function('state','api','$','toast','setBusyUI','render','renderFolders','openMoveDialog',source+';return runAction;')(
      state,api,()=>({textContent:''}),message=>errors.push(message),()=>{},()=>{},()=>{},()=>dialogs++);
    await runAction(action,override);
    return {state,requests,errors,dialogs};
  }
  it('moves toolbar selection to unfiled with an explicit null folder ID',async function(){
    const r=await run('clear_folder');
    assert.strictEqual(r.requests.length,1);
    assert.deepStrictEqual(r.requests[0].body,{action:'move_folder',ids:['sample.jpg'],folderId:null});
    assert.strictEqual(r.state.items[0].folderId,null);
    assert.strictEqual(r.state.items[0].liked,true);
    assert.strictEqual(r.state.items[0].published,true);
    assert.strictEqual(r.state.selected.size,0);
  });
  it('preserves a selected destination when moving into a folder',async function(){
    const folderId='a'.repeat(32),r=await run('move_folder',{folderId});
    assert.strictEqual(r.requests[0].body.folderId,folderId);
    assert.strictEqual(r.state.items[0].folderId,folderId);
  });
  it('opens the destination dialog before sending a move request',async function(){
    const r=await run('move_folder');
    assert.strictEqual(r.dialogs,1);
    assert.strictEqual(r.requests.length,0);
  });
});
