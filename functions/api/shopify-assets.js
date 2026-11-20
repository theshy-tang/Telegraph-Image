import {sourceCatalogPage} from '../utils/studio-records.js';
import {imageDimensions,overlayStudioMetadata} from '../utils/studio-metadata.js';
/**
 * Telegraph-Image / Shopify AI asset catalog
 * Install at: functions/api/shopify-assets.js
 * Route: GET /api/shopify-assets
 *
 * Only exposes images explicitly published with aiPublished=true in Media Studio.
 * No credentials or raw KV values are returned.
 */

const IMAGE_FILE = /^[A-Za-z0-9_-]+\.(?:jpe?g|png|gif|webp|avif|apng|bmp)$/i;
const INTERNAL_KEY = /^[a-z][a-z0-9-]*:/i;

function respond(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  // This route must never be capable of changing image data.
  if (request.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  // Explicit opt-in: a new deployment alone does not publish anything.
  if (env.SHOPIFY_AI_CATALOG_ENABLED !== 'true') {
    return respond({ error: 'Not found' }, 404);
  }
  if (!env.img_url || typeof env.img_url.list !== 'function') {
    return respond({ error: 'Image catalog KV binding is unavailable' }, 503);
  }

  const url = new URL(request.url);
  const tag = url.searchParams.get('tag')?.trim().normalize('NFC').toLowerCase();
  const minimums = {};
  for (const [param, key] of [['min_width','width'],['min_height','height']]) {
    if (!url.searchParams.has(param)) continue;
    const value = url.searchParams.get(param);
    if (!/^[1-9]\d{0,5}$/.test(value) || Number(value)>100000)
      return respond({error:'Invalid image dimension filter'},400);
    minimums[key] = Number(value);
  }
  if (tag && tag.length>48) return respond({error:'Invalid tag'},400);
  const rawLimit = url.searchParams.get('limit');
  // 'limit' is the number of KV keys scanned per page; published count may be lower.
  const parsed = rawLimit === null ? 200 : Number(rawLimit);
  const limit = Number.isInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : 200;
  const cursor = url.searchParams.get('cursor') || undefined;

  let listing;
  try {
    listing = await sourceCatalogPage(env,{limit,cursor})||await env.img_url.list({ limit, ...(cursor ? { cursor } : {}) });
    listing={...listing,keys:await overlayStudioMetadata(env,listing.keys||[])};
  } catch (e) {
    console.error('Shopify catalog KV list error:', e);
    return respond({ error: 'Catalog temporarily unavailable' }, 503);
  }

  const origin = url.origin;
  const items = [];
  for (const key of listing.keys || []) {
    const id = key?.name;
    const metadata = key?.metadata || {};
    if (typeof id !== 'string' || INTERNAL_KEY.test(id) || !IMAGE_FILE.test(id)) continue;
    if (metadata.aiPublished !== true) continue;
    if (metadata.ListType === 'Block' || metadata.Label === 'adult') continue;
    if (env.WhiteList_Mode === 'true' && metadata.ListType !== 'White') continue;

    const filename = typeof metadata.fileName === 'string'
      ? metadata.fileName.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160)
      : id;
    const size = Number(metadata.fileSize);
    const ms = Number(metadata.TimeStamp);
    const uploadedAt = Number.isFinite(ms) && ms > 0 && ms < 8.64e15
      ? new Date(ms).toISOString()
      : null;

    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.filter(tag => typeof tag === 'string').slice(0, 30)
      : [];
    const albums = Array.isArray(metadata.albums)
      ? metadata.albums.filter(album => typeof album === 'string').slice(0, 30)
      : [];

    const dimensions=imageDimensions(metadata);
    if (tag && !tags.some(value=>value.trim().normalize('NFC').toLowerCase()===tag)) continue;
    if (Object.entries(minimums).some(([key,value])=>!(dimensions[key]>=value))) continue;
    items.push({
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
      tags,
      albums,
      category: typeof metadata.category === 'string' ? metadata.category : '',
      filename: filename || id,
      url: `${origin}/file/${encodeURIComponent(id)}`,
      type: `image/${id.split('.').pop().toLowerCase().replace('jpg', 'jpeg')}`,
      bytes: Number.isSafeInteger(size) && size >= 0 ? size : null,
      uploaded_at: uploadedAt,
    });
  }

  return respond({
    version: 1,
    purpose: 'shopify-image-selection',
    visibility: 'public-curated',
    count: items.length,
    scanned: (listing.keys || []).length,
    items,
    has_more: listing.list_complete === false,
    next_cursor: listing.list_complete === false ? (listing.cursor || null) : null,
  });
}
