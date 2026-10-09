// Four signage-domain calculator shapes, sharing the same input-form +
// notes/warnings render. Each posts to the matching `/api/ai/signage/*`
// endpoint and exposes `output` so downstream nodes (chat, document) can
// pick up the calculation summary.

import React, { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';
import { registerNodeRunner } from '../node-runner';
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
    label: string;
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
    endpoint: string;
    editor: { updateShape: (s: any) => void };
    /** Renders a result summary block next to the notes/warnings list. */
    renderSummary?: (output: NonNullable<T['output']>) => React.ReactNode;
}) {
    const { accent, title, icon, fields, shape, endpoint, editor, renderSummary } = props;
    const { w, h, inputs, status, error, output } = shape.props;
    const [draft, setDraft] = useState<Record<string, any>>({ ...inputs });
    const stop = (e: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) =>
        e.stopPropagation();

    const update = (patch: Partial<T>) => {
        editor.updateShape({
            id: shape.id,
            type: shape.type,
            props: { ...shape.props, ...patch }
        });
    };

    const run = async () => {
        if (status === 'running') return;
        update({
            inputs: draft,
            status: 'running',
            error: null
        } as any);
        try {
            // Coerce numeric strings → number before posting.
            const payload: Record<string, unknown> = {};
            for (const f of fields) {
                const v = draft[f.key];
                if (v === undefined || v === '') continue;
                payload[f.key] = f.type === 'number' ? Number(v) : v;
            }
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
            const data = await res.json();
            update({ status: 'done', output: data } as any);
        } catch (err) {
            update({ status: 'error', error: (err as Error).message } as any);
        }
    };

    return (
        <HTMLContainer id={shape.id} style={containerStyle(w, h, accent, status === 'error')}>
            <div style={headerStyle(accent)}>
                <span>{icon} {title}</span>
                <span style={statusBadgeStyle(status)}>{status}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: 8, gap: 4 }} onPointerDown={stop}>
                {fields.map((f) => (
                    <div key={f.key} style={rowStyle}>
                        <label style={labelStyle}>{f.label}</label>
                        {f.type === 'checkbox' ? (
                            <input
                                type="checkbox"
                                checked={!!draft[f.key]}
                                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })}
                            />
                        ) : f.type === 'select' ? (
                            <select
                                value={String(draft[f.key] ?? '')}
                                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
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
                                value={draft[f.key] ?? ''}
                                placeholder={f.placeholder}
                                onChange={(e) =>
                                    setDraft({ ...draft, [f.key]: f.type === 'number'
                                        ? (e.target.value === '' ? '' : parseFloat(e.target.value))
                                        : e.target.value })
                                }
                                onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                        )}
                    </div>
                ))}
                <button onClick={run} disabled={status === 'running'} style={{ ...runButtonStyle(accent), alignSelf: 'flex-end' }}>
                    {status === 'running' ? 'Calculating…' : 'Compute'}
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
    { key: 'channels', label: 'PWM outputs used (0–8)', type: 'number', placeholder: '4' },
    { key: 'channel_ma', label: 'mA per PWM load', type: 'number', placeholder: '350' },
    { key: 'volts', label: 'PWM supply (V)', type: 'select', options: [12, 24] },
    { key: 'addressable_lanes', label: 'RMT lanes used (0–8)', type: 'number', placeholder: '0' },
    { key: 'pixels_per_lane', label: 'Pixels per RMT lane (≤256)', type: 'number', placeholder: '0' },
    { key: 'pixel_ma', label: 'mA per pixel at full brightness', type: 'number', placeholder: '0' },
    { key: 'pixel_volts', label: 'Pixel supply (V)', type: 'select', options: [5, 12, 24] },
    { key: 'pwm_hz', label: 'Requested PWM Hz (verify firmware)', type: 'number', placeholder: '24000' },
    { key: 'pwm_bits', label: 'Configured PWM bits (verify)', type: 'number', placeholder: '16' },
    { key: 'gamma', label: 'Gamma', type: 'number', placeholder: '2.2' },
    { key: 'camera_safe', label: 'Camera flicker warning', type: 'checkbox' }
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
                endpoint="/api/ai/signage/lumigrid"
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
    { key: 'length_m', label: 'Length (m)', type: 'number', placeholder: '5' },
    { key: 'volts', label: 'Volts', type: 'select', options: [5, 12, 24] },
    { key: 'leds_per_m', label: 'LEDs/m', type: 'number', placeholder: '60' },
    { key: 'ma_per_led', label: 'mA / LED', type: 'number', placeholder: '60' },
    { key: 'wire_mm2', label: 'Wire mm²', type: 'number', placeholder: '4' },
    { key: 'fps', label: 'Target fps', type: 'number', placeholder: '60' }
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
                endpoint="/api/ai/signage/led-strip"
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
    { key: 'pitch_mm', label: 'Pitch mm', type: 'number', placeholder: '4' },
    { key: 'width_mm', label: 'Width mm', type: 'number', placeholder: '1920' },
    { key: 'height_mm', label: 'Height mm', type: 'number', placeholder: '1080' },
    { key: 'refresh_hz', label: 'Refresh Hz', type: 'number', placeholder: '60' },
    { key: 'scan', label: 'Scan 1/n', type: 'number', placeholder: '16' },
    { key: 'ma_per_pixel', label: 'mA / pixel', type: 'number', placeholder: '18' }
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
                endpoint="/api/ai/signage/led-matrix"
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
    { key: 'height_mm', label: 'Cap height mm', type: 'number', placeholder: '300' },
    { key: 'stroke_mm', label: 'Stroke mm', type: 'number', placeholder: '60' },
    { key: 'depth_mm', label: 'Depth mm', type: 'number', placeholder: '80' },
    { key: 'count', label: 'Letter count', type: 'number', placeholder: '6' },
    { key: 'nits_target', label: 'Target cd/m²', type: 'number', placeholder: '1500' },
    { key: 'module', label: 'Module', type: 'select', options: ['tetra', 'opto', 'mini-strip'] },
    { key: 'volts', label: 'Volts', type: 'select', options: [12, 24] },
    { key: 'module_ma', label: 'mA/module', type: 'number', placeholder: '90' },
    { key: 'module_lm', label: 'lm/module', type: 'number', placeholder: '12' }
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
                endpoint="/api/ai/signage/boxletter"
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

function makeRunner(endpoint: string, label: string) {
    return registerNodeRunner.bind(null, label) as (
        runner: (ctx: any) => Promise<any>
    ) => void;
}

const _registerSignageRunner = (kind: string, endpoint: string) => {
    registerNodeRunner(kind, async ({ shape }) => {
        const props = (shape as { props: BasePlanProps }).props;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(props.inputs ?? {})
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return {
            data,
            summary: (data.notes?.[0] as string) ?? `${kind} computed`
        };
    });
};

_registerSignageRunner('lumigrid',   '/api/ai/signage/lumigrid');
_registerSignageRunner('led-strip',  '/api/ai/signage/led-strip');
_registerSignageRunner('led-matrix', '/api/ai/signage/led-matrix');
_registerSignageRunner('boxletter',  '/api/ai/signage/boxletter');

// `makeRunner` retained for future per-shape extension; suppress unused-warn.
void makeRunner;
