// Four signage-domain calculator shapes, sharing the same input-form +
// notes/warnings render. Each posts to the matching `/api/ai/signage/*`
// endpoint and exposes `output` so downstream nodes (chat, document) can
// pick up the calculation summary.

import React from 'react';
import { useToolkitText } from '../use-toolkit-text';
import { BaseBoxShapeUtil, HTMLContainer, type Editor, type TLBaseShape } from '@tldraw/tldraw';
import { registerNodeRunner, runShape } from '../node-runner';
import {
    bodyStyle,
    containerStyle,
    headerStyle,
    inputStyle,
    labelStyle,
    noteStyle,
    rowStyle,
    runButtonStyle,
    statusBadgeStyle,
    warnStyle
} from './_node-styles';

interface BasePlanProps {
    w: number;
    h: number;
    inputs: Record<string, string | number | boolean>;
    status: 'idle' | 'running' | 'done' | 'error';
    error: string | null;
    output: {
        notes?: string[];
        warnings?: string[];
        [k: string]: unknown;
    } | null;
}

// ─── Generic plan-card renderer ─────────────────────────────────────────────

interface FieldDef {
    key: string;
    type: 'number' | 'text' | 'checkbox' | 'select';
    options?: Array<string | number>;
    placeholder?: string;
}

function PlanCard<T extends BasePlanProps>(props: {
    accent: string;
    title: string;
    icon: string;
    fields: FieldDef[];
    shape: { id: string; type: string; props: T };
    editor: Editor;
    /** Renders a result summary block next to the notes/warnings list. */
    renderSummary?: (output: NonNullable<T['output']>) => React.ReactNode;
}) {
    const tn = useToolkitText();
    const { accent, title, icon, fields, shape, editor, renderSummary } = props;
    const { w, h, inputs, status, error, output } = shape.props;
    const stop = (e: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) =>
        e.stopPropagation();

    const updateInput = (key: string, value: string | number | boolean) => {
        const current = editor.getShape(shape.id as any);
        if (!current || current.type !== shape.type) return;
        editor.updateShape({
            id: current.id,
            type: shape.type,
            props: { inputs: { ...(current.props as BasePlanProps).inputs, [key]: value } }
        } as any);
    };

    const run = async () => {
        if (status === 'running') return;
        try {
            await runShape(editor, shape.id, { useUpstream: false });
        } catch { /* The shared runner displays the error on this node. */ }
    };

    return (
        <HTMLContainer id={shape.id} style={containerStyle(w, h, accent, status === 'error')}>
            <div style={headerStyle(accent)}>
                <span>{icon} {title === 'LED strip plan' ? tn('signageStrip') : title === 'LED matrix' ? tn('signageMatrix') : title === 'Box letter' ? tn('signageLetter') : title}</span>
                <span style={statusBadgeStyle(status)}>{tn(`status${status[0].toUpperCase()}${status.slice(1)}`)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: 8, gap: 4 }} onPointerDown={stop}>
                {fields.map((f) => (
                    <div key={f.key} style={rowStyle}>
                        <label style={labelStyle}>{tn(`fields.${f.key}`)}</label>
                        {f.type === 'checkbox' ? (
                            <input
                                type="checkbox"
                                checked={!!inputs[f.key]}
                                onChange={(e) => updateInput(f.key, e.target.checked)}
                            />
                        ) : f.type === 'select' ? (
                            <select
                                value={String(inputs[f.key] ?? '')}
                                onChange={(e) => updateInput(f.key, e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">—</option>
                                {(f.options ?? []).map((o) => (
                                    <option key={String(o)} value={String(o)}>{o}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={f.type}
                                value={String(inputs[f.key] ?? '')}
                                placeholder={f.placeholder}
                                onChange={(e) =>
                                    updateInput(f.key, f.type === 'number'
                                        ? (e.target.value === '' ? '' : parseFloat(e.target.value))
                                        : e.target.value)
                                }
                                onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                        )}
                    </div>
                ))}
                <button onClick={run} disabled={status === 'running'} style={{ ...runButtonStyle(accent), alignSelf: 'flex-end' }}>
                    {status === 'running' ? tn('calculating') : tn('compute')}
                </button>
            </div>
            <div style={bodyStyle} onPointerDown={stop}>
                {error && <div style={{ color: '#ff453a' }}>⚠ {error}</div>}
                {output && (
                    <>
                        {renderSummary?.(output as NonNullable<T['output']>)}
                        {output.notes?.map((n: string, i: number) => (
                            <div key={`n${i}`} style={noteStyle}>• {n}</div>
                        ))}
                        {output.warnings?.map((wn: string, i: number) => (
                            <div key={`w${i}`} style={warnStyle}>⚠ {wn}</div>
                        ))}
                    </>
                )}
            </div>
        </HTMLContainer>
    );
}

// ─── LumiGrid ──────────────────────────────────────────────────────────────

export type LumiGridShape = TLBaseShape<'lumigrid', BasePlanProps>;

const LUMIGRID_FIELDS: FieldDef[] = [
    { key: 'channels', type: 'number', placeholder: '4' },
    { key: 'channel_ma', type: 'number', placeholder: '350' },
    { key: 'volts', type: 'select', options: [12, 24] },
    { key: 'addressable_lanes', type: 'number', placeholder: '0' },
    { key: 'pixels_per_lane', type: 'number', placeholder: '0' },
    { key: 'pixel_ma', type: 'number', placeholder: '0' },
    { key: 'pixel_volts', type: 'select', options: [5, 12, 24] },
    { key: 'pwm_hz', type: 'number', placeholder: '24000' },
    { key: 'pwm_bits', type: 'number', placeholder: '16' },
    { key: 'gamma', type: 'number', placeholder: '2.2' },
    { key: 'camera_safe', type: 'checkbox' }
];

export class LumiGridShapeUtil extends BaseBoxShapeUtil<LumiGridShape> {
    static override type = 'lumigrid' as const;
    override getDefaultProps(): LumiGridShape['props'] {
        return {
            w: 410, h: 530,
            inputs: { channels: 4, channel_ma: 350, volts: 24,
                addressable_lanes: 0, pixels_per_lane: 0, pixel_ma: 0,
                pwm_hz: 24_000, pwm_bits: 16, gamma: 2.2, camera_safe: false },
            status: 'idle', error: null, output: null
        };
    }
    override component(shape: LumiGridShape) {
        return (
            <PlanCard
                accent="#e63329"
                title="LumiGrid · 8 PWM + 8 RMT"
                icon="🎚️"
                fields={LUMIGRID_FIELDS}
                shape={shape}
                editor={this.editor}
                renderSummary={(o: any) => (
                    <div style={summaryStyle}>
                        <strong>{o.channels}/8 PWM · {o.addressable_lanes}/8 RMT</strong>
                        <span> PWM: {o.psu_amps} A / {o.psu_watts} W</span>
                        {o.addressable_lanes > 0 && <span> · Pixels: {o.addressable_psu_amps} A / {o.addressable_psu_watts} W</span>}
                        <span> · PSU budget: {o.total_psu_watts} W (separate rails if voltages differ)</span>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            LUT: {o.gamma_lut_preview?.join(', ')}
                        </div>
                    </div>
                )}
            />
        );
    }
    override indicator(shape: LumiGridShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

// ─── LED Strip ─────────────────────────────────────────────────────────────

export type LedStripShape = TLBaseShape<'led-strip', BasePlanProps>;

const STRIP_FIELDS: FieldDef[] = [
    { key: 'length_m', type: 'number', placeholder: '5' },
    { key: 'volts', type: 'select', options: [5, 12, 24] },
    { key: 'leds_per_m', type: 'number', placeholder: '60' },
    { key: 'ma_per_led', type: 'number', placeholder: '60' },
    { key: 'wire_mm2', type: 'number', placeholder: '4' },
    { key: 'fps', type: 'number', placeholder: '60' }
];

export class LedStripShapeUtil extends BaseBoxShapeUtil<LedStripShape> {
    static override type = 'led-strip' as const;
    override getDefaultProps(): LedStripShape['props'] {
        return {
            w: 360, h: 420,
            inputs: { length_m: 5, volts: 24, leds_per_m: 60, ma_per_led: 60, wire_mm2: 4, fps: 60 },
            status: 'idle', error: null, output: null
        };
    }
    override component(shape: LedStripShape) {
        return (
            <PlanCard
                accent="#34c759"
                title="LED strip plan"
                icon="💡"
                fields={STRIP_FIELDS}
                shape={shape}
                editor={this.editor}
                renderSummary={(o: any) => (
                    <div style={summaryStyle}>
                        <strong>{o.leds_total} LED</strong>
                        <span> · PSU {o.psu_amps} A / {o.psu_watts} W</span>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            drop {o.drop_volts} V · max {o.max_fps} fps · {o.injection_points} inject
                        </div>
                    </div>
                )}
            />
        );
    }
    override indicator(shape: LedStripShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

// ─── LED Matrix ────────────────────────────────────────────────────────────

export type LedMatrixShape = TLBaseShape<'led-matrix', BasePlanProps>;

const MATRIX_FIELDS: FieldDef[] = [
    { key: 'pitch_mm', type: 'number', placeholder: '4' },
    { key: 'width_mm', type: 'number', placeholder: '1920' },
    { key: 'height_mm', type: 'number', placeholder: '1080' },
    { key: 'refresh_hz', type: 'number', placeholder: '60' },
    { key: 'scan', type: 'number', placeholder: '16' },
    { key: 'ma_per_pixel', type: 'number', placeholder: '18' }
];

export class LedMatrixShapeUtil extends BaseBoxShapeUtil<LedMatrixShape> {
    static override type = 'led-matrix' as const;
    override getDefaultProps(): LedMatrixShape['props'] {
        return {
            w: 360, h: 440,
            inputs: { pitch_mm: 4, width_mm: 1920, height_mm: 1080, refresh_hz: 60, scan: 16, ma_per_pixel: 18 },
            status: 'idle', error: null, output: null
        };
    }
    override component(shape: LedMatrixShape) {
        return (
            <PlanCard
                accent="#0a84ff"
                title="LED matrix"
                icon="🟦"
                fields={MATRIX_FIELDS}
                shape={shape}
                editor={this.editor}
                renderSummary={(o: any) => (
                    <div style={summaryStyle}>
                        <strong>{o.cols}×{o.rows}</strong>
                        <span> · {o.area_m2} m² · clk {o.clock_mhz} MHz</span>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            PSU {o.psu_amps} A · {o.psu_watts} W · feasible: {o.feasible ? '✓' : '✗'}
                        </div>
                    </div>
                )}
            />
        );
    }
    override indicator(shape: LedMatrixShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

// ─── BoxLetter ─────────────────────────────────────────────────────────────

export type BoxLetterShape = TLBaseShape<'boxletter', BasePlanProps>;

const BOXLETTER_FIELDS: FieldDef[] = [
    { key: 'height_mm', type: 'number', placeholder: '300' },
    { key: 'stroke_mm', type: 'number', placeholder: '60' },
    { key: 'depth_mm', type: 'number', placeholder: '80' },
    { key: 'count', type: 'number', placeholder: '6' },
    { key: 'nits_target', type: 'number', placeholder: '1500' },
    { key: 'module', type: 'select', options: ['tetra', 'opto', 'mini-strip'] },
    { key: 'volts', type: 'select', options: [12, 24] },
    { key: 'module_ma', type: 'number', placeholder: '90' },
    { key: 'module_lm', type: 'number', placeholder: '12' }
];

export class BoxLetterShapeUtil extends BaseBoxShapeUtil<BoxLetterShape> {
    static override type = 'boxletter' as const;
    override getDefaultProps(): BoxLetterShape['props'] {
        return {
            w: 380, h: 520,
            inputs: { height_mm: 300, stroke_mm: 60, depth_mm: 80, count: 6, nits_target: 1500, module: 'tetra', volts: 24 },
            status: 'idle', error: null, output: null
        };
    }
    override component(shape: BoxLetterShape) {
        return (
            <PlanCard
                accent="#ff9f0a"
                title="Box letter"
                icon="🔤"
                fields={BOXLETTER_FIELDS}
                shape={shape}
                editor={this.editor}
                renderSummary={(o: any) => (
                    <div style={summaryStyle}>
                        <strong>{o.modules_total} modules</strong>
                        <span> · PSU {o.psu_amps} A / {o.psu_watts} W</span>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            ≈ {o.estimated_nits} cd/m² · {o.modules_per_letter} per letter
                        </div>
                    </div>
                )}
            />
        );
    }
    override indicator(shape: BoxLetterShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
    }
}

const summaryStyle: React.CSSProperties = {
    background: 'var(--bg-1, #f4f4f5)',
    border: '1px solid var(--border, #ddd)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 12
};

// ─── Runners ────────────────────────────────────────────────────────────────

function registerSignageRunner(kind: string, endpoint: string, fields: FieldDef[]) {
    registerNodeRunner(kind, async ({ shape, signal }) => {
        const props = (shape as { props: BasePlanProps }).props;
        const payload: Record<string, unknown> = {};
        for (const field of fields) {
            const value = props.inputs?.[field.key];
            if (value === undefined || value === '') continue;
            const numeric = field.type === 'number' ||
                (field.type === 'select' && typeof field.options?.[0] === 'number');
            payload[field.key] = numeric ? Number(value) : value;
        }
        const res = await fetch(endpoint, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
            data,
            summary: (data.notes?.[0] as string) ?? `${kind} computed`
        };
    });
}

registerSignageRunner('lumigrid',   '/api/ai/signage/lumigrid', LUMIGRID_FIELDS);
registerSignageRunner('led-strip',  '/api/ai/signage/led-strip', STRIP_FIELDS);
registerSignageRunner('led-matrix', '/api/ai/signage/led-matrix', MATRIX_FIELDS);
registerSignageRunner('boxletter',  '/api/ai/signage/boxletter', BOXLETTER_FIELDS);
