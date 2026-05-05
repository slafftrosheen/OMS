import React, { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';
import { registerNodeRunner } from '../node-runner';

export type WebSearchShape = TLBaseShape<'web-search', {
    w: number;
    h: number;
    query: string;
    topK: number;
    language: string;
    site: string;
    status: 'idle' | 'running' | 'done' | 'error';
    error: string | null;
    output: {
        backend: string;
        query: string;
        hits: Array<{ title: string; url: string; snippet: string; engine: string | null }>;
        note?: string;
    } | null;
}>;

export class WebSearchShapeUtil extends BaseBoxShapeUtil<WebSearchShape> {
    static override type = 'web-search' as const;

    override getDefaultProps(): WebSearchShape['props'] {
        return {
            w: 360,
            h: 320,
            query: '',
            topK: 8,
            language: 'en',
            site: '',
            status: 'idle',
            error: null,
            output: null
        };
    }

    override component(shape: WebSearchShape) {
        const { w, h, query, topK, language, site, status, error, output } = shape.props;
        const [draftQuery, setDraftQuery] = useState(query);
        const [draftSite, setDraftSite] = useState(site);

        const stop = (e: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) =>
            e.stopPropagation();

        const update = (patch: Partial<WebSearchShape['props']>) => {
            this.editor.updateShape<WebSearchShape>({
                id: shape.id,
                type: 'web-search',
                props: { ...shape.props, ...patch }
            });
        };

        const run = async () => {
            const q = draftQuery.trim();
            if (!q || status === 'running') return;
            update({ status: 'running', error: null, query: q, site: draftSite.trim() });
            try {
                const res = await fetch('/api/ai/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: q,
                        top_k: topK,
                        language: language || undefined,
                        site: draftSite ? draftSite.split(',').map((s) => s.trim()).filter(Boolean) : undefined
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
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-0, #fff)',
                    border: `2px solid ${status === 'error' ? '#ff453a' : '#0a84ff'}`,
                    borderRadius: 12,
                    boxShadow: 'var(--glass-shadow, 0 4px 16px rgba(0,0,0,0.1))',
                    overflow: 'hidden',
                    pointerEvents: 'all'
                }}
            >
                <div style={headerStyle('#0a84ff')}>
                    <span>🔎 Web search</span>
                    <span style={statusBadgeStyle(status)}>{status}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }} onPointerDown={stop}>
                    <input
                        value={draftQuery}
                        onChange={(e) => setDraftQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                        placeholder="What do you want to know?"
                        style={inputStyle}
                    />
                    <input
                        value={draftSite}
                        onChange={(e) => setDraftSite(e.target.value)}
                        placeholder="site filter (comma-separated, optional)"
                        style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>top_k</label>
                        <input
                            type="number"
                            value={topK}
                            min={1}
                            max={25}
                            onChange={(e) => update({ topK: parseInt(e.target.value, 10) || 8 })}
                            style={{ ...inputStyle, width: 64 }}
                        />
                        <button onClick={run} disabled={status === 'running'} style={runButtonStyle('#0a84ff')}>
                            {status === 'running' ? '…' : 'Run'}
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', fontSize: 12 }} onPointerDown={stop}>
                    {error && <div style={{ color: '#ff453a' }}>⚠ {error}</div>}
                    {output?.note && <div style={{ color: 'var(--text-muted, #888)', fontStyle: 'italic' }}>{output.note}</div>}
                    {(output?.hits ?? []).map((hit, i) => (
                        <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                            <a
                                href={hit.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={stop}
                                style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 12 }}
                            >
                                {hit.title || hit.url}
                            </a>
                            <div style={{ color: 'var(--text-muted, #888)', fontSize: 11, marginTop: 2 }}>
                                {hit.url}
                            </div>
                            {hit.snippet && (
                                <div style={{ marginTop: 2, color: 'var(--text)' }}>
                                    {hit.snippet.slice(0, 240)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: WebSearchShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

// ─── styles ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border, #ccc)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    background: 'var(--bg-1, #fafafa)',
    color: 'var(--text)'
};
const headerStyle = (accent: string): React.CSSProperties => ({
    padding: '6px 10px',
    background: accent,
    color: 'white',
    fontWeight: 700,
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
});
const runButtonStyle = (accent: string): React.CSSProperties => ({
    background: accent,
    color: 'white',
    border: 0,
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 'auto'
});
const statusBadgeStyle = (s: string): React.CSSProperties => ({
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: s === 'done' ? '#34c759' : s === 'error' ? '#ff453a' : s === 'running' ? '#ffd60a' : 'rgba(255,255,255,0.25)',
    color: s === 'running' ? '#000' : 'white',
    textTransform: 'uppercase',
    fontWeight: 700,
    letterSpacing: '0.04em'
});

// Register the runner so the graph executor can drive this node alongside
// the shape's own Run button.
registerNodeRunner('web-search', async ({ shape, inputs }) => {
    const props = (shape as WebSearchShape).props;
    // Allow upstream nodes to override the query (e.g. a chat shape feeding in).
    const upstreamText =
        (inputs['document'] as { content?: string; text?: string } | undefined)?.content ??
        (inputs['document'] as { content?: string; text?: string } | undefined)?.text ??
        (inputs['chat'] as { messages?: Array<{ content: string }> } | undefined)?.messages?.slice(-1)[0]?.content;
    const query = (upstreamText || props.query || '').trim();
    if (!query) throw new Error('web-search: query is empty');
    const res = await fetch('/api/ai/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            top_k: props.topK,
            language: props.language || undefined,
            site: props.site ? props.site.split(',').map((s) => s.trim()).filter(Boolean) : undefined
        })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return {
        data,
        summary: `${(data.hits ?? []).length} hit(s) for "${query}"`
    };
});
