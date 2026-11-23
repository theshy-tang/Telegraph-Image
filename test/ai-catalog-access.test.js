const assert = require('node:assert/strict');
const { createMockKV } = require('./helpers');
const { createSQLiteD1 } = require('./sqlite-d1');

describe('AI catalog access pass', function () {
  const catalogUrl = 'https://example.com/api/shopify-assets';
  const manageUrl = 'https://example.com/api/manage/catalog-access';
  const basic = 'Basic ' + btoa('fixture:fixture');
  let runtime, env, management, handlers, catalog;

  before(async function () {
    management = (await import('../functions/api/manage/_middleware.js')).onRequest;
    handlers = await import('../functions/api/manage/catalog-access.js');
    catalog = (await import('../functions/api/shopify-assets.js')).onRequest;
  });

  beforeEach(function () {
    runtime = createSQLiteD1();
    env = {
      MEDIA_STUDIO_DB: runtime.db,
      BASIC_USER: 'fixture',
      BASIC_PASS: 'fixture',
      SHOPIFY_AI_CATALOG_ENABLED: 'true',
      img_url: createMockKV({
        'allowed.png': { aiPublished: true },
        'private.png': { liked: true },
      }),
    };
  });

  afterEach(function () { runtime.close(); });

  function manage(action, authorization = basic, origin = 'https://example.com') {
    const request = new Request(manageUrl, {
      method: action ? 'POST' : 'GET',
      headers: { ...(authorization ? { Authorization: authorization } : {}), 'Content-Type': 'application/json', Origin: origin },
      ...(action ? { body: JSON.stringify({ action }) } : {}),
    });
    const handler = action ? handlers.onRequestPost : handlers.onRequestGet;
    let stage = 0;
    const context = { env, request, next: () => (management[stage++] || handler)(context) };
    return context.next();
  }

  function read(key, url = catalogUrl, method = 'GET') {
    return catalog({ env, request: new Request(url, {
      method,
      headers: key ? { Authorization: 'Bearer ' + key } : {},
    }) });
  }

  it('requires a valid pass, pauses it, resumes it, and permanently revokes it', async function () {
    delete env.SHOPIFY_AI_CATALOG_ENABLED;
    assert.equal((await read()).status, 404);
    assert.equal((await manage('enable')).status, 409);
    const issued = await manage('issue');
    assert.equal(issued.headers.get('Cache-Control'), 'no-store');
    const { key } = await issued.json();
    assert.match(key, /^ms_[0-9a-f]{64}$/);
    assert.notEqual(runtime.sql.prepare('SELECT key_hash FROM studio_ai_catalog_access').get().key_hash, key);
    assert.deepEqual(await (await manage()).json(), { configured: true, enabled: false, hasKey: true });
    assert.equal((await read(key)).status, 404);

    assert.equal((await manage('enable')).status, 200);
    const unauthenticated = await read();
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('WWW-Authenticate'), 'Bearer');
    assert.equal((await read('ms_' + '0'.repeat(64))).status, 401);
    assert.equal((await read(undefined, catalogUrl + '?key=' + key)).status, 401);
    const authorized = await read(key);
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual((await authorized.json()).items.map(x => x.url), ['https://example.com/file/allowed.png']);

    await manage('disable');
    assert.equal((await read(key)).status, 404);
    await manage('enable');
    assert.equal((await read(key)).status, 200);
    await manage('revoke');
    assert.equal((await read(key)).status, 404);
    assert.equal((await manage('enable')).status, 409);
  });

  it('requires administrator access for changes and rejects the previous pass after replacement', async function () {
    const { key } = await (await manage('issue')).json();
    assert.equal((await manage('enable', '')).status, 401);
    assert.equal((await manage('enable', 'Bearer ' + key)).status, 400);
    assert.equal((await manage('enable', basic, 'https://example.org')).status, 403);
    await manage('enable');
    const { key: replacement } = await (await manage('issue')).json();
    assert.notEqual(key, replacement);
    assert.equal((await read(replacement)).status, 404);
    await manage('enable');
    assert.equal((await read(key)).status, 401);
    assert.equal((await read(replacement)).status, 200);
    assert.equal((await read(replacement, catalogUrl, 'POST')).status, 405);
  });

  it('checks the primary, fails closed if storage is unavailable, and honors the deployment switch', async function () {
    const { key } = await (await manage('issue')).json();
    await manage('enable');
    let sessionCalls = 0;
    runtime.db.withSession = constraint => {
      assert.equal(constraint, 'first-primary');
      sessionCalls++;
      return runtime.db;
    };
    assert.equal((await read(key)).status, 200);
    assert.equal(sessionCalls, 1);
    env.SHOPIFY_AI_CATALOG_ENABLED = 'false';
    assert.equal((await read(key)).status, 404);
    env.SHOPIFY_AI_CATALOG_ENABLED = 'true';
    delete env.MEDIA_STUDIO_DB;
    assert.equal((await read(key)).status, 503);
  });
});
