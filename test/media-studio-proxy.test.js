const assert = require('assert');
const { makeContext, installFetchMock } = require('./helpers');

describe('Media Studio preview media proxy', function () {
  let route;
  before(async function () {
    route = (await import('../functions/api/studio/media/[id].js')).onRequest;
  });
  const id = 'AgACAgUAAyEGAATqi71rAAMIavra0YBWiN2JE1ItYrpN75vklIAAAtMVaxs2RtFXGpygdxhADW4BAAMCAAN3AAM9BA.jpg';
  it('rejects unsafe ids before contacting upstream', async function () {
    const response = await route(makeContext({
      request: new Request('https://preview.my-image-bed.pages.dev/api/studio/media/bad'),
      params: { id: '../../internal' },
    }));
    assert.strictEqual(response.status, 400);
  });
  it('rejects untrusted domains', async function () {
    const response = await route(makeContext({
      request: new Request('https://attacker.example/api/studio/media/' + id),
      params: { id },
    }));
    assert.strictEqual(response.status, 403);
  });
  it('proxies permitted image content and preserves the image type', async function () {
    const mock = installFetchMock(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]),{
      status:200, headers:{ 'Content-Type':'image/jpeg' }
    }));
    try {
      const response = await route(makeContext({
        request: new Request('https://preview.my-image-bed.pages.dev/api/studio/media/' + id),
        params:{id},
      }));
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('Content-Type'), 'image/jpeg');
      assert.ok(mock.calls[0].url.startsWith('https://my-image-bed.pages.dev/file/'));
    } finally { mock.restore(); }
  });
  it('rejects HTML error responses disguised as successful media', async function () {
    const mock = installFetchMock(async () => new Response('<html>error</html>',{
      status:200, headers:{ 'Content-Type':'text/html' }
    }));
    try {
      const response = await route(makeContext({
        request: new Request('https://preview.my-image-bed.pages.dev/api/studio/media/' + id),
        params:{id},
      }));
      assert.strictEqual(response.status, 502);
    } finally { mock.restore(); }
  });
});
