import canvasAssetUrls from './tldraw-asset-urls.json';
import React, { useEffect, useRef } from 'react';
import { Tldraw, getSnapshot, react as trackEditor, type Editor } from '@tldraw/tldraw';
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
import { getRunnableShapeIds } from './node-runner';

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

// Toolkit has one app-owned bottom toolbar. The order editor retains its
// native chrome; no global CSS hides tools in unrelated canvas surfaces.
const toolkitUi = {
    Toolbar: null, ActionsMenu: null, QuickActions: null, MenuPanel: null,
    NavigationPanel: null, HelperButtons: null, ContextMenu: null,
    DebugPanel: null, DebugMenu: null,
};

export interface CanvasAppProps {
    initialSnapshot?: unknown;
    onSave?: (snapshot: unknown) => void;
    onDocumentChange?: () => void;
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
    onToolkitLinkDrop?: (url: string, position?: { x: number; y: number }) => void;
    onToolkitControlsChange?: (state: { tool: string; selected: number; runnable: number; canUndo: boolean; canRedo: boolean }) => void;
}

export function CanvasApp({
    initialSnapshot,
    onSave,
    onDocumentChange,
    onEditorReady,
    orderSeed,
    onOrderChange,
    onProfileChange,
    onAssetUploaded,
    hideUI = false,
    toolkitBoardId = null,
    onToolkitFilesDrop,
    onToolkitLinkDrop,
    onToolkitControlsChange,
}: CanvasAppProps) {
    const spawnedRef = useRef<SpawnedShapes | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const seedRef = useRef<OrderSeed | null>(orderSeed ?? null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropCleanupRef = useRef<(() => void) | null>(null);
    const cleanupStoreRef = useRef<(() => void) | null>(null);
    const cleanupControlsRef = useRef<(() => void) | null>(null);
    const cleanupAppearanceRef = useRef<(() => void) | null>(null);
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const spawnFrameRef = useRef<number | null>(null);
    const callbacksRef = useRef({ onSave, onDocumentChange, onToolkitFilesDrop, onToolkitLinkDrop, onToolkitControlsChange });
    callbacksRef.current = { onSave, onDocumentChange, onToolkitFilesDrop, onToolkitLinkDrop, onToolkitControlsChange };

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

    const syncSeed = (editor: Editor, seed: OrderSeed) => {
        // Restored snapshots already contain the forms, so no template was
        // spawned this mount. Find only this order's existing form records.
        const forms = editor.getCurrentPageShapes().filter((shape) =>
            (shape.props as { orderId?: string }).orderId === seed.orderId);
        syncOrderDataToCanvas(editor,
            forms.find((shape) => shape.type === 'order-details')?.id,
            forms.find((shape) => shape.type === 'order-address')?.id,
            seed);
    };

    // Sync updated seed data into canvas without re-spawning or resetting history.
    useEffect(() => {
        const editor = editorRef.current;
        if (editor && orderSeed) syncSeed(editor, orderSeed);
    }, [orderSeed]);

    const handleMount = (editor: Editor) => {
        editorRef.current = editor;

        // Register the bridge immediately so any shape created during spawn can fire callbacks
        setOrderBridge(editor, { onOrderChange, onProfileChange, onAssetUploaded });

        // Toolkit captures its document only when saving. The order editor
        // still requests debounced full snapshots via onSave.
        const capture = () => {
            if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
            captureTimerRef.current = null;
            const onSave = callbacksRef.current.onSave;
            if (onSave) onSave(toolkitBoardId
                ? { document: editor.store.getStoreSnapshot() }
                : getSnapshot(editor.store));
        };
        const unlisten = editor.store.listen(
            () => {
                callbacksRef.current.onDocumentChange?.();
                if (!callbacksRef.current.onSave) return;
                if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
                captureTimerRef.current = setTimeout(capture, 250);
            },
            { scope: 'document' }
        );
        cleanupStoreRef.current?.();
        cleanupStoreRef.current = unlisten;
        // Register listener before templates / callbacks create new shapes.
        if (onEditorReady) onEditorReady(editor);
        if (toolkitBoardId) {
            const syncAppearance = () => {
                const colorScheme = document.documentElement.dataset.theme === 'LightVim' ? 'light' : 'dark';
                if (editor.user.getUserPreferences().colorScheme !== colorScheme) {
                    editor.user.updateUserPreferences({ colorScheme });
                }
            };
            syncAppearance();
            const appearance = new MutationObserver(syncAppearance);
            appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            cleanupAppearanceRef.current?.();
            cleanupAppearanceRef.current = () => appearance.disconnect();
            cleanupControlsRef.current?.();
            cleanupControlsRef.current = trackEditor('Toolkit controls', () => {
                callbacksRef.current.onToolkitControlsChange?.({ tool: editor.getCurrentToolId(),
                    selected: editor.getSelectedShapeIds().length,
                    runnable: getRunnableShapeIds(editor).length,
                    canUndo: editor.getCanUndo(), canRedo: editor.getCanRedo() });
            });
            // Route paste as well as drag/drop through private persistent
            // uploads, instead of tldraw's ephemeral data-URL asset store.
            editor.registerExternalContentHandler('files', async ({ files, point }) => {
                callbacksRef.current.onToolkitFilesDrop?.(files, point ?? editor.getViewportPageBounds().center);
            });
            editor.registerExternalContentHandler('url', async ({ url, point }) => {
                callbacksRef.current.onToolkitLinkDrop?.(url, point);
            });
        }

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
                    callbacksRef.current.onToolkitFilesDrop?.(files, position);
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
            spawnFrameRef.current = requestAnimationFrame(() => {
                spawnFrameRef.current = null;
                spawnedRef.current = spawnDraftOrderTemplate(editor, seedRef.current ?? seed);
            });
        } else if (seed) {
            syncSeed(editor, seed);
        }
    };

    useEffect(() => () => {
        dropCleanupRef.current?.();
        cleanupStoreRef.current?.();
        cleanupControlsRef.current?.();
        cleanupAppearanceRef.current?.();
        if (spawnFrameRef.current !== null) cancelAnimationFrame(spawnFrameRef.current);
        if (editorRef.current) clearOrderBridge(editorRef.current);
        editorRef.current = null;
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
            <CanvasModeContext.Provider value={toolkitBoardId ? 'toolkit' : 'order'}>
                <Tldraw
                    assetUrls={canvasAssetUrls}
                    snapshot={initialSnapshot as any}
                    shapeUtils={customShapeUtils}
                    onMount={handleMount}
                    hideUi={hideUI}
                    components={toolkitBoardId ? toolkitUi : undefined}
                />
            </CanvasModeContext.Provider>
        </div>
    );
}
