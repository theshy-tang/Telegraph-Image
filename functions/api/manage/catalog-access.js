import { catalogAllowedByDeployment, createCatalogKey, hashCatalogKey, readCatalogAccess } from '../../utils/ai-catalog-access.js';
import { jsonResponse } from '../../utils/http.js';

function respond(body, status = 200) {
  return jsonResponse(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function accessStatus(env, row) {
  return {
    configured: catalogAllowedByDeployment(env),
    enabled: row?.enabled === 1,
    hasKey: Boolean(row),
  };
}

export async function onRequestGet({ env }) {
  const row = await readCatalogAccess(env.MEDIA_STUDIO_DB);
  return respond(accessStatus(env, row));
}

export async function onRequestPost({ env, request }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return respond({ error: 'Request origin not allowed' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return respond({ error: 'Expected JSON' }, 415);
  }

  const action = (await request.json().catch(() => null))?.action;
  const db = env.MEDIA_STUDIO_DB;
  switch (action) {
    case 'issue': {
      if (!catalogAllowedByDeployment(env)) {
        return respond({ error: 'Catalog is disabled in deployment settings' }, 409);
      }
      const key = createCatalogKey();
      await db.prepare(`
        INSERT INTO studio_ai_catalog_access (id, enabled, key_hash) VALUES (1, 0, ?)
        ON CONFLICT(id) DO UPDATE SET enabled = 0, key_hash = excluded.key_hash
      `).bind(await hashCatalogKey(key)).run();
      return respond({ ...accessStatus(env, { enabled: 0 }), key });
    }
    case 'enable':
      if (!catalogAllowedByDeployment(env)) {
        return respond({ error: 'Catalog is disabled in deployment settings' }, 409);
      }
      if (!(await db.prepare('UPDATE studio_ai_catalog_access SET enabled = 1 WHERE id = 1').run()).meta.changes) {
        return respond({ error: 'Issue a key before enabling access' }, 409);
      }
      return respond(accessStatus(env, { enabled: 1 }));
    case 'disable':
      await db.prepare('UPDATE studio_ai_catalog_access SET enabled = 0 WHERE id = 1').run();
      return respond(accessStatus(env, await readCatalogAccess(db)));
    case 'revoke':
      await db.prepare('DELETE FROM studio_ai_catalog_access WHERE id = 1').run();
      return respond(accessStatus(env, null));
    default:
      return respond({ error: 'Invalid catalog access action' }, 400);
  }
}
