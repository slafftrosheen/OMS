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
        /** Persisted asset URL (image, pdf, or generic file) */
        url?: string;
        /** MIME type, used to choose render mode */
        mime?: string;
        /** Display variant — 'image' inlines the asset, 'pdf' shows preview frame, 'file' is a card */
        kind?: 'image' | 'pdf' | 'file' | 'note';
        /** Linked DB id from order_files (used by AI extract / context menus) */
        fileId?: string;
    };
};

export class DocumentShapeUtil extends BaseBoxShapeUtil<DocumentShape> {
    static override type = 'document' as const;

    override getDefaultProps(): DocumentShape['props'] {
        return {
            w: 240,
            h: 300,
            title: 'New Document',
            content: '',
            status: 'ready',
            url: undefined,
            mime: undefined,
            kind: 'note',
            fileId: undefined,
        };
    }

    override component(shape: DocumentShape) {
        const { w, h, title, content, status, url, kind, mime } = shape.props;
        const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

        const renderBody = () => {
            if (kind === 'image' && url) {
                return (
                    <img
                        src={url}
                        alt={title}
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0001' }}
                    />
                );
            }
            if (kind === 'pdf' && url) {
                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <object
                            data={url}
                            type={mime || 'application/pdf'}
                            style={{ flex: 1, width: '100%', minHeight: 0 }}
                        >
                            <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={stop}>
                                Open PDF in new tab ↗
                            </a>
                        </object>
                    </div>
                );
            }
            if (kind === 'file' && url) {
                return (
                    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 36 }}>📎</div>
                        <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={stop}>
                            Download {title} ↗
                        </a>
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>{mime || 'file'}</span>
                    </div>
                );
            }
            return (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted, #888)' }}>
                    {content || 'Drag a PDF or image into the Visuals zone…'}
                </div>
            );
        };

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-0, #fff)',
                    border: '1px solid var(--border, rgba(0,0,0,0.12))',
                    borderRadius: 8,
                    boxShadow: 'var(--glass-shadow, 0 4px 16px rgba(0,0,0,0.1))',
                    overflow: 'hidden',
                    pointerEvents: 'all',
                }}
            >
                <div style={{
                    padding: '6px 10px',
                    background: 'var(--bg-2, #f4f4f5)',
                    borderBottom: '1px solid var(--border, rgba(0,0,0,0.08))',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                }}>
                    <strong style={{
                        fontSize: 12,
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        flex: 1,
                    }}>{title}</strong>
                    <span style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: status === 'ready' ? '#d1fae5' : (status === 'failed' ? '#fee2e2' : '#fef3c7'),
                        color: status === 'ready' ? '#065f46' : (status === 'failed' ? '#991b1b' : '#92400e'),
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                    }}>{status}</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {renderBody()}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: DocumentShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
    }
}

const linkStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--brand, #e63329)',
    textDecoration: 'none',
    fontWeight: 600,
};
