import React, { useEffect, useRef } from 'react';
import { Tldraw, type Editor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { MakerShapeUtil } from './shapes/MakerShape';
import { IdeaShapeUtil } from './shapes/IdeaShape';
import { MaterialSwatchShapeUtil } from './shapes/MaterialSwatchShape';
import { ChatShapeUtil } from './shapes/ChatShape';
import { DocumentShapeUtil } from './shapes/DocumentShape';
import { SwarmShapeUtil } from './shapes/SwarmShape';
import { OrderDetailsShapeUtil } from './shapes/form-shapes/OrderDetailsShape';
import { OrderAddressShapeUtil } from './shapes/form-shapes/OrderAddressShape';
import { Profile7stShapeUtil } from './shapes/form-shapes/Profile7stShape';
import { WebSearchShapeUtil } from './shapes/WebSearchShape';
import { CrawlShapeUtil } from './shapes/CrawlShape';
import {
    LumiGridShapeUtil,
    LedStripShapeUtil,
    LedMatrixShapeUtil,
    BoxLetterShapeUtil
} from './shapes/SignageShapes';
import { spawnDraftOrderTemplate, syncOrderDataToCanvas, type OrderSeed, type SpawnedShapes } from './templates/DraftOrderTemplate';
import { setOrderBridge, clearOrderBridge } from './state-bridge';
import { wireAssetDropHandler } from './asset-uploader';
import { CanvasModeContext } from './canvas-mode';

const customShapeUtils = [
    IdeaShapeUtil,
    MaterialSwatchShapeUtil,
    MakerShapeUtil,
    ChatShapeUtil,
    DocumentShapeUtil,
    SwarmShapeUtil,
    OrderDetailsShapeUtil,
    OrderAddressShapeUtil,
    Profile7stShapeUtil,
    WebSearchShapeUtil,
    CrawlShapeUtil,
    LumiGridShapeUtil,
    LedStripShapeUtil,
    LedMatrixShapeUtil,
    BoxLetterShapeUtil
];

export interface CanvasAppProps {
    initialSnapshot?: unknown;
    onSave?: (snapshot: unknown) => void;
    onEditorReady?: (editor: Editor) => void;
    /** When set, auto-spawns the DraftOrderTemplate on first mount */
    orderSeed?: OrderSeed | null;
    /** Called when a form shape field changes, bridges data back to Svelte */
    onOrderChange?: (orderId: string, patch: Partial<OrderSeed>) => void;
    /** Called when a profile shape changes */
    onProfileChange?: (orderId: string, profileIndex: number, profileData: any) => void;
    /** Called when a file has been uploaded and rendered on the canvas */
    onAssetUploaded?: (orderId: string, asset: { url: string; fileName: string; kind: string }) => void;
    /** If true, hides the default tldraw UI chrome */
    hideUI?: boolean;
    /** Toolkit shared board: register external drag/drop asset callback. */
    toolkitBoardId?: string | null;
    onToolkitFilesDrop?: (files: File[], position: { x: number; y: number }) => void;
}

export function CanvasApp({
    initialSnapshot,
    onSave,
    onEditorReady,
    orderSeed,
    onOrderChange,
    onProfileChange,
    onAssetUploaded,
    hideUI = false,
    toolkitBoardId = null,
    onToolkitFilesDrop,
}: CanvasAppProps) {
    const spawnedRef = useRef<SpawnedShapes | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const seedRef = useRef<OrderSeed | null>(orderSeed ?? null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropCleanupRef = useRef<(() => void) | null>(null);
    const cleanupStoreRef = useRef<(() => void) | null>(null);

    // Keep seedRef current so the drop handler can read the latest orderId
    useEffect(() => {
        seedRef.current = orderSeed ?? null;
    }, [orderSeed]);

    // Wire Svelte callbacks into the editor-scoped bridge (replaces window globals,
    // so multiple canvases / HMR cannot collide).
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        setOrderBridge(editor, { onOrderChange, onProfileChange, onAssetUploaded });
        return () => clearOrderBridge(editor);
    }, [onOrderChange, onProfileChange, onAssetUploaded]);

    // Sync updated seed data into canvas without re-spawning
    useEffect(() => {
        const editor = editorRef.current;
        const shapes = spawnedRef.current;
        if (!editor || !shapes || !orderSeed) return;
        syncOrderDataToCanvas(editor, shapes.detailsId, shapes.addressId, orderSeed);
    }, [orderSeed]);

    const handleMount = (editor: Editor) => {
        editorRef.current = editor;

        // Register the bridge immediately so any shape created during spawn can fire callbacks
        setOrderBridge(editor, { onOrderChange, onProfileChange, onAssetUploaded });

        if (onEditorReady) onEditorReady(editor);

        // Auto-save on every document change
        const unlisten = editor.store.listen(
            () => onSave?.(editor.store.getSnapshot()),
            { scope: 'document' }
        );
        cleanupStoreRef.current?.();
        cleanupStoreRef.current = unlisten;

        // Separate order-document uploads from Toolkit shared-board imports.
        if (containerRef.current) {
            dropCleanupRef.current?.();
            if (toolkitBoardId && onToolkitFilesDrop) {
                const container = containerRef.current;
                const onDragOver = (event: DragEvent) => {
                    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
                };
                const onDrop = (event: DragEvent) => {
                    if (!event.dataTransfer?.files?.length) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const files = Array.from(event.dataTransfer.files);
                    // DOM clientX/clientY are screen coordinates. tldraw
                    // screenToPage handles the editor container offset.
                    const position = editor.screenToPage({ x: event.clientX, y: event.clientY });
                    onToolkitFilesDrop(files, position);
                };
                container.addEventListener('dragover', onDragOver, true);
                container.addEventListener('drop', onDrop, true);
                dropCleanupRef.current = () => {
                    container.removeEventListener('dragover', onDragOver, true);
                    container.removeEventListener('drop', onDrop, true);
                };
            } else {
                dropCleanupRef.current = wireAssetDropHandler(
                    containerRef.current, editor, () => seedRef.current?.orderId ?? null
                );
            }
        }

        // Spawn the draft order template if a seed is provided and we haven't already
        const seed = seedRef.current;
        if (seed && !initialSnapshot && !spawnedRef.current) {
            // Defer by one tick so the editor is fully settled
            requestAnimationFrame(() => {
                spawnedRef.current = spawnDraftOrderTemplate(editor, seed);
            });
        }
    };

    useEffect(() => () => {
        dropCleanupRef.current?.();
        cleanupStoreRef.current?.();
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
            <CanvasModeContext.Provider value={toolkitBoardId ? 'toolkit' : 'order'}>
                <Tldraw
                    snapshot={initialSnapshot as any}
                    shapeUtils={customShapeUtils}
                    onMount={handleMount}
                    hideUi={hideUI}
                />
            </CanvasModeContext.Provider>
        </div>
    );
}
