import {sourceRecord} from '../../utils/studio-records.js';
import {parseAssetDetails,ASSET_FIELDS} from '../../utils/studio-asset-details.js';
import {cleanNames,imageDimensions,metadataD1Enabled,readStudioMetadata,mutateStudioMetadata} from '../../utils/studio-metadata.js';
import {hasStudioD1,getStudioFolder,getStudioMediaFolders} from '../../utils/studio-d1.js';
/**
 * Media Studio bulk metadata updates.
 * Mounted under /api/manage so it inherits the existing Basic Auth middleware.
 * All operations set a specific state (never toggle) and do not touch Telegram media.
 */
const FILE_ID = /^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/;
const INTERNAL = /^[a-z][a-z0-9-]*:/i;
const ACTIONS = new Set([
  'favorite', 'unfavorite',
  'publish', 'unpublish',
  'add_tags', 'remove_tags',
  'add_albums', 'remove_albums',
  'set_category', 'move_folder', 'edit_details'
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function safeStringList(value) {
  return Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
}

function transform(metadata, payload) {
  const next = { ...metadata };
  const action = payload.action;
  if(action==='edit_details'){next.fileName=payload.fileName;next.category=payload.category;next.tags=payload.tags;Object.assign(next,payload.assetDetails);}
  if (action === 'favorite') next.liked = true;
  if (action === 'unfavorite') next.liked = false;
  if (action === 'publish') {
    if (next.ListType === 'Block' || next.Label === 'adult') {
      throw new Error('Blocked items cannot be published');
    }
    next.aiPublished = true;
  }
  if (action === 'unpublish') next.aiPublished = false;
  if (action === 'add_tags') {
    const tags = [...new Set([...safeStringList(next.tags), ...payload.names])];
    if(tags.length>30){const error=new Error('Tag limit reached');error.code='TAG_LIMIT';throw error;}
    next.tags=tags;
  }
  if (action === 'remove_tags') next.tags = safeStringList(next.tags).filter(x => !payload.names.includes(x));
  if (action === 'add_albums') next.albums = [...new Set([...safeStringList(next.albums), ...payload.names])].slice(0, 30);
  if (action === 'remove_albums') next.albums = safeStringList(next.albums).filter(x => !payload.names.includes(x));
  if (action === 'set_category') next.category = payload.category;
  if (action === 'move_folder') next.folderId = payload.folderId;
  next.mediaStudioUpdatedAt = Date.now();
  return next;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  // Unlike the legacy admin, bulk writes fail closed when admin auth is unset.
  if (!env.BASIC_USER || !env.BASIC_PASS) {
    return json({ error: 'Admin credentials must be configured' }, 503);
  }
  if (!env.img_url || typeof env.img_url.getWithMetadata !== 'function') {
    return json({ error: 'img_url KV binding is unavailable' }, 503);
  }
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Cross-origin writes are forbidden' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return json({ error: 'JSON request required' }, 415);
  }

  let payload;
  try {
    const body = await request.text();
    if (body.length > 32000) return json({ error: 'Request too large' }, 413);
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!payload || typeof payload !== 'object' || !ACTIONS.has(payload.action)) {
    return json({ error: 'Invalid bulk action' }, 400);
  }
  if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 50 ||
      payload.ids.some(id => typeof id !== 'string' || !FILE_ID.test(id) || INTERNAL.test(id))) {
    return json({ error: 'Choose 1–50 valid file IDs' }, 400);
  }

  if(payload.action==='edit_details'){
    if(payload.ids.length!==1)return json({error:'Edit one media item at a time'},400);
    const name=typeof payload.fileName==='string'?payload.fileName.trim():'';
    const tags=cleanNames(payload.tags,48,30);
    if(!name||name.length>160||/[\u0000-\u001f\u007f<>]/.test(name)||!tags ||
      typeof payload.category!=='string'||payload.category.length>48||/[\u0000-\u001f\u007f<>]/.test(payload.category))
      return json({error:'Invalid media details'},400);
    try{payload.assetDetails=parseAssetDetails(payload);}catch{return json({error:'Invalid description, source URL or prompt'},400);}
    if(Object.hasOwn(payload,'width')||Object.hasOwn(payload,'height')){
      const dimensions=imageDimensions(payload);
      if(!dimensions.width||!/\.(jpe?g|png|gif|webp|bmp|tiff?|ico|avif|apng)$/i.test(payload.ids[0]))
        return json({error:'Invalid image dimensions'},400);
      Object.assign(payload.assetDetails,dimensions);
    }
    payload.fileName=name;payload.tags=tags;payload.category=payload.category.trim();
  }
  const ids = [...new Set(payload.ids)];
  if (payload.action.endsWith('_tags') || payload.action.endsWith('_albums')) {
    const names = cleanNames(payload.names, 48);
    if (!names || names.length === 0) return json({ error: 'Choose 1–15 valid names' }, 400);
    payload.names = names;
  }
  if (payload.action === 'set_category') {
    const value = payload.category;
    if (typeof value !== 'string' || value.length > 48 || /[\u0000-\u001f\u007f<>]/.test(value)) {
      return json({ error: 'Invalid category' }, 400);
    }
    payload.category = value.trim();
  }

  try {
    if(payload.action === 'move_folder') {
      if(payload.folderId!==null && (typeof payload.folderId!=='string' || !/^[a-f0-9]{32}$/.test(payload.folderId)))
        return json({error:'Invalid folder ID'},400);
      if(payload.folderId!==null) {
        if(hasStudioD1(env)){
          if(!await getStudioFolder(env.MEDIA_STUDIO_DB,payload.folderId))
            return json({error:'Destination folder not found'},404);
        }else{
          const folder=await env.img_url.getWithMetadata('studio:folder:'+payload.folderId);
          if(!folder?.metadata || folder.metadata.id!==payload.folderId)
            return json({error:'Destination folder not found'},404);
        }
      }
    }

    // Folder membership is authoritative in D1 when configured; never re-read
    // stale KV folderId values as the result of unrelated metadata edits.
    const d1=hasStudioD1(env),metadataD1=metadataD1Enabled(env);
    if(!metadataD1&&payload.action==='edit_details'&&Object.keys(payload.assetDetails).length)return json({error:'Asset details require D1 metadata storage'},503);
    if(metadataD1&&payload.action==='edit_details'&&(!Number.isInteger(payload.metadataVersion)||payload.metadataVersion<0))return json({error:'Reload media details before saving'},409);
    const memberships=d1 ? await getStudioMediaFolders(env.MEDIA_STUDIO_DB,ids) : new Map();
    let position = 0;
    const results = new Array(ids.length);
    async function worker() {
      while (position < ids.length) {
        const i = position++;
        const id = ids[i];
        try {
          const current = await sourceRecord(env,id);
          if (!current || !current.metadata) {
            results[i] = { id, ok: false, error: 'File metadata not found' };
            continue;
          }
          let updated;
          if(metadataD1){
            if(payload.action==='move_folder')updated=await readStudioMetadata(env.MEDIA_STUDIO_DB,id,current.metadata);
            else updated=await mutateStudioMetadata(env.MEDIA_STUDIO_DB,id,current.metadata,m=>transform(m,payload),payload.action==='edit_details'?payload.metadataVersion:undefined);
          }else updated=transform(current.metadata,payload);
          if(d1 && payload.action==='move_folder'){
            if(payload.folderId===null){
              await env.MEDIA_STUDIO_DB.prepare('DELETE FROM studio_media_folders WHERE media_id = ?').bind(id).run();
            }else{
              await env.MEDIA_STUDIO_DB.prepare(
                'INSERT INTO studio_media_folders (media_id, folder_id, updated_at) VALUES (?,?,?) ON CONFLICT(media_id) DO UPDATE SET folder_id=excluded.folder_id,updated_at=excluded.updated_at'
              ).bind(id,payload.folderId,Date.now()).run();
            }
          }else if(!metadataD1){
            // Backwards-compatible KV mode; D1 mode never dual-writes editable fields.
            await env.img_url.put(id, current.value == null ? '' : current.value, { metadata: updated });
          }
          results[i] = { id, ok: true, metadata: {
            metadataVersion: updated.metadataVersion,
            ...imageDimensions(updated),
            ...Object.fromEntries(ASSET_FIELDS.filter(k=>typeof updated[k]==='string').map(k=>[k,updated[k]])),
            fileName: updated.fileName || id,
          liked: updated.liked === true,
            aiPublished: updated.aiPublished === true,
            tags: safeStringList(updated.tags),
            albums: safeStringList(updated.albums),
            category: updated.category || '',
            folderId: d1 ? (payload.action==='move_folder' ? payload.folderId : (memberships.get(id)||null)) : (updated.folderId||null)
          } };
        } catch (error) {
          console.error('Media Studio bulk update failed:', id, error);
          results[i] = { id, ok: false, code:error?.code||'UPDATE_FAILED', error:error?.code==='METADATA_CONFLICT'?'资料已在其他窗口更新，请重新载入后再保存':error?.code==='MEDIA_DELETED'?'素材记录已删除':error?.code==='TAG_LIMIT'?'Tag limit reached (30 per file)':'Update failed' };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(d1 && payload.action==='move_folder'?1:5, ids.length) }, () => worker()));
    const success = results.filter(x => x && x.ok).length;
    return json({
      action: payload.action,
      success,
      failed: ids.length - success,
      results
    });
  } catch {
    return json({error:'Media service temporarily unavailable'},503);
  }
}
