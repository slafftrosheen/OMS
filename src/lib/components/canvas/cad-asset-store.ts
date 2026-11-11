import type { Editor } from "@tldraw/tldraw";
import { getOrderBridge } from "./state-bridge";
import { base } from "$app/paths";
import { announceOrderFilesChanged } from "$lib/order/order-files-client";
export type CanvasStoredImage = { id: string; url: string };
/** Reuses the existing private, authenticated file contracts. No new bucket,
 * public URL, or database migration is required. */
export async function storeCanvasImage(
  editor: Editor,
  file: File,
  signal: AbortSignal,
): Promise<CanvasStoredImage> {
  if (editor.getInstanceState().isReadonly || signal.aborted)
    throw new Error("cancelled");
  const bridge = getOrderBridge(editor);
  if (bridge?.onStoreCanvasFile) return bridge.onStoreCanvasFile(file);
  const form = new FormData();
  form.set("file", file);
  let endpoint: string;
  if (bridge?.toolkitBoardId)
    endpoint = `${base}/api/toolkit/assets/${encodeURIComponent(bridge.toolkitBoardId)}`;
  else if (bridge?.orderId) {
    endpoint = base + "/api/files/upload";
    form.set("order_id", bridge.orderId);
    form.set("file_type", "canvas-asset");
  } else throw new Error("asset-context");
  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("asset-upload");
  const id = bridge.toolkitBoardId ? data.id : data.file?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("asset-upload");
  if (!bridge.toolkitBoardId) announceOrderFilesChanged(bridge.orderId!);
  return {
    id,
    url: bridge.toolkitBoardId
      ? `${base}/api/toolkit/assets/${bridge.toolkitBoardId}/${id}`
      : `${base}/api/files/${id}/download`,
  };
}
