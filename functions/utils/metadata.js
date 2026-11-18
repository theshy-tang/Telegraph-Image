import {sourceRecord,persistOwnedRecord} from './studio-records.js';
import {cutoverReadOnly} from './cutover.js';
import {metadataD1Enabled,readStudioMetadata} from './studio-metadata.js';
export const LIST_TYPE = {
  NONE: 'None',
  WHITE: 'White',
  BLOCK: 'Block',
};

export const LABEL = {
  NONE: 'None',
  ADULT: 'adult',
};

export function createDefaultMetadata(id, overrides = {}) {
  return {
    TimeStamp: Date.now(),
    ListType: LIST_TYPE.NONE,
    Label: LABEL.NONE,
    liked: false,
    fileName: id,
    fileSize: 0,
    ...overrides,
  };
}

export function normalizeMetadata(metadata, id) {
  return {
    ListType: metadata.ListType || LIST_TYPE.NONE,
    Label: metadata.Label || LABEL.NONE,
    TimeStamp: metadata.TimeStamp || Date.now(),
    liked: metadata.liked !== undefined ? metadata.liked : false,
    fileName: metadata.fileName || id,
    fileSize: metadata.fileSize || 0,
    ...(metadata.provider ? { provider: metadata.provider } : {}),
    ...(metadata.shortId ? { shortId: metadata.shortId } : {}),
  };
}

export async function getMetadata(env, id) {
  const record = await sourceRecord(env,id);
  if(!record?.metadata)return null;
  if(metadataD1Enabled(env)){
    try{return await readStudioMetadata(env.MEDIA_STUDIO_DB,id,record.metadata);}catch(error){if(error.code==='MEDIA_DELETED')return null;throw error;}
  }
  return record.metadata;
}

export async function getOrCreateMetadata(env, id, { persist = true } = {}) {
  const record = await sourceRecord(env,id);

  if (record?.metadata) {
    return { ...record.metadata, ...normalizeMetadata(record.metadata, id) };
  }

  const metadata = createDefaultMetadata(id);
  if (persist) {
    try {
      await putMetadata(env, id, metadata);
    } catch {
      // Read-through initialization must not turn a served file into HTTP 500.
      // Do not log provider errors: they may contain private references.
      console.error('File metadata initialization unavailable');
    }
  }
  return metadata;
}

export async function putMetadata(env, id, metadata) {
  if(cutoverReadOnly(env))return;
  if(await persistOwnedRecord(env,id,metadata))return;
  await env.img_url.put(id, '', { metadata });
}

export async function updateMetadata(env, id, updater) {
  const metadata = await getMetadata(env, id);
  if (!metadata) return null;

  const updated = updater(metadata);
  await putMetadata(env, id, updated);
  return updated;
}

export function isBlocked(metadata) {
  return metadata.ListType === LIST_TYPE.BLOCK || metadata.Label === LABEL.ADULT;
}

export function isWhitelisted(metadata) {
  return metadata.ListType === LIST_TYPE.WHITE;
}
