/**
 * Drag-drop asset pipeline for the order canvas.
 *
 * Listens for native drag/drop on the tldraw container, uploads each file via
 * /api/files/upload, and creates a DocumentShape (or auto-positions it inside
 * the Visuals frame when the drop point is outside any frame).
 */

import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { createShapeId } from '@tldraw/tldraw';
import { getOrderBridge } from './state-bridge';

export interface UploadedAsset {
    id: string;
    url: string;
    fileName: string;
    mime: string;
    kind: 'image' | 'pdf' | 'file';
}

function classify(mime: string): 'image' | 'pdf' | 'file' {
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    return 'file';
}

async function uploadFile(file: File, orderId: string): Promise<UploadedAsset | null> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('order_id', orderId);
    fd.append('file_type', 'canvas-asset');

    try {
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        if (!res.ok) {
            console.error('File upload failed', await res.text().catch(() => ''));
            return null;
        }
        const data = await res.json();
        const f = data.file ?? data;
        return {
            id: String(f.id),
            url: f.url || `/api/files/${f.id}/download`,
            fileName: f.file_name || file.name,
            mime: f.mime_type || file.type,
            kind: classify(f.mime_type || file.type),
        };
    } catch (err) {
        console.error('File upload error:', err);
        return null;
    }
}

/**
 * Find the visuals frame on the canvas (auto-spawned by DraftOrderTemplate).
 * Falls back to any frame named "Visuals…" or returns null.
 */
function findVisualsFrame(editor: Editor): TLShapeId | null {
    const allShapes = editor.getCurrentPageShapes();
    const frames = allShapes.filter((s: any) => s.type === 'frame');
    const visuals = frames.find((s: any) =>
        typeof s.props?.name === 'string' && /visuals/i.test(s.props.name)
    );
    return visuals ? (visuals.id as TLShapeId) : null;
}

/**
 * Returns true if the page point is inside the bounds of the given frame.
 */
function pointInFrame(editor: Editor, frameId: TLShapeId, point: { x: number; y: number }): boolean {
    const bounds = editor.getShapePageBounds(frameId);
    if (!bounds) return false;
    return point.x >= bounds.minX && point.x <= bounds.maxX
        && point.y >= bounds.minY && point.y <= bounds.maxY;
}

/**
 * Convert a screen-space pointer event to canvas page coordinates.
 */
function screenToPage(editor: Editor, clientX: number, clientY: number, container: HTMLElement) {
    const rect = container.getBoundingClientRect();
    const screenPoint = { x: clientX - rect.left, y: clientY - rect.top };
    return editor.screenToPage(screenPoint);
}

/**
 * Wire up the drag-drop pipeline. Returns an unsubscribe.
 */
export function wireAssetDropHandler(
    container: HTMLElement,
    editor: Editor,
    getOrderId: () => string | null,
): () => void {
    const onDragOver = (e: DragEvent) => {
        if (!e.dataTransfer) return;
        // Only handle external file drops
        const hasFiles = Array.from(e.dataTransfer.items).some(it => it.kind === 'file');
        if (!hasFiles) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = async (e: DragEvent) => {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        const orderId = getOrderId();
        if (!orderId) return;

        e.preventDefault();
        e.stopPropagation();

        const files = Array.from(e.dataTransfer.files);
        const dropPage = screenToPage(editor, e.clientX, e.clientY, container);

        // Determine fallback frame (Visuals)
        const visualsFrameId = findVisualsFrame(editor);
        const targetFrameId = visualsFrameId && !pointInFrame(editor, visualsFrameId, dropPage)
            ? null  // user dropped elsewhere — keep at drop point
            : visualsFrameId;

        // Compute a base position: if user dropped outside frames, use drop point.
        // Otherwise stagger inside the visuals frame from its top-left.
        const visualsBounds = visualsFrameId ? editor.getShapePageBounds(visualsFrameId) : null;
        let cursorX = dropPage.x;
        let cursorY = dropPage.y;
        if (targetFrameId && visualsBounds) {
            cursorX = visualsBounds.minX + 16;
            cursorY = visualsBounds.minY + 40;
        }

        for (const file of files) {
            const asset = await uploadFile(file, orderId);
            if (!asset) continue;

            const id = createShapeId();
            const isImage = asset.kind === 'image';
            const w = isImage ? 360 : 280;
            const h = isImage ? 280 : 340;

            editor.createShape({
                id,
                type: 'document',
                x: cursorX,
                y: cursorY,
                ...(targetFrameId ? { parentId: targetFrameId } : {}),
                props: {
                    w,
                    h,
                    title: asset.fileName,
                    content: '',
                    status: 'ready',
                    url: asset.url,
                    mime: asset.mime,
                    kind: asset.kind,
                    fileId: asset.id,
                },
            } as any);

            // Stagger next drop
            cursorX += 24;
            cursorY += 24;

            // Notify Svelte
            getOrderBridge(editor)?.onAssetUploaded?.(orderId, {
                url: asset.url,
                fileName: asset.fileName,
                kind: asset.kind,
            });
        }
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);

    return () => {
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('drop', onDrop);
    };
}
