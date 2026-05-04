/**
 * Editor-scoped bridge for Svelte ↔ React/tldraw state sync.
 *
 * Replaces the previous `window.__omsOrderChange` global with a WeakMap keyed by the
 * tldraw editor instance, so multiple canvases (or hot reload) cannot collide.
 */

import type { Editor } from '@tldraw/tldraw';

export interface OrderBridge {
    onOrderChange?: (orderId: string, patch: Record<string, unknown>) => void;
    onProfileChange?: (orderId: string, profileIndex: number, profileData: Record<string, unknown>) => void;
    onAssetUploaded?: (orderId: string, asset: { url: string; fileName: string; kind: string }) => void;
}

const REGISTRY = new WeakMap<Editor, OrderBridge>();

export function setOrderBridge(editor: Editor, bridge: OrderBridge): void {
    REGISTRY.set(editor, bridge);
}

export function getOrderBridge(editor: Editor): OrderBridge | undefined {
    return REGISTRY.get(editor);
}

export function clearOrderBridge(editor: Editor): void {
    REGISTRY.delete(editor);
}
