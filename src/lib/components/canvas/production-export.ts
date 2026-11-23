import type { Editor } from '@tldraw/tldraw';
import type { CanvasDxfRelease } from '$lib/order/canvas-dxf-release';
import { base } from '$app/paths';
import { frameFilePocket, type ProductionFilePocket } from '$lib/order/file-pockets';
import { announceOrderFilesChanged } from '$lib/order/order-files-client';
import { getOrderBridge } from './state-bridge';
import { addOrderFileDocument } from './order-file-documents';
import { drawingTransaction } from './drawing-commands';

const pending = new WeakSet<Editor>();
type Receipt = { id: string; url: string };
const receipts = new WeakMap<Editor, WeakMap<File, Map<string, Receipt>>>();

export function productionExportTarget(editor: Editor, pocket: ProductionFilePocket) {
  const bridge = getOrderBridge(editor);
  const frame = editor.getCurrentPageShapesSorted().find(shape => frameFilePocket(shape) === pocket);
  if (!bridge?.orderId || !frame || editor.getInstanceState().isReadonly || editor.isShapeOrAncestorLocked(frame)) return null;
  return { orderId: bridge.orderId, pageId: editor.getCurrentPageId(), frameId: frame.id, queued: !!bridge.onFilesUpload };
}

export type ProductionExportTarget = NonNullable<ReturnType<typeof productionExportTarget>>;

export function matchesProductionExportTarget(current: ProductionExportTarget | null, original: ProductionExportTarget) {
  return current?.orderId === original.orderId && current.pageId === original.pageId &&
    current.frameId === original.frameId && current.queued === original.queued;
}

/** Both persisted orders and unsaved drafts use the same canonical pocket type. */
export async function saveProductionExport(
  editor: Editor, file: File, pocket: ProductionFilePocket, signal?: AbortSignal,
  release?: CanvasDxfRelease, target = productionExportTarget(editor, pocket),
) {
  if (signal?.aborted) throw new Error('cancelled');
  const current = productionExportTarget(editor, pocket);
  if (!target || !current) throw new Error('readOnly');
  if (!matchesProductionExportTarget(current, target)) throw new Error('changed');
  if (pending.has(editor)) throw new Error('saveFailed');
  const { orderId, queued } = target;
  const key = JSON.stringify([orderId, pocket, queued, release?.reviewId]);
  let files = receipts.get(editor);
  if (!files) { files = new WeakMap(); receipts.set(editor, files); }
  let confirmations = files.get(file);
  if (!confirmations) { confirmations = new Map(); files.set(file, confirmations); }

  pending.add(editor);
  try {
    let stored = confirmations.get(key);
    if (!stored) {
      if (queued) {
        const store = getOrderBridge(editor)?.onStoreCanvasFile;
        if (!store) throw new Error('saveFailed');
        stored = await store(file, pocket, release);
      } else {
        const body = new FormData();
        body.set('file', file);
        body.set('order_id', orderId);
        body.set('file_type', pocket);
        if (release) body.set('canvas_dxf_release', JSON.stringify(release));
        const timeout = AbortSignal.timeout(60_000);
        const response = await fetch(base + '/api/files/upload', {
          method: 'POST', body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.file?.id !== 'string' || !result.file.id) throw new Error('saveFailed');
        stored = { id: result.file.id, url: `${base}/api/files/${encodeURIComponent(result.file.id)}/download` };
      }
      confirmations.set(key, stored);
      if (!queued) announceOrderFilesChanged(orderId);
    }

    // The attachment can be saved even if the drawing became unavailable.
    let placed = false;
    if (!signal?.aborted && matchesProductionExportTarget(productionExportTarget(editor, pocket), target)) {
      const card = () => editor.getCurrentPageShapesSorted().find(shape =>
        shape.type === 'document' && (shape.props as { fileId: string }).fileId === stored.id);
      placed = !!card() || drawingTransaction(editor, () => {
        addOrderFileDocument(editor, { ...stored, originalName: file.name, mimeType: file.type }, { x: 0, y: 0 }, pocket);
        if (card()?.parentId !== target.frameId) throw new Error('saveFailed');
      });
    }
    return { queued, placed, ...stored };
  } finally { pending.delete(editor); }
}
