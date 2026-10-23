import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';
import { registerNodeRunner, runShape } from '../node-runner';
import { useToolkitText } from '../use-toolkit-text';
import {
    bodyStyle,
    containerStyle,
    headerStyle,
    inputStyle,
    rowStyle,
    runButtonStyle,
    statusBadgeStyle,
    labelStyle
} from './_node-styles';

export type CrawlShape = TLBaseShape<'crawl', {
    w: number;
    h: number;
    url: string;
    selector: string;
    includeLinks: boolean;
    maxChars: number;
    status: 'idle' | 'running' | 'done' | 'error';
    error: string | null;
    output: {
        url: string;
        final_url: string;
        title: string;
        text: string;
        links: string[];
        bytes: number;
        mime: string;
        note?: string;
    } | null;
}>;

const ACCENT = '#5856d6';

export class CrawlShapeUtil extends BaseBoxShapeUtil<CrawlShape> {
    static override type = 'crawl' as const;

    override getDefaultProps(): CrawlShape['props'] {
        return {
            w: 380,
            h: 360,
            url: 'https://reclamefabriek.eu',
            selector: '',
            includeLinks: false,
            maxChars: 12_000,
            status: 'idle',
            error: null,
            output: null
        };
    }

    override component(shape: CrawlShape) {
        const tn = useToolkitText();
        const { w, h, url, selector, includeLinks, maxChars, status, error, output } = shape.props;
        const stop = (e: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) =>
            e.stopPropagation();

        const update = (patch: Partial<CrawlShape['props']>) => {
            this.editor.updateShape<CrawlShape>({
                id: shape.id,
                type: 'crawl',
                props: patch
            });
        };

        const run = async () => {
            const u = url.trim();
            if (!u || status === 'running') return;
            update({ url: u, selector: selector.trim() });
            try {
                await runShape(this.editor, shape.id, { useUpstream: false });
            } catch { /* The shared runner displays the error on this node. */ }
        };

        return (
            <HTMLContainer id={shape.id} style={containerStyle(w, h, ACCENT, status === 'error')}>
                <div style={headerStyle(ACCENT)}>
                    <span>🌐 {tn('crawl')}</span>
                    <span style={statusBadgeStyle(status)}>{tn(`status${status[0].toUpperCase()}${status.slice(1)}`)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }} onPointerDown={stop}>
                    <input
                        value={url}
                        onChange={(e) => update({ url: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                        placeholder="https://example.com/page"
                        style={inputStyle}
                    />
                    <input
                        value={selector}
                        onChange={(e) => update({ selector: e.target.value })}
                        placeholder={tn('selector')}
                        style={inputStyle}
                    />
                    <div style={rowStyle}>
                        <label style={labelStyle}>{tn('links')}</label>
                        <input
                            type="checkbox"
                            checked={includeLinks}
                            onChange={(e) => update({ includeLinks: e.target.checked })}
                        />
                        <label style={{ ...labelStyle, marginLeft: 12 }}>{tn('maxChars')}</label>
                        <input
                            type="number"
                            value={maxChars}
                            onChange={(e) => update({ maxChars: parseInt(e.target.value, 10) || 12_000 })}
                            style={{ ...inputStyle, width: 80 }}
                        />
                        <button onClick={run} disabled={status === 'running'} style={runButtonStyle(ACCENT)}>
                            {status === 'running' ? '…' : tn('fetch')}
                        </button>
                    </div>
                </div>
                <div style={bodyStyle} onPointerDown={stop}>
                    {error && <div style={{ color: '#ff453a' }}>⚠ {error}</div>}
                    {output && (
                        <>
                            <div style={{ fontWeight: 700 }}>{output.title || output.final_url}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted, #888)', marginBottom: 6 }}>
                                {output.bytes} {tn('bytes')} · {output.mime}
                            </div>
                            {output.note && <div style={{ color: '#b45309', fontSize: 11 }}>{output.note}</div>}
                            <pre style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontFamily: 'inherit',
                                fontSize: 11,
                                margin: 0
                            }}>{output.text.slice(0, 1500)}</pre>
                            {output.links?.length > 0 && (
                                <details style={{ marginTop: 8 }}>
                                    <summary style={{ cursor: 'pointer' }}>{tn('links')} ({output.links.length})</summary>
                                    <ul style={{ margin: '6px 0 0 12px', padding: 0, fontSize: 11 }}>
                                        {output.links.slice(0, 30).map((l) => (
                                            <li key={l}>
                                                <a href={l} target="_blank" rel="noopener noreferrer" onClick={stop}>{l}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: CrawlShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

registerNodeRunner('crawl', async ({ shape, inputs, signal }) => {
    const props = (shape as CrawlShape).props;
    // Allow upstream web-search hits to chain into a crawl: pull the first URL.
    const upstreamUrl =
        (inputs['web-search'] as { hits?: Array<{ url: string }> } | undefined)?.hits?.[0]?.url ??
        props.url;
    if (!upstreamUrl) throw new Error('crawl: url is empty');
    const res = await fetch('/api/ai/crawl', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: upstreamUrl,
            selector: props.selector || undefined,
            include_links: props.includeLinks,
            max_chars: props.maxChars
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return {
        data,
        summary: data.title ? `Fetched “${data.title}”` : `Fetched ${upstreamUrl}`
    };
});
