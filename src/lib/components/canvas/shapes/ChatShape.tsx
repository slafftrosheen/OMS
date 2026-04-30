import React, { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';

export type ChatShape = {
    id: string;
    type: 'chat';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: {
        w: number;
        h: number;
        messages: Array<{ role: 'user' | 'assistant', content: string }>;
    };
};

export class ChatShapeUtil extends BaseBoxShapeUtil<ChatShape> {
    static override type = 'chat' as const;

    override getDefaultProps(): ChatShape['props'] {
        return {
            w: 300,
            h: 400,
            messages: []
        };
    }

    override component(shape: ChatShape) {
        const { w, h, messages } = shape.props;
        const [input, setInput] = useState('');
        const [loading, setLoading] = useState(false);

        const handleSend = async () => {
            if (!input.trim() || loading) return;
            setLoading(true);

            // Proximity check: find MakerShapes near this ChatShape
            const allShapes = this.editor.getCurrentPageShapes();
            let contextText = '';
            
            const makerShapes = allShapes.filter(s => s.type === 'maker');
            for (const ms of makerShapes) {
                // Calculate distance
                const dx = ms.x - shape.x;
                const dy = ms.y - shape.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 800) { // proximity radius
                    const mProps = ms.props as any;
                    contextText += `\n[Context from nearby MakerShape]:\nParams: ${JSON.stringify(mProps.params)}\nCode:\n${mProps.code}\n`;
                }
            }

            const prompt = input + contextText;
            
            const newMessages = [...messages, { role: 'user' as const, content: input }];
            
            this.editor.updateShape<ChatShape>({
                id: shape.id,
                type: 'chat',
                props: { ...shape.props, messages: newMessages }
            });
            setInput('');

            try {
                // Simulate an AI call or call actual API if needed
                const res = await fetch('/api/ai/sessions/canvas-temp/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: prompt })
                }).catch(() => null);
                
                let reply = "Could not connect to AI.";
                if (res && res.ok) {
                    const data = await res.json();
                    reply = data.content;
                } else if (!res) {
                    // Fallback mock if API is strict
                    reply = `I see you said: "${input}". ${contextText ? 'I also see the maker code nearby.' : ''}`;
                }

                this.editor.updateShape<ChatShape>({
                    id: shape.id,
                    type: 'chat',
                    props: { ...shape.props, messages: [...newMessages, { role: 'assistant', content: reply }] }
                });
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
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--glass-shadow)',
                    overflow: 'hidden',
                    pointerEvents: 'all'
                }}
            >
                <div style={{ padding: '8px', background: 'var(--brand)', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                    Contextual AI
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }} onPointerDown={e => e.stopPropagation()}>
                    {messages.map((m, i) => (
                        <div key={i} style={{ 
                            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                            background: m.role === 'user' ? 'color-mix(in oklab, var(--brand) 20%, transparent)' : 'var(--bg-2)',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            maxWidth: '90%'
                        }}>
                            {m.content}
                        </div>
                    ))}
                    {loading && <div style={{ fontSize: '10px', color: 'gray' }}>Thinking...</div>}
                </div>

                <div style={{ padding: '8px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '4px' }} onPointerDown={e => e.stopPropagation()}>
                    <input 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                        placeholder="Type a message..."
                        style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
                    />
                    <button onClick={handleSend} disabled={loading} style={{ background: 'var(--brand)', color: 'white', border: 'none', borderRadius: '4px', padding: '0 8px', cursor: 'pointer' }}>
                        Send
                    </button>
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: ChatShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
