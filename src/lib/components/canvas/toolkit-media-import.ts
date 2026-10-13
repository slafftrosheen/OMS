/** Private media upload and reattachment. Storage is authoritative; tldraw
 * shapes are references. A failed snapshot never destroys the stored file.
 */
export interface ToolkitPosition { x: number; y: number; }
export interface ToolkitStoredAsset {
  id: string; fileName: string; mime: string; bytes: number; url: string;
}
export interface ToolkitImportResult {
  imported: number;
  /** Objects saved successfully, even if placing a document shape later fails. */
  stored: ToolkitStoredAsset[];
  errors: string[];
}
const MAX_BYTES = 25 * 1024 * 1024;
const SUPPORTED = new Set(['image/png','image/jpeg','image/webp','image/gif','application/pdf']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf'
};

export function isSupportedToolkitAsset(file: Pick<File, 'name' | 'type'>): boolean {
  const declared = file.type.toLowerCase();
  const extension = MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  // For missing/unknown browser types fall back to extension; the server
  // performs the MIME and magic-byte validation before any Storage write.
  if (declared && declared !== 'application/octet-stream' && !SUPPORTED.has(declared)) return false;
  return SUPPORTED.has(declared) || !!extension;
}

export function canonicalToolkitAsset(boardId: string, value: unknown): ToolkitStoredAsset {
  if (!UUID.test(boardId) || !value || typeof value !== 'object') {
    throw new Error('Invalid project file reference');
  }
  const data = value as Record<string, unknown>;
  const id = data.id, mime = data.mime, fileName = data.fileName, bytes = data.bytes;
  if (typeof id !== 'string' || !UUID.test(id) ||
      typeof mime !== 'string' || !SUPPORTED.has(mime) ||
      typeof fileName !== 'string' || !fileName.trim() || fileName.length > 180 ||
      typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) {
    throw new Error('File upload completed but server metadata was invalid. Check the asset library before retrying.');
  }
  const url = `/api/toolkit/assets/${boardId}/${id}`;
  return { id, mime, fileName, bytes, url };
}

export function placeToolkitAsset(
  editor: any, boardId: string, value: unknown, point?: ToolkitPosition
): ToolkitStoredAsset {
  const asset = canonicalToolkitAsset(boardId, value);
  const center = editor.getViewportPageBounds?.().center ?? { x: 0, y: 0 };
  const position = point ?? { x: center.x - 200, y: center.y - 150 };
  const pdf = asset.mime === 'application/pdf';
  editor.createShape({
    type: 'document', x: position.x, y: position.y,
    props: {
      w: pdf ? 490 : 430, h: pdf ? 580 : 320,
      title: asset.fileName, content: '', status: 'ready',
      kind: pdf ? 'pdf' : 'image', url: asset.url, mime: asset.mime,
      fileId: asset.id, fit: 'contain', opacity: 100, pdfPage: 1
    }
  });
  return asset;
}

export async function importToolkitFiles(
  editor: any, boardId: string, files: File[], point?: ToolkitPosition,
  onProgress?: (message: string) => void
): Promise<ToolkitImportResult> {
  const errors: string[] = [];
  const stored: ToolkitStoredAsset[] = [];
  let imported = 0;
  const center = editor.getViewportPageBounds?.().center ?? { x: 0, y: 0 };
  const origin = point ?? { x: center.x - 200, y: center.y - 150 };
  let checkedCapacity = false;
  try {
    for (const [index, file] of files.entries()) {
      if (!isSupportedToolkitAsset(file)) {
        errors.push(`${file.name}: unsupported file. Use PNG, JPEG, WebP, GIF or PDF.`);
        continue;
      }
      if (file.size < 1 || file.size > MAX_BYTES) {
        errors.push(`${file.name}: file must be between 1 byte and 25 MiB.`);
        continue;
      }
      try {
        onProgress?.(`Importing ${file.name} (${index + 1}/${files.length})…`);
        if (!checkedCapacity) {
          const health = await fetch(`/api/toolkit/assets/${encodeURIComponent(boardId)}`,
            { cache: 'no-store' });
          const capacity = await health.json().catch(() => ({}));
          if (!health.ok || capacity.ready !== true) {
            throw new Error(capacity.error || 'Upload service unavailable. Verify server BODY_SIZE_LIMIT and storage migration.');
          }
          checkedCapacity = true;
        }
        const body = new FormData();
        body.append('file', file);
        let response: Response;
        try {
          response = await fetch(`/api/toolkit/assets/${encodeURIComponent(boardId)}`,
            { method: 'POST', body });
        } catch {
          throw new Error('Connection dropped: verify BODY_SIZE_LIMIT=32M, proxy client_max_body_size 32m, and server logs');
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || result.error?.message || result.error ||
            `Upload failed (HTTP ${response.status})`);
        }
        // Server has acknowledged the Storage + metadata transaction. Record
        // this BEFORE attempting placement; orphan files can be reattached.
        const asset = canonicalToolkitAsset(boardId, result);
        stored.push(asset);
        try {
          placeToolkitAsset(editor, boardId, asset, {
            x: origin.x + imported * 40,
            y: origin.y + imported * 36
          });
          imported++;
        } catch {
          errors.push(`${file.name}: uploaded to the private library, but Canvas placement failed. Use Saved files to attach it.`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not upload';
        errors.push(`${file.name}: ${message}`);
        // A readiness failure affects the entire batch; don't attempt more
        // transfers until the server setup is repaired.
        if (!checkedCapacity) break;
      }
    }
  } finally {
    onProgress?.('');
  }
  return { imported, stored, errors };
}
