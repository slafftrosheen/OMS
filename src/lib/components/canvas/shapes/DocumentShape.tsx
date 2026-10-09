import React from 'react';
import { PdfPreview } from './PdfPreview';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';

export type DocumentShape = TLBaseShape<'document', {
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
    fit?: 'contain' | 'cover';
    opacity?: number;
    pdfPage?: number;
}>;

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
            fit: 'contain',
            opacity: 100,
            pdfPage: 1,
        };
    }

    override component(shape: DocumentShape) {
        const { w, h, title, content, status, url, kind, mime } = shape.props;
        const stop = (e: React.SyntheticEvent) => e.stopPropagation();
        const edit = (props: Partial<DocumentShape['props']>) =>
            this.editor.updateShape<DocumentShape>({ id: shape.id, type: 'document', props });
        const editable = !kind || kind === 'note';

        const renderBody = () => {
            if (kind === 'image' && url) {
                return (
                    <img
                        src={url}
                        alt={title}
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: shape.props.fit ?? 'contain',
                            opacity: (shape.props.opacity ?? 100) / 100, background: '#0001' }}
                    />
                );
            }
            if (kind === 'pdf' && url) {
                return <PdfPreview url={url} page={shape.props.pdfPage || 1} width={w}
                    onPageChange={page => edit({ pdfPage: page })} />;
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
            return editable ? (
                <textarea aria-label="Document notes" value={content || ''}
                    onChange={e => edit({ content: e.target.value })}
                    onPointerDown={stop} onKeyDown={stop}
                    placeholder="Write or paste research, sketches or project notes…"
                    style={{ width: '100%', height: '100%', boxSizing: 'border-box',
                        padding: 13, resize: 'none', border: 0, outlineOffset: -2,
                        background: 'transparent', color: 'var(--text)',
                        fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5 }}
                />
            ) : <div style={{ padding: 12, fontSize: 12 }}>{content}</div>;
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
                    {editable ? <input aria-label="Document title" value={title}
                        maxLength={120} onChange={e => edit({ title: e.target.value })}
                        onPointerDown={stop} onKeyDown={stop}
                        style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 12,
                            border: 0, background: 'transparent', color: 'inherit' }}
                    /> : <strong style={{ fontSize: 12, textOverflow: 'ellipsis',
                        overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{title}</strong>}
                    {kind === 'image' && url && <>
                        <button type="button" title="Toggle crop / fit image" aria-label="Toggle image fit"
                            onPointerDown={stop} onKeyDown={stop}
                            onClick={() => edit({ fit: shape.props.fit === 'cover' ? 'contain' : 'cover' })}
                            style={{ fontSize: 10, padding: '3px 6px' }}>{shape.props.fit === 'cover' ? 'Fit' : 'Crop'}</button>
                        <label title="Image opacity" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                            <span>Opacity</span>
                            <input type="range" aria-label="Image opacity" min="15" max="100"
                                value={shape.props.opacity ?? 100} onPointerDown={stop} onKeyDown={stop}
                                onChange={e => edit({ opacity: Number(e.target.value) })}
                                style={{ width: 50 }} />
                        </label>
                    </>}
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
