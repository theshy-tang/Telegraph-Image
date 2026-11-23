const { createHash } = require('node:crypto');

const key = 'ms_' + 'a'.repeat(64);

async function enableFixtureCatalog(env) {
  env.SHOPIFY_AI_CATALOG_ENABLED = 'true';
  const hash = createHash('sha256').update(key).digest('hex');
  await env.MEDIA_STUDIO_DB.prepare(
    'INSERT OR REPLACE INTO studio_ai_catalog_access (id, enabled, key_hash) VALUES (1, 1, ?)'
  ).bind(hash).run();
}

function catalogRequest(url = 'https://example.com/api/shopify-assets') {
  return new Request(url, { headers: { Authorization: 'Bearer ' + key } });
}

module.exports = { enableFixtureCatalog, catalogRequest };
