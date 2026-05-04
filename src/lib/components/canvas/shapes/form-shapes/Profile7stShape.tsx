import React, { useCallback } from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';
import { getOrderBridge } from '../../state-bridge';

export type Profile7stData = {
    profileName: string;
    quantity: number;
    lineFreezer: {
        alu13: boolean;
        alu15: boolean;
        thickness: string;
        size: string;
        opalMaterial: string;
    };
    benderSides: {
        opalMaterial: string;
        frontMaterial: string;
        sidesMaterial: string;
        color: string;
        print: boolean;
    };
    painting: {
        frameType: string;
        backMaterial: string;
        color: string;
        noLed: boolean;
        print: boolean;
    };
    assembling: {
        ledType: string;
        waterproof: string[];
        frameOptions: string[];
        specialRequirements: string[];
    };
    delivery: {
        deliveryDate: string;
    };
};

export type Profile7stShapeProps = {
    w: number;
    h: number;
    orderId: string;
    profileIndex: number;
    data: Profile7stData;
};

export type Profile7stShape = {
    id: string;
    type: 'profile-7st';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: Profile7stShapeProps;
};

const MATERIAL_OPTIONS = ['OPAL', 'ALU 1.3', 'ALU 1.5', 'FRONT', 'SIDES', 'BACK'];
const FRAME_TYPES = ['NO FRAME', 'WITH FRAME', 'HALF FRAME', 'CUSTOM'];
const LED_TYPES = ['Bell LED', 'SLOAN', 'REGULAR', 'WARM WHITE'];
const WATERPROOF_OPTIONS = [{ id: 'ip65', label: 'IP65' }, { id: 'ip67', label: 'IP67' }, { id: 'outdoor', label: 'OUTDOOR' }];
const FRAME_OPTIONS = [{ id: 'trace', label: 'TRACE' }, { id: 'cable', label: 'CABLE' }];
const SPECIAL_REQS = [{ id: '9006_silver', label: '9006 SILVER' }, { id: 'distance', label: 'DISTANCE' }, { id: 'custom_mount', label: 'CUSTOM MOUNT' }];

const DEFAULT_DATA: Profile7stData = {
    profileName: 'Profile 7st',
    quantity: 1,
    lineFreezer: { alu13: false, alu15: false, thickness: '', size: '', opalMaterial: '' },
    benderSides: { opalMaterial: '', frontMaterial: '', sidesMaterial: '', color: '', print: false },
    painting: { frameType: '', backMaterial: '', color: '', noLed: false, print: false },
    assembling: { ledType: '', waterproof: [], frameOptions: [], specialRequirements: [] },
    delivery: { deliveryDate: '' },
};

export class Profile7stShapeUtil extends BaseBoxShapeUtil<Profile7stShape> {
    static override type = 'profile-7st' as const;

    override getDefaultProps(): Profile7stShapeProps {
        return { w: 380, h: 620, orderId: '', profileIndex: 0, data: { ...DEFAULT_DATA } };
    }

    override component(shape: Profile7stShape) {
        const { w, h, data, profileIndex } = shape.props;
        const d = { ...DEFAULT_DATA, ...data };

        const updateData = useCallback((patch: Partial<Profile7stData>) => {
            const newData = { ...d, ...patch };
            this.editor.updateShape<Profile7stShape>({
                id: shape.id,
                type: 'profile-7st',
                props: { ...shape.props, data: newData },
            });
            getOrderBridge(this.editor)?.onProfileChange?.(shape.props.orderId, profileIndex, newData);
        }, [shape, d]);

        const stopProp = (e: React.PointerEvent) => e.stopPropagation();

        const toggleCheckboxList = (section: keyof Pick<Profile7stData, 'assembling'>, field: 'waterproof' | 'frameOptions' | 'specialRequirements', id: string, checked: boolean) => {
            const current: string[] = (d.assembling as any)[field] || [];
            const next = checked ? [...current, id] : current.filter((x: string) => x !== id);
            updateData({ assembling: { ...d.assembling, [field]: next } });
        };

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: w,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--glass-bg, rgba(255,255,255,0.85))',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    border: '2px solid color-mix(in oklab, var(--brand, #e63329) 30%, transparent)',
                    borderRadius: '16px',
                    boxShadow: 'var(--glass-shadow, 0 8px 32px rgba(0,0,0,0.12))',
                    overflow: 'hidden',
                    pointerEvents: 'all',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
                onPointerDown={stopProp}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    background: 'color-mix(in oklab, var(--brand, #e63329) 10%, transparent)',
                    borderBottom: '1px solid var(--glass-border, rgba(0,0,0,0.1))',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <div style={{ fontSize: 16 }}>🔧</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text, #111)' }}>
                            Profile 7st #{profileIndex + 1}
                        </div>
                        <input
                            type="text"
                            value={d.profileName}
                            onChange={e => updateData({ profileName: e.target.value })}
                            placeholder="Profile name..."
                            style={{ ...inlineInputStyle, marginTop: 2 }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted, #888)' }}>QTY</span>
                        <input
                            type="number"
                            min={1}
                            value={d.quantity}
                            onChange={e => updateData({ quantity: parseInt(e.target.value) || 1 })}
                            style={{ ...inputStyle, width: 56, textAlign: 'center' }}
                        />
                    </div>
                </div>

                {/* Sections */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Line / Freezer */}
                    <Section title="Line / Freezer" color="#34c759">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <CheckboxField
                                label="ALU 1.3"
                                checked={d.lineFreezer.alu13}
                                onChange={v => updateData({ lineFreezer: { ...d.lineFreezer, alu13: v } })}
                            />
                            <CheckboxField
                                label="ALU 1.5"
                                checked={d.lineFreezer.alu15}
                                onChange={v => updateData({ lineFreezer: { ...d.lineFreezer, alu15: v } })}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <SmallField label="Thickness">
                                <input
                                    type="text"
                                    value={d.lineFreezer.thickness}
                                    onChange={e => updateData({ lineFreezer: { ...d.lineFreezer, thickness: e.target.value } })}
                                    placeholder="e.g. 3mm"
                                    style={inputStyle}
                                />
                            </SmallField>
                            <SmallField label="Size (mm)">
                                <input
                                    type="text"
                                    value={d.lineFreezer.size}
                                    onChange={e => updateData({ lineFreezer: { ...d.lineFreezer, size: e.target.value } })}
                                    placeholder="60"
                                    style={inputStyle}
                                />
                            </SmallField>
                        </div>
                        <SmallField label="OPAL Material">
                            <SelectField
                                value={d.lineFreezer.opalMaterial}
                                options={MATERIAL_OPTIONS}
                                onChange={v => updateData({ lineFreezer: { ...d.lineFreezer, opalMaterial: v } })}
                            />
                        </SmallField>
                    </Section>

                    {/* Bender / Sides */}
                    <Section title="Bender / Sides" color="#007aff">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                            <SmallField label="OPAL">
                                <SelectField value={d.benderSides.opalMaterial} options={MATERIAL_OPTIONS} onChange={v => updateData({ benderSides: { ...d.benderSides, opalMaterial: v } })} />
                            </SmallField>
                            <SmallField label="FRONT">
                                <SelectField value={d.benderSides.frontMaterial} options={MATERIAL_OPTIONS} onChange={v => updateData({ benderSides: { ...d.benderSides, frontMaterial: v } })} />
                            </SmallField>
                            <SmallField label="SIDES">
                                <SelectField value={d.benderSides.sidesMaterial} options={MATERIAL_OPTIONS} onChange={v => updateData({ benderSides: { ...d.benderSides, sidesMaterial: v } })} />
                            </SmallField>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <SmallField label="Color" style={{ flex: 1 }}>
                                <input type="text" value={d.benderSides.color} onChange={e => updateData({ benderSides: { ...d.benderSides, color: e.target.value } })} placeholder="RAL code..." style={inputStyle} />
                            </SmallField>
                            <CheckboxField label="PRINT" checked={d.benderSides.print} onChange={v => updateData({ benderSides: { ...d.benderSides, print: v } })} />
                        </div>
                    </Section>

                    {/* Painting */}
                    <Section title="Painting" color="#ff9500">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <SmallField label="Frame Type">
                                <SelectField value={d.painting.frameType} options={FRAME_TYPES} onChange={v => updateData({ painting: { ...d.painting, frameType: v } })} />
                            </SmallField>
                            <SmallField label="Back Material">
                                <SelectField value={d.painting.backMaterial} options={MATERIAL_OPTIONS} onChange={v => updateData({ painting: { ...d.painting, backMaterial: v } })} />
                            </SmallField>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <SmallField label="Color" style={{ flex: 1 }}>
                                <input type="text" value={d.painting.color} onChange={e => updateData({ painting: { ...d.painting, color: e.target.value } })} placeholder="RAL code..." style={inputStyle} />
                            </SmallField>
                            <CheckboxField label="NO LED" checked={d.painting.noLed} onChange={v => updateData({ painting: { ...d.painting, noLed: v } })} />
                            <CheckboxField label="PRINT" checked={d.painting.print} onChange={v => updateData({ painting: { ...d.painting, print: v } })} />
                        </div>
                    </Section>

                    {/* Assembling */}
                    <Section title="Assembling" color="#bf5af2">
                        <SmallField label="LED Type">
                            <SelectField value={d.assembling.ledType} options={LED_TYPES} onChange={v => updateData({ assembling: { ...d.assembling, ledType: v } })} />
                        </SmallField>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {WATERPROOF_OPTIONS.map(o => (
                                <CheckboxField
                                    key={o.id}
                                    label={o.label}
                                    checked={d.assembling.waterproof.includes(o.id)}
                                    onChange={v => toggleCheckboxList('assembling', 'waterproof', o.id, v)}
                                />
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {FRAME_OPTIONS.map(o => (
                                <CheckboxField
                                    key={o.id}
                                    label={o.label}
                                    checked={d.assembling.frameOptions.includes(o.id)}
                                    onChange={v => toggleCheckboxList('assembling', 'frameOptions', o.id, v)}
                                />
                            ))}
                            {SPECIAL_REQS.map(o => (
                                <CheckboxField
                                    key={o.id}
                                    label={o.label}
                                    checked={d.assembling.specialRequirements.includes(o.id)}
                                    onChange={v => toggleCheckboxList('assembling', 'specialRequirements', o.id, v)}
                                />
                            ))}
                        </div>
                    </Section>

                    {/* Delivery */}
                    <Section title="Delivery" color="#ff453a">
                        <SmallField label="Delivery Date">
                            <input
                                type="date"
                                value={d.delivery.deliveryDate}
                                onChange={e => updateData({ delivery: { deliveryDate: e.target.value } })}
                                style={inputStyle}
                            />
                        </SmallField>
                    </Section>
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: Profile7stShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={16} />;
    }
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    return (
        <div style={{
            border: `1px solid ${color}33`,
            borderRadius: 10,
            overflow: 'hidden',
        }}>
            <div style={{
                padding: '5px 10px',
                background: `${color}18`,
                fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color,
            }}>{title}</div>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {children}
            </div>
        </div>
    );
}

function SmallField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
            {children}
        </div>
    );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
            <span>{label}</span>
        </label>
    );
}

function SelectField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid var(--glass-border, rgba(0,0,0,0.15))',
    borderRadius: 6,
    background: 'var(--bg-0, rgba(255,255,255,0.6))',
    color: 'var(--text, #111)',
    fontSize: 11,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
};

const inlineInputStyle: React.CSSProperties = {
    ...inputStyle,
    padding: '2px 6px',
    fontSize: 11,
    background: 'transparent',
    border: '1px solid transparent',
};
