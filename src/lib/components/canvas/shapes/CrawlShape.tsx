import React, { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';
import { registerNodeRunner } from '../node-runner';
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

export type CrawlShape = {
    id: string;
    type: 'crawl';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: {
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
    };
};

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
        const { w, h, url, selector, includeLinks, maxChars, status, error, output } = shape.props;
        const [draftUrl, setDraftUrl] = useState(url);
        const [draftSel, setDraftSel] = useState(selector);
        const stop = (e: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) =>
            e.stopPropagation();

        const update = (patch: Partial<CrawlShape['props']>) => {
            this.editor.updateShape<CrawlShape>({
                id: shape.id,
                type: 'crawl',
                props: { ...shape.props, ...patch }
            });
        };

        const run = async () => {
            const u = draftUrl.trim();
            if (!u || status === 'running') return;
            update({ status: 'running', error: null, url: u, selector: draftSel.trim() });
            try {
                const res = await fetch('/api/ai/crawl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: u,
                        selector: draftSel || undefined,
                        include_links: includeLinks,
                        max_chars: maxChars
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                update({ status: 'done', output: data });
            } catch (err) {
                update({ status: 'error', error: (err as Error).message });
            }
        };

        return (
            <HTMLContainer id={shape.id} style={containerStyle(w, h, ACCENT, status === 'error')}>
                <div style={headerStyle(ACCENT)}>
                    <span>🌐 Crawl</span>
                    <span style={statusBadgeStyle(status)}>{status}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }} onPointerDown={stop}>
                    <input
                        value={draftUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                        placeholder="https://example.com/page"
                        style={inputStyle}
                    />
                    <input
                        value={draftSel}
                        onChange={(e) => setDraftSel(e.target.value)}
                        placeholder="CSS selector (optional)"
                        style={inputStyle}
                    />
                    <div style={rowStyle}>
                        <label style={labelStyle}>links</label>
                        <input
                            type="checkbox"
                            checked={includeLinks}
                            onChange={(e) => update({ includeLinks: e.target.checked })}
                        />
                        <label style={{ ...labelStyle, marginLeft: 12 }}>max_chars</label>
                        <input
                            type="number"
                            value={maxChars}
                            onChange={(e) => update({ maxChars: parseInt(e.target.value, 10) || 12_000 })}
                            style={{ ...inputStyle, width: 80 }}
                        />
                        <button onClick={run} disabled={status === 'running'} style={runButtonStyle(ACCENT)}>
                            {status === 'running' ? '…' : 'Fetch'}
                        </button>
                    </div>
                </div>
                <div style={bodyStyle} onPointerDown={stop}>
                    {error && <div style={{ color: '#ff453a' }}>⚠ {error}</div>}
                    {output && (
                        <>
                            <div style={{ fontWeight: 700 }}>{output.title || output.final_url}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted, #888)', marginBottom: 6 }}>
                                {output.bytes} bytes · {output.mime}
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
                                    <summary style={{ cursor: 'pointer' }}>Links ({output.links.length})</summary>
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

registerNodeRunner('crawl', async ({ shape, inputs }) => {
    const props = (shape as CrawlShape).props;
    // Allow upstream web-search hits to chain into a crawl: pull the first URL.
    const upstreamUrl =
        (inputs['web-search'] as { hits?: Array<{ url: string }> } | undefined)?.hits?.[0]?.url ??
        props.url;
    if (!upstreamUrl) throw new Error('crawl: url is empty');
    const res = await fetch('/api/ai/crawl', {
        method: 'POST',
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
