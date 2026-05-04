import React, { useEffect, useRef } from 'react';
import { Tldraw, type Editor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { MakerShapeUtil } from './shapes/MakerShape';
import { ChatShapeUtil } from './shapes/ChatShape';
import { ForgeShapeUtil } from './shapes/ForgeShape';
import { DocumentShapeUtil } from './shapes/DocumentShape';
import { SwarmShapeUtil } from './shapes/SwarmShape';
import { OrderDetailsShapeUtil } from './shapes/form-shapes/OrderDetailsShape';
import { OrderAddressShapeUtil } from './shapes/form-shapes/OrderAddressShape';
import { Profile7stShapeUtil } from './shapes/form-shapes/Profile7stShape';
import { spawnDraftOrderTemplate, syncOrderDataToCanvas, type OrderSeed, type SpawnedShapes } from './templates/DraftOrderTemplate';
import { setOrderBridge, clearOrderBridge } from './state-bridge';

const customShapeUtils = [
    MakerShapeUtil,
    ChatShapeUtil,
    ForgeShapeUtil,
    DocumentShapeUtil,
    SwarmShapeUtil,
    OrderDetailsShapeUtil,
    OrderAddressShapeUtil,
    Profile7stShapeUtil,
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
    /** If true, hides the default tldraw UI chrome */
    hideUI?: boolean;
}

export function CanvasApp({
    initialSnapshot,
    onSave,
    onEditorReady,
    orderSeed,
    onOrderChange,
    onProfileChange,
    hideUI = false,
}: CanvasAppProps) {
    const spawnedRef = useRef<SpawnedShapes | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const seedRef = useRef<OrderSeed | null>(orderSeed ?? null);

    // Wire Svelte callbacks into the editor-scoped bridge (replaces window globals,
    // so multiple canvases / HMR cannot collide).
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        setOrderBridge(editor, { onOrderChange, onProfileChange });
        return () => clearOrderBridge(editor);
    }, [onOrderChange, onProfileChange]);

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
        setOrderBridge(editor, { onOrderChange, onProfileChange });

        if (onEditorReady) onEditorReady(editor);

        // Auto-save on every document change
        editor.store.listen(
            () => {
                if (onSave) onSave(editor.store.getSnapshot());
            },
            { scope: 'document' }
        );

        // Spawn the draft order template if a seed is provided and we haven't already
        const seed = seedRef.current;
        if (seed && !initialSnapshot && !spawnedRef.current) {
            // Defer by one tick so the editor is fully settled
            requestAnimationFrame(() => {
                spawnedRef.current = spawnDraftOrderTemplate(editor, seed);
            });
        }
    };

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Tldraw
                snapshot={initialSnapshot as any}
                shapeUtils={customShapeUtils}
                onMount={handleMount}
                hideUi={hideUI}
            />
        </div>
    );
}
