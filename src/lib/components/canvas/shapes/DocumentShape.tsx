import React, { useState } from 'react';
import { useToolkitText } from '../use-toolkit-text';
import { PdfPreview } from './PdfPreview';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';
import { canvasLinkDescriptor, normalizeCanvasMediaUrl, safeCanvasDocumentUrl } from '../toolkit-media-url';

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
    kind?: 'image' | 'pdf' | 'file' | 'note' | 'video' | 'audio' | 'link' | 'embed';
    description?: string;
    previewImage?: string;
    siteName?: string;
    /** Stored only as descriptive metadata; playback derives its URL from url. */
    embedUrl?: string;
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
            // tldraw document records require JSON-serializable values. Empty
            // optional values keep notes and URL cards valid before upload.
            url: '',
            mime: '',
            kind: 'note',
            fileId: '',
            fit: 'contain',
            opacity: 100,
            pdfPage: 1,
            description: '', previewImage: '', siteName: '', embedUrl: '',
        };
    }

    override component(shape: DocumentShape) {
        const tn = useToolkitText();
        const { w, h, title, content, status, url, kind, mime } = shape.props;
        const stop = (e: React.SyntheticEvent) => e.stopPropagation();
        const edit = (props: Partial<DocumentShape['props']>) =>
            this.editor.updateShape<DocumentShape>({ id: shape.id, type: 'document', props });
        const editable = !kind || kind === 'note';

        const renderBody = () => {
            if ((kind === 'video' || kind === 'audio') && url) {
                const source = safeCanvasDocumentUrl(url);
                if (!source) return <p style={{ padding: 14 }}>{tn('mediaUnavailable')}</p>;
                return <div onPointerDown={stop} onKeyDown={stop} onDoubleClick={stop}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
                        minHeight: 0, padding: kind === 'audio' ? 18 : 0,
                        background: kind === 'video' ? '#111' : 'var(--bg-1)' }}>
                    {kind === 'video' ? <video controls playsInline preload="metadata" src={source}
                        aria-label={title} style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
                        <a href={source}>{tn('download')} {title}</a>
                    </video> : <audio controls preload="metadata" src={source} aria-label={title}
                        style={{ width: '100%' }}><a href={source}>{tn('download')} {title}</a></audio>}
                </div>;
            }
            if ((kind === 'link' || kind === 'embed') && url) {
                return <CanvasLinkPreview key={url} shape={shape} />;
            }
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
                            {tn('download')} {title} ↗
                        </a>
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>{mime || 'file'}</span>
                    </div>
                );
            }
            return editable ? (
                <textarea aria-label={tn('documentNotes')} value={content || ''}
                    onChange={e => edit({ content: e.target.value })}
                    onPointerDown={stop} onKeyDown={stop}
                    placeholder={tn('notesPlaceholder')}
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
                    {editable ? <input aria-label={tn('documentTitle')} value={title}
                        maxLength={120} onChange={e => edit({ title: e.target.value })}
                        onPointerDown={stop} onKeyDown={stop}
                        style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 12,
                            border: 0, background: 'transparent', color: 'inherit' }}
                    /> : <strong style={{ fontSize: 12, textOverflow: 'ellipsis',
                        overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{title}</strong>}
                    {kind === 'image' && url && <>
                        <button type="button" title={tn('imageCrop')} aria-label={tn('imageFit')}
                            onPointerDown={stop} onKeyDown={stop}
                            onClick={() => edit({ fit: shape.props.fit === 'cover' ? 'contain' : 'cover' })}
                            style={{ fontSize: 10, padding: '3px 6px' }}>{shape.props.fit === 'cover' ? tn('fit') : tn('crop')}</button>
                        <label title={tn('imageOpacity')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                            <span>{tn('opacity')}</span>
                            <input type="range" aria-label={tn('imageOpacity')} min="15" max="100"
                                value={shape.props.opacity ?? 100} onPointerDown={stop} onKeyDown={stop}
                                onChange={e => edit({ opacity: Number(e.target.value) })}
                                style={{ width: 50 }} />
                        </label>
                    </>}
                    <span style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: status === 'ready' ? 'var(--success-soft, #d1fae5)' : (status === 'failed' ? 'var(--error-soft, #fee2e2)' : 'var(--warning-soft, #fef3c7)'),
                        color: status === 'ready' ? 'var(--success, #065f46)' : (status === 'failed' ? 'var(--error, #991b1b)' : 'var(--warning, #92400e)'),
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                    }} >{status === 'ready' ? tn('docReady') : status === 'failed' ? tn('docFailed') : tn('docProcessing')}</span>
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

function CanvasLinkPreview({ shape }: { shape: DocumentShape }) {
    const tn = useToolkitText();
    const [playing, setPlaying] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const { url, title, description, previewImage, siteName } = shape.props;
    const link = canvasLinkDescriptor(url);
    const image = normalizeCanvasMediaUrl(previewImage);
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    if (!link) return <p style={{ padding: 14 }}>{tn('mediaUnavailable')}</p>;
    return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        {playing && link.embedUrl ? <iframe src={link.embedUrl} title={title}
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onPointerDown={stop} style={{ flex: 1, width: '100%', minHeight: 200, border: 0 }} />
        : <>
            {image && !imageFailed && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer"
                draggable={false} onError={() => setImageFailed(true)}
                style={{ width: '100%', maxHeight: link.embedUrl ? 115 : 155, minHeight: 0, objectFit: 'cover' }} />}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minHeight: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{siteName || link.siteName}</span>
                <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{title}</strong>
                {description && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, overflow: 'hidden',
                    color: 'var(--ink-secondary)', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 }}>{description}</p>}
                {link.embedUrl && <button type="button" onPointerDown={stop} onKeyDown={stop}
                    onClick={event => { stop(event); setPlaying(true); }}
                    style={{ alignSelf: 'flex-start', minHeight: 38, border: '1px solid var(--border)',
                        borderRadius: 7, padding: '7px 12px', background: 'var(--brand)', color: 'var(--on-brand)' }}>
                    {tn('playEmbeddedVideo')}
                </button>}
            </div>
        </>}
        <a href={link.url} target="_blank" rel="noopener noreferrer" onPointerDown={stop} onKeyDown={stop} onClick={stop}
            style={{ ...linkStyle, padding: '10px 14px', borderTop: '1px solid var(--border)',
                flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tn('openOriginal')} · {link.siteName} ↗
        </a>
    </div>;
}

const linkStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--brand, #e63329)',
    textDecoration: 'none',
    fontWeight: 600,
};
