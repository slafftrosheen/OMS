import React, { useState } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { MakerShapeUtil } from './shapes/MakerShape';
import { ChatShapeUtil } from './shapes/ChatShape';
import { ForgeShapeUtil } from './shapes/ForgeShape';
import { DocumentShapeUtil } from './shapes/DocumentShape';
import { SwarmShapeUtil } from './shapes/SwarmShape';

const customShapeUtils = [MakerShapeUtil, ChatShapeUtil, ForgeShapeUtil, DocumentShapeUtil, SwarmShapeUtil];

export function CanvasApp({ 
    initialSnapshot, 
    onSave,
    onEditorReady
}: { 
    initialSnapshot?: unknown; 
    onSave?: (snapshot: unknown) => void;
    onEditorReady?: (editor: any) => void;
}) {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Tldraw
                snapshot={initialSnapshot}
                shapeUtils={customShapeUtils}
                onMount={(editor) => {
                    if (onEditorReady) onEditorReady(editor);
                    editor.store.listen(
                        () => {
                            if (onSave) onSave(editor.store.getSnapshot());
                        },
                        { scope: 'document' }
                    );
                }}
            />
        </div>
    );
}
