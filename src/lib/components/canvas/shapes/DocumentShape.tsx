import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';

export type DocumentShape = {
    id: string;
    type: 'document';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: {
        w: number;
        h: number;
        title: string;
        content: string;
        status: 'queued' | 'ready' | 'failed';
    };
};

export class DocumentShapeUtil extends BaseBoxShapeUtil<DocumentShape> {
    static override type = 'document' as const;

    override getDefaultProps(): DocumentShape['props'] {
        return {
            w: 240,
            h: 300,
            title: 'New Document',
            content: 'Drag and drop content here...',
            status: 'ready'
        };
    }

    override component(shape: DocumentShape) {
        const { w, h, title, content, status } = shape.props;
        
        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--bg-0)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    boxShadow: 'var(--glass-shadow)',
                    overflow: 'hidden',
                    pointerEvents: 'all'
                }}
            >
                <div style={{ padding: '8px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '14px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{title}</strong>
                    <span style={{ 
                        fontSize: '10px', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        background: status === 'ready' ? '#e2f5ea' : (status === 'failed' ? '#fee2e2' : '#fef3c7'),
                        color: status === 'ready' ? '#166534' : (status === 'failed' ? '#991b1b' : '#92400e')
                    }}>
                        {status}
                    </span>
                </div>
                <div style={{ padding: '8px', fontSize: '12px', flex: 1, overflowY: 'auto', color: 'var(--text-muted)' }}>
                    {content}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: DocumentShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
