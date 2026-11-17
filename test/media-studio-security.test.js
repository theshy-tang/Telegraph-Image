const assert = require('assert');
const {makeContext,createMockKV} = require('./helpers');

describe('Media Studio security regressions', function () {
  it('never initializes external telemetry or reads request headers', async function () {
    const telemetry = await import('../functions/utils/middleware.js');
    let calls = 0;
    const context = {env:{}, data:{}, next(){calls++;return new Response('ok');},
      get request(){throw Error('Request must not be collected');}};
    await telemetry.errorHandling(context);
    await telemetry.telemetryData(context);
    await telemetry.traceData(context);
    assert.strictEqual(context.data.telemetry,false);
    assert.strictEqual(calls,2);
    assert.strictEqual(context.data.sentry,undefined);
  });
  it('returns 400 for malformed Base64 credentials', async function () {
    const {basicAuthentication}=await import('../functions/utils/auth.js');
    const response=basicAuthentication(new Request('https://example.com',{headers:{Authorization:'Basic %%%'}}));
    assert.strictEqual(response.status,400);
  });
  it('does not expose an exception or stack through management middleware', async function () {
    const {onRequest}=await import('../functions/api/manage/_middleware.js');
    const response=await onRequest[0]({next(){throw Error('sensitive-backend-detail');}});
    assert.strictEqual(response.status,503);
    assert.strictEqual(response.headers.get('Cache-Control'),'no-store');
    assert.ok(!(await response.text()).includes('sensitive-backend-detail'));
  });
  it('returns structured 503 when a D1 membership preflight fails',async function(){
    const {onRequestPost}=await import('../functions/api/manage/bulk.js');
    const response=await onRequestPost(makeContext({env:{BASIC_USER:'admin',BASIC_PASS:'test',
      img_url:createMockKV(),MEDIA_STUDIO_DB:{prepare(){throw Error('private-db-error');}}},
      request:new Request('https://example.com/api/manage/bulk',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'favorite',ids:['sample.jpg']})})}));
    assert.strictEqual(response.status,503);
    assert.ok(!(await response.text()).includes('private-db-error'));
  });
});
