import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';

export type SwarmShape = {
    id: string;
    type: 'swarm';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: {
        w: number;
        h: number;
        agentName: string;
        caps: string[];
    };
};

export class SwarmShapeUtil extends BaseBoxShapeUtil<SwarmShape> {
    static override type = 'swarm' as const;

    override getDefaultProps(): SwarmShape['props'] {
        return {
            w: 200,
            h: 120,
            agentName: 'AI Node 1',
            caps: ['reasoning', 'vision', 'coder']
        };
    }

    override component(shape: SwarmShape) {
        const { w, h, agentName, caps } = shape.props;
        
        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--bg-0)',
                    border: '2px solid #3b82f6',
                    borderRadius: '12px',
                    boxShadow: 'var(--glass-shadow)',
                    overflow: 'hidden',
                    pointerEvents: 'all'
                }}
            >
                <div style={{ padding: '8px', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                    🤖 {agentName}
                </div>
                <div style={{ padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start', flex: 1 }}>
                    {caps.map((c, i) => (
                        <span key={i} style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px' }}>
                            {c}
                        </span>
                    ))}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: SwarmShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
