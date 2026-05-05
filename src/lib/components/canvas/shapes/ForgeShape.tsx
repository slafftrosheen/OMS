import React, { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';

export type ForgeShape = TLBaseShape<'forge', {
    w: number;
    h: number;
    prompt: string;
    imageUrl: string | null;
}>;

export class ForgeShapeUtil extends BaseBoxShapeUtil<ForgeShape> {
    static override type = 'forge' as const;

    override getDefaultProps(): ForgeShape['props'] {
        return {
            w: 400,
            h: 450,
            prompt: 'A futuristic workshop with CNC machines',
            imageUrl: null
        };
    }

    override component(shape: ForgeShape) {
        const { w, h, prompt, imageUrl } = shape.props;
        const [localPrompt, setLocalPrompt] = useState(prompt);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);

        const handleGenerate = async () => {
            if (!localPrompt.trim() || loading) return;
            setLoading(true);
            setError(null);

            try {
                const res = await fetch('/api/ai/forge/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: localPrompt, width: 1024, height: 1024 })
                });
                
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(errText);
                }

                const data = await res.json();
                if (data.artifact && data.artifact.url) {
                    this.editor.updateShape<ForgeShape>({
                        id: shape.id,
                        type: 'forge',
                        props: { ...shape.props, prompt: localPrompt, imageUrl: data.artifact.url }
                    });
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
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
                    backgroundColor: 'var(--bg-0)',
                    border: '2px solid var(--brand)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    overflow: 'hidden',
                    pointerEvents: 'all'
                }}
            >
                <div style={{ padding: '8px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)' }} onPointerDown={e => e.stopPropagation()}>
                    <input 
                        value={localPrompt} 
                        onChange={e => setLocalPrompt(e.target.value)}
                        placeholder="Image prompt..."
                        style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                    <button 
                        onClick={handleGenerate} 
                        disabled={loading}
                        style={{ background: 'var(--brand)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                    >
                        {loading ? 'Generating...' : 'Generate'}
                    </button>
                </div>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'var(--bg-1)' }}>
                    {loading && <div style={{ position: 'absolute', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>Processing on Swarm...</div>}
                    {error && <div style={{ color: 'red', padding: '16px', fontSize: '12px', textAlign: 'center' }}>{error}</div>}
                    {imageUrl && !loading && !error && (
                        <img src={imageUrl} alt={localPrompt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
                    )}
                    {!imageUrl && !loading && !error && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No image generated yet.</div>
                    )}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: ForgeShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
