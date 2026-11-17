const assert=require('assert');
const fs=require('fs');
const page=fs.readFileSync(require('path').join(__dirname,'../studio/index.html'),'utf8');
const source=page.slice(page.indexOf('function actionPayload(action){'),page.indexOf('async function selectAllMatching(){'));

describe('Media Studio folder toolbar requests',function(){
  async function run(action,override,options={}){
    const state={busy:false,selected:new Set(['sample.jpg']),items:[{id:'sample.jpg',folderId:'old'}]};
    if(options.ids)state.selected=new Set(options.ids);
    const requests=[],errors=[];
    let dialogs=0;
    const api=async(url,requestOptions)=>{
      const body=JSON.parse(requestOptions.body);requests.push({url,body});
      assert.strictEqual(body.action,'move_folder');
      assert.ok(Object.hasOwn(body,'folderId'),'Request must explicitly include folderId');
      if(options.api)return options.api(body,requests.length);
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
  it('retains failed, interrupted and unsent IDs without reselecting successes',async function(){
    const ids=Array.from({length:120},(_,i)=>'sample'+i+'.jpg');
    const r=await run('clear_folder',undefined,{ids,api(body,n){
      if(n===2)throw Error('Network interrupted');
      return {results:body.ids.map((id,i)=>({id,ok:i!==0,metadata:{folderId:null}}))};
    }});
    assert.strictEqual(r.requests.length,2);
    assert.deepStrictEqual([...r.state.selected],[ids[0],...ids.slice(50)]);
    assert.strictEqual(r.state.busy,false);
  });
  it('retains IDs missing from a partial server response for retry',async function(){
    const r=await run('clear_folder',undefined,{api(){return {results:[]};}});
    assert.deepStrictEqual([...r.state.selected],['sample.jpg']);
  });

});
