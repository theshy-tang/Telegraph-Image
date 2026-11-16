/**
 * Media Studio preview-only image proxy.
 * Preview deployments use an isolated KV namespace without Telegram credentials.
 * Proxy existing public media through the same-origin Pages function so image
 * thumbnails do not depend on cross-origin embeds or copied TG credentials.
 *
 * The remote host is fixed. No user-provided URL is ever fetched.
 */
const ID = /^(?:[A-Za-z0-9_-]{5,300})\.(?:jpe?g|png|webp|gif|avif|bmp|apng|ico|mp4|webm|mov|m4v|ogg)$/i;
const UPSTREAM = 'https://my-image-bed.pages.dev';

function message(text, status) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequest({ request, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return message('Method not allowed', 405);
  const id = params.id || '';
  if (!ID.test(id)) return message('Invalid media ID', 400);

  // Production must use the existing /file/ route, without an extra proxy hop.
  const current = new URL(request.url);
  if (current.hostname === 'my-image-bed.pages.dev') {
    return Response.redirect('/file/' + encodeURIComponent(id), 302);
  }
  if (!current.hostname.endsWith('.my-image-bed.pages.dev')) {
    return message('Preview domain required', 403);
  }

  const url = UPSTREAM + '/file/' + encodeURIComponent(id);
  const headers = new Headers({ 'Accept': 'image/*,video/*;q=0.9,*/*;q=0.1' });
  const range = request.headers.get('Range');
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.set('Range', range);

  let upstream;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      redirect: 'follow'
    });
  } catch (error) {
    console.error('Media preview proxy error', error);
    return message('Preview source temporarily unavailable', 502);
  }
  if (!upstream.ok && upstream.status !== 206) {
    return message('Source image unavailable (HTTP ' + upstream.status + ')', 502);
  }

  const type = (upstream.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('image/') && !type.startsWith('video/')) {
    return message('Source did not return media content', 502);
  }
  const out = new Headers({
    'Content-Type': type,
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v=upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out
  });
}
