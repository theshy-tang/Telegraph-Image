const assert=require('assert'),fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');const {createMockKV,makeContext}=require('./helpers');
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(__dirname,'../migrations')).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 const db={prepare(query){const statement=sql.prepare(query);let args=[];return {bind(...a){args=a;return this},async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}}},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.all());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const source={};for(let n=0;n<103;n++){const id=n===102?'zzzzz_latest.jpg':'image'+String(n).padStart(3,'0')+'.jpg',m={fileName:'Image '+n,TimeStamp:1700000000000+n,tags:[],albums:[]};source[id]=m;sql.prepare('INSERT INTO studio_media_inventory VALUES (?,?,?,?,?)').run(id,'image',m.TimeStamp,JSON.stringify(m),1);}
 sql.exec('UPDATE studio_catalog_state SET ready=1');const env={img_url:createMockKV(source),MEDIA_STUDIO_DB:db,MEDIA_STUDIO_METADATA_D1:'true'};
 return {sql,env};
}
describe('Studio library-wide ordered main listing',()=>{
 let onRequest;before(async()=>{onRequest=(await import('../functions/api/manage/list.js')).onRequest});
 const request=(f,p)=>onRequest(makeContext({env:f.env,request:new Request('https://example.com/api/manage/list?'+new URLSearchParams(p))}));
 it('puts a new upload outside the first 100 KV keys at the front and paginates without duplicates',async()=>{const f=fixture();try{
  const a=await (await request(f,{order:'new',limit:'100'})).json();assert.strictEqual(a.keys[0].name,'zzzzz_latest.jpg');assert.strictEqual(a.total,103);assert.strictEqual(a.orderScope,'library');assert.strictEqual(f.env.img_url.operations.list.length,0);
  const b=await (await request(f,{order:'new',limit:'100',cursor:a.cursor})).json();assert.strictEqual(b.keys.length,3);assert.strictEqual(b.list_complete,true);assert.strictEqual(new Set([...a.keys,...b.keys].map(x=>x.name)).size,103);
  assert.strictEqual((await request(f,{order:'old',cursor:a.cursor})).status,400);
  const oldest=await (await request(f,{order:'old'})).json();assert.strictEqual(oldest.keys[0].name,'image000.jpg');
 }finally{f.sql.close();}});
 it('preserves legacy KV cursors and clearly identifies an unready-index fallback',async()=>{const f=fixture();try{
  const old=await (await request(f,{limit:'100'})).json();assert.strictEqual(old.keys[0].name,'image000.jpg');assert.strictEqual(old.orderScope,'loaded');
  f.sql.exec('UPDATE studio_catalog_state SET ready=0');const fallback=await (await request(f,{order:'new',limit:'100'})).json();assert.strictEqual(fallback.orderScope,'loaded');assert.strictEqual(fallback.catalogReady,undefined);
 }finally{f.sql.close();}});
 it('respects authoritative edited metadata and tombstones while validating order and prefix',async()=>{const f=fixture();try{
  f.sql.prepare('INSERT INTO studio_media_metadata VALUES (?,?,?,0,?)').run('zzzzz_latest.jpg',JSON.stringify({fileName:'Renamed',liked:true,tags:[]}),7,1);
  const page=await (await request(f,{order:'new'})).json();assert.strictEqual(page.keys[0].metadata.fileName,'Renamed');assert.strictEqual(page.keys[0].metadata.metadataVersion,7);
  f.sql.exec("UPDATE studio_media_metadata SET deleted=1 WHERE media_id='zzzzz_latest.jpg'");assert.strictEqual((await (await request(f,{order:'new'})).json()).total,102);
  assert.strictEqual((await request(f,{order:'random'})).status,400);assert.strictEqual((await request(f,{order:'new',prefix:'x'})).status,400);
 }finally{f.sql.close();}});
});

describe('Studio main list order changes',()=>{
 it('sends order with a new cursor sequence and preserves selection when sorting changes',async()=>{
  const page=fs.readFileSync(path.join(__dirname,'../studio/index.html'),'utf8'),start=page.indexOf('async function loadPage('),source=page.slice(start,page.indexOf('function folderById(',start));
  const state={busy:false,items:[],seen:new Set(),selected:new Set(['selected.jpg']),cursor:'old-cursor',complete:false,tiles:new Map(),limit:100};
  const elements={order:{value:'old'},loadMore:{},status:{},gallerySkeleton:{hidden:true},grid:{replaceChildren(){},setAttribute(){},removeAttribute(){}}};let url;
  const load=new Function('state','$','api','normalize','isSafeId','render','renderFolders','toast',source+'return loadPage;')(state,id=>elements[id],async u=>{url=u;assert.strictEqual(elements.gallerySkeleton.hidden,state.items.length>0);return {keys:[],total:103,orderScope:'library',cursor:'new-cursor',list_complete:false}},x=>x,()=>true,()=>{},()=>{},()=>{});
  await load(true,{preserveSelection:true});assert.ok(url.includes('order=old'));assert.ok(!url.includes('cursor='));assert.strictEqual(state.cursor,'new-cursor');assert.strictEqual(state.listScope,'library');assert.ok(state.selected.has('selected.jpg'));assert.strictEqual(elements.order.disabled,false);assert.strictEqual(elements.gallerySkeleton.hidden,true);
  state.items.push({name:'existing.jpg'});await load(true);assert.strictEqual(elements.gallerySkeleton.hidden,true);
 });
});
