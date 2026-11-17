/**
 * Media Studio D1-backed folder indexes. The img_url KV continues to serve
 * legacy media metadata and permanent Telegram file URLs.
 * D1 is the source of truth for folder trees and media membership when bound.
 */
export function hasStudioD1(env) {
  return Boolean(env?.MEDIA_STUDIO_DB && typeof env.MEDIA_STUDIO_DB.prepare === 'function');
}
export async function listStudioFolders(db) {
  const rows = await db.prepare('SELECT id, name, parent_id, created_at, updated_at FROM studio_folders ORDER BY name COLLATE NOCASE').all();
  return (rows.results || []).map(x => ({id:x.id,name:x.name,parentId:x.parent_id||null,createdAt:x.created_at,updatedAt:x.updated_at}));
}
export async function getStudioFolder(db,id) {
  return db.prepare('SELECT id, name, parent_id, created_at, updated_at FROM studio_folders WHERE id = ?').bind(id).first();
}
export async function getStudioMediaFolders(db,ids) {
  const result = new Map();
  // Up to 1000 media keys per list call. D1 parameter limit is higher, but
  // chunking keeps queries small and avoids brittle long IN statements.
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    if(!batch.length)continue;
    const placeholders=batch.map(()=>'?').join(',');
    const query='SELECT media_id, folder_id FROM studio_media_folders WHERE media_id IN ('+placeholders+')';
    const rows=await db.prepare(query).bind(...batch).all();
    for(const row of rows.results||[])result.set(row.media_id,row.folder_id);
  }
  return result;
}
export async function folderContainsMedia(db,id) {
  return Boolean(await db.prepare('SELECT 1 AS found FROM studio_media_folders WHERE folder_id = ? LIMIT 1').bind(id).first());
}
export async function folderContainsChild(db,id) {
  return Boolean(await db.prepare('SELECT 1 AS found FROM studio_folders WHERE parent_id = ? LIMIT 1').bind(id).first());
}
