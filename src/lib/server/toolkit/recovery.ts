import { error, isHttpError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { requireToolkitManager, validateCanvasPayload, validateCanvasTitle } from './access';
import { isUuid, MAX_TOOLKIT_ASSET_BYTES, TOOLKIT_ASSET_BUCKET, TOOLKIT_MIMES } from './assets';

const MAX_RECOVERY_ASSETS = 100;
const MAX_RECOVERY_BYTES = 250 * 1024 * 1024;
const ASSET_PREFIX = '/api/toolkit/assets/';
const ASSET_URL = /^\/api\/toolkit\/assets\/([\da-f-]{36})\/([\da-f-]{36})([?#].*)?$/i;
const CANVAS_COLUMNS = 'id,title,thumbnail_url,shared,revision,created_at,updated_at';

interface StoredAsset {
  id: string;
  canvas_id: string;
  file_name: string;
  mime_type: string;
  bytes: number;
  storage_path: string;
}

function storedReference(value: unknown, sourceId: string) {
  if (typeof value !== 'string' || !value.startsWith(ASSET_PREFIX)) return null;
  const match = ASSET_URL.exec(value);
  if (!match || !isUuid(match[1]) || !isUuid(match[2])) throw error(400, 'Invalid project file reference');
  if (match[1].toLowerCase() !== sourceId) throw error(400, 'Recovery files must belong to the source project');
  return { id: match[2].toLowerCase(), suffix: match[3] ?? '' };
}

/** Traverse actual JSON values, never replace arbitrary UUID substrings in
 * titles or text. Native image src, document URLs and material textures all
 * use the same private route. Order files and external links stay unchanged.
 */
function visitPayload(value: unknown, sourceId: string, visit: (id: string) => string, targetId?: string, depth = 0): unknown {
  if (depth > 80) throw error(400, 'Canvas structure is too deeply nested');
  if (typeof value === 'string') {
    const reference = storedReference(value, sourceId);
    if (!reference) return value;
    const id = visit(reference.id);
    return targetId ? `${ASSET_PREFIX}${targetId}/${id}${reference.suffix}` : value;
  }
  if (Array.isArray(value)) return value.map(item => visitPayload(item, sourceId, visit, targetId, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'fileId' && typeof entry === 'string' && entry) {
      // Legacy order-file shapes have their own lifetime and access checks.
      const independentUrl = typeof record.url === 'string' && record.url && !record.url.startsWith(ASSET_PREFIX);
      if (independentUrl) { output[key] = entry; continue; }
      if (!isUuid(entry)) throw error(400, 'Invalid project file ID');
      const reference = storedReference(record.url, sourceId);
      if (reference && reference.id !== entry.toLowerCase()) throw error(400, 'Project file URL and ID do not match');
      output[key] = visit(entry.toLowerCase());
    } else {
      // defineProperty avoids a JSON __proto__ key changing the clone's prototype.
      Object.defineProperty(output, key, { value: visitPayload(entry, sourceId, visit, targetId, depth + 1),
        enumerable: true, writable: true, configurable: true });
    }
  }
  return output;
}

function validStoredAsset(row: StoredAsset, sourceId: string) {
  return isUuid(row.id) && row.canvas_id === sourceId && row.storage_path === `${sourceId}/${row.id}` &&
    typeof row.file_name === 'string' && row.file_name.trim().length > 0 && row.file_name.length <= 180 &&
    !/[\\/\r\n\0<>]/.test(row.file_name) && TOOLKIT_MIMES.has(row.mime_type) &&
    Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= MAX_TOOLKIT_ASSET_BYTES;
}

/** Copy the media bytes first, then publish the snapshot and independent asset
 * rows. All operations use the signed-in client's existing RLS/storage policies.
 * Storage and PostgREST cannot share a transaction: compensate every attempted
 * destination on failure, including a write whose acknowledgement was lost.
 */
export async function recoverToolkitCanvas(
  locals: Pick<App.Locals, 'supabase' | 'user'>, source: unknown, input: unknown
) {
  const user = requireToolkitManager(locals.user);
  if (!isUuid(source)) throw error(400, 'Valid source project ID required');
  const sourceId = source.toLowerCase();
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error(400, 'Invalid recovery project');
  const body = input as Record<string, unknown>;
  const title = validateCanvasTitle(body.title);
  const payload = validateCanvasPayload(body.payload);
  const db = locals.supabase;
  const { data: sourceBoard, error: sourceError } = await db.from('canvas_documents')
    .select('id').eq('id', sourceId).maybeSingle();
  if (sourceError) throw error(503, 'Source project unavailable');
  if (!sourceBoard) throw error(404, 'Source project not found or inaccessible');

  const references = new Set<string>();
  visitPayload(payload, sourceId, id => {
    references.add(id);
    if (references.size > MAX_RECOVERY_ASSETS) throw error(413, 'Recovery supports up to 100 stored files');
    return id;
  });
  let files: StoredAsset[] = [];
  if (references.size) {
    const { data, error: assetError } = await db.from('toolkit_assets')
      .select('id,canvas_id,file_name,mime_type,bytes,storage_path')
      .eq('canvas_id', sourceId).in('id', [...references]);
    if (assetError) throw error(503, 'Source file library unavailable');
    files = (data ?? []) as StoredAsset[];
    if (files.length !== references.size || files.some(row => !references.has(row.id) || !validStoredAsset(row, sourceId))) {
      throw error(409, 'A referenced source file is missing or invalid. Keep the original canvas and retry after restoring the file.');
    }
    if (files.reduce((bytes, row) => bytes + row.bytes, 0) > MAX_RECOVERY_BYTES) {
      throw error(413, 'Recovery files exceed the 250 MB copy limit');
    }
  }

  const id = randomUUID();
  const assetIds = new Map(files.map(file => [file.id, randomUUID()]));
  const copiedPayload = visitPayload(payload, sourceId, oldId => assetIds.get(oldId)!, id);
  const copies = files.map(file => ({ ...file, id: assetIds.get(file.id)!, canvas_id: id,
    user_id: user.id, storage_path: `${id}/${assetIds.get(file.id)!}` }));
  const attemptedPaths: string[] = [];
  let attemptedBoard = false;
  const bucket = db.storage.from(TOOLKIT_ASSET_BUCKET);
  try {
    // Keep concurrency bounded and wait for the whole batch before cleanup.
    // A late successful copy must never recreate an object after compensation.
    for (let offset = 0; offset < copies.length; offset += 4) {
      const results = await Promise.allSettled(copies.slice(offset, offset + 4).map(async (copy, index) => {
        attemptedPaths.push(copy.storage_path);
        const { data, error: copyError } = await bucket.copy(files[offset + index].storage_path, copy.storage_path);
        if (copyError || !data) throw error(503, 'Could not copy project files. The source project is unchanged.');
      }));
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    attemptedBoard = true;
    const { data: canvas, error: boardError } = await db.from('canvas_documents')
      .insert({ id, title, payload: copiedPayload, user_id: user.id, shared: true })
      .select(CANVAS_COLUMNS).single();
    if (boardError || !canvas) throw error(503, 'Could not create recovery project');
    if (copies.length) {
      const { error: assetError } = await db.from('toolkit_assets').insert(copies);
      if (assetError) throw error(503, 'Could not register recovery files');
    }
    return { canvas, copiedAssets: copies.length };
  } catch (failure) {
    if (attemptedBoard) {
      try {
        const { error: cleanupError } = await db.from('canvas_documents').delete().eq('id', id);
        if (cleanupError) console.error('[Toolkit] Recovery row cleanup pending', { id, code: cleanupError.code });
      } catch { console.error('[Toolkit] Recovery row cleanup unavailable', { id }); }
    }
    if (attemptedPaths.length) {
      try {
        const { error: cleanupError } = await bucket.remove(attemptedPaths);
        if (cleanupError) console.error('[Toolkit] Recovery file cleanup pending', { id });
      } catch { console.error('[Toolkit] Recovery file cleanup unavailable', { id }); }
    }
    if (isHttpError(failure)) throw failure;
    console.error('[Toolkit] Recovery copy unavailable');
    throw error(503, 'Recovery copy failed. The source project is unchanged.');
  }
}
