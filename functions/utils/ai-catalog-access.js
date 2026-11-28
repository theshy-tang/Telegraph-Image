export function catalogAllowedByDeployment(env) {
  const setting = env.SHOPIFY_AI_CATALOG_ENABLED;
  return setting === undefined || setting === 'true';
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createCatalogKey() {
  return 'ms_' + toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashCatalogKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return toHex(new Uint8Array(digest));
}

export function readCatalogAccess(db) {
  // Read from the primary on every request so pause and revoke take effect across regions.
  const primary = typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
  return primary.prepare('SELECT enabled, key_hash FROM studio_ai_catalog_access WHERE id = 1').first();
}

export async function acceptsCatalogKey(request, keyHash) {
  const match = /^Bearer (ms_[0-9a-f]{64})$/i.exec(request.headers.get('Authorization') || '');
  if (!match) return false;
  const candidate = await hashCatalogKey(match[1]);
  let mismatch = 0;
  for (let i = 0; i < candidate.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ keyHash.charCodeAt(i);
  }
  return mismatch === 0;
}
