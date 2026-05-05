import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';
import makerjs from 'makerjs';

export type MakerShape = TLBaseShape<'maker', {
    w: number;
    h: number;
    code: string;
    params: Record<string, number>;
}>;

export class MakerShapeUtil extends BaseBoxShapeUtil<MakerShape> {
    static override type = 'maker' as const;

    override getDefaultProps(): MakerShape['props'] {
        return {
            w: 300,
            h: 300,
            code: `module.exports = function(radius, width) {
  this.paths = {
    circle: new makerjs.paths.Circle([0, 0], radius),
    line: new makerjs.paths.Line([-width/2, 0], [width/2, 0])
  };
};`,
            params: { radius: 50, width: 100 }
        };
    }

    override component(shape: MakerShape) {
        const { w, h, code, params } = shape.props;
        
        let svgHtml = '';
        let error = null;
        let paramMeta: {name: string, type: string, min: number, max: number, value: number}[] = [];

        try {
            // Very unsafe in prod without isolation, but fine for internal mock
            const fn = new Function('require', 'module', code + '\nreturn module.exports;');
            const makerModule = fn((name: string) => {
                if (name === 'makerjs') return makerjs;
                throw new Error('Only makerjs is supported');
            }, { exports: {} });

            // Extract metadata if available (typical Maker.js convention: fn.metaParameters)
            if (makerModule.metaParameters) {
                paramMeta = makerModule.metaParameters;
            } else {
                // Infer from default params
                paramMeta = Object.keys(params).map(k => ({
                    name: k, type: 'range', min: 1, max: 500, value: params[k]
                }));
            }

            const modelParams = paramMeta.map(p => params[p.name] ?? p.value ?? 50);
            const model = new makerModule(...modelParams);
            
            svgHtml = makerjs.exporter.toSVG(model, {
                stroke: 'currentColor',
                strokeWidth: '2px',
                fill: 'none',
                viewBox: true
            });
        } catch (err: any) {
            error = err.message;
        }

        const handleParamChange = (name: string, value: number) => {
            this.editor.updateShape<MakerShape>({
                id: shape.id,
                type: 'maker',
                props: {
                    ...shape.props,
                    params: { ...params, [name]: value }
                }
            });
        };

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--glass-bg)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '8px',
                    boxShadow: 'var(--glass-shadow)',
                    overflow: 'hidden',
                    pointerEvents: 'all' // allow UI interaction
                }}
            >
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '4px' }}>
                    Maker.js Component
                </div>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                    {error ? (
                        <div style={{ color: '#ff453a', fontSize: '12px' }}>{error}</div>
                    ) : (
                        <div dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ width: '100%', height: '100%' }} />
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '10px' }} onPointerDown={e => e.stopPropagation()}>
                    {paramMeta.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '50px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            <input 
                                type="range" 
                                min={p.min ?? 1} 
                                max={p.max ?? 500} 
                                value={params[p.name] ?? p.value ?? 50}
                                onChange={(e) => handleParamChange(p.name, parseFloat(e.target.value))}
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <span style={{ width: '30px', textAlign: 'right' }}>{params[p.name] ?? p.value ?? 50}</span>
                        </div>
                    ))}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: MakerShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
