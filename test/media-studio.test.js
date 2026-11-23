const { enableFixtureCatalog, catalogRequest } = require('./catalog-access-fixture');
const { createSQLiteD1 } = require('./sqlite-d1');
const assert = require('assert');
const { createMockKV, makeContext } = require('./helpers');

function req(action, ids, extra = {}) {
  return new Request('https://example.com/api/manage/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
    body: JSON.stringify({ action, ids, ...extra }),
  });
}
const img = { fileName: 'wallpaper.png', liked: false, aiPublished: false, ListType: 'None', Label: 'None', fileSize: 600 };
const envFor = kv => ({ img_url: kv, BASIC_USER: 'admin', BASIC_PASS: 'password' });
describe('Media Studio bulk API', function () {
  let bulk;
  before(async function () {
    bulk = (await import('../functions/api/manage/bulk.js')).onRequestPost;
  });

  it('fails closed if admin credentials are not configured', async function () {
    const kv=createMockKV({'wallpaper.png':img});
    const res=await bulk(makeContext({ request:req('favorite',['wallpaper.png']), env:{img_url:kv} }));
    assert.strictEqual(res.status,503);
    assert.strictEqual(kv.operations.put.length,0);
  });

  it('sets favorite idempotently and preserves original KV value', async function () {
    const kv=createMockKV({'wallpaper.png':{value:'content',metadata:img}});
    for(let i=0;i<2;i++){
      const res=await bulk(makeContext({request:req('favorite',['wallpaper.png']),env:envFor(kv)}));
      assert.strictEqual(res.status,200);
    }
    assert.strictEqual(kv.snapshot('wallpaper.png').metadata.liked,true);
    assert.strictEqual(kv.snapshot('wallpaper.png').value,'content');
    assert.strictEqual(kv.snapshot('wallpaper.png').metadata.fileName,'wallpaper.png');
  });

  it('supports independently tagged albums and AI status', async function () {
    const kv=createMockKV({'wallpaper.png':img});
    const run=async (action,extra={})=>{
      const res=await bulk(makeContext({request:req(action,['wallpaper.png'],extra),env:envFor(kv)}));
      assert.strictEqual(res.status,200);
    };
    await run('add_tags',{names:['travel','nature']});
    await run('add_albums',{names:['Personal','Moodboard']});
    await run('remove_tags',{names:['travel']});
    await run('set_category',{category:'Photography'});
    await run('publish');
    await run('unfavorite');
    const actual=kv.snapshot('wallpaper.png').metadata;
    assert.deepStrictEqual(actual.tags,['nature']);
    assert.deepStrictEqual(actual.albums,['Personal','Moodboard']);
    assert.strictEqual(actual.category,'Photography');
    assert.strictEqual(actual.aiPublished,true);
    assert.strictEqual(actual.liked,false);
  });

  it('refuses to publish blocked content', async function () {
    const kv=createMockKV({'blocked.png':{...img,ListType:'Block'}});
    const res=await bulk(makeContext({request:req('publish',['blocked.png']),env:envFor(kv)}));
    assert.strictEqual(res.status,200);
    const data=await res.json();
    assert.strictEqual(data.success,0);
    assert.strictEqual(data.failed,1);
    assert.strictEqual(kv.operations.put.length,0);
  });

  it('rejects oversized batches and untrusted origin', async function () {
    const kv=createMockKV({});
    const ids=Array.from({length:51},(_,i)=>'image'+i+'.png');
    const res=await bulk(makeContext({request:req('favorite',ids),env:envFor(kv)}));
    assert.strictEqual(res.status,400);
    const cross=new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({action:'favorite',ids:['wallpaper.png']})});
    const blocked=await bulk(makeContext({request:cross,env:envFor(kv)}));
    assert.strictEqual(blocked.status,403);
  });
});

describe('Media Studio curated catalog', function () {
  let runtime;
  afterEach(function () { if (runtime) runtime.close(); });
  it('does not expose liked-only media, but includes explicitly published media', async function () {
    const {onRequest}=await import('../functions/api/shopify-assets.js');
    const img_url=createMockKV({
      'liked.png':{...img,liked:true,aiPublished:false},
      'work.png':{...img,liked:false,aiPublished:true,tags:['Shopify'],albums:['Store A']},
      'blocked.png':{...img,aiPublished:true,ListType:'Block'},
      'private.mp4':{...img,aiPublished:true},
    });
    runtime = createSQLiteD1();
    const env = { img_url, MEDIA_STUDIO_DB: runtime.db };
    await enableFixtureCatalog(env);
    const res=await onRequest(makeContext({request:catalogRequest(),env}));
    assert.strictEqual(res.status,200);
    const body=await res.json();
    assert.strictEqual(body.items.length,1);
    assert.strictEqual(body.items[0].url,'https://example.com/file/work.png');
    assert.deepStrictEqual(body.items[0].tags,['Shopify']);
    assert.deepStrictEqual(body.items[0].albums,['Store A']);
  });
});
