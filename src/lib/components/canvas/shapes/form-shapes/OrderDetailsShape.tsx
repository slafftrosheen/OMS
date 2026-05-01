import React, { useCallback } from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';

export type OrderDetailsShapeProps = {
    w: number;
    h: number;
    orderId: string;
    title: string;
    clientName: string;
    poNumber: string;
    deadline: string;
    loadingDate: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    notes: string;
    status: string;
};

export type OrderDetailsShape = {
    id: string;
    type: 'order-details';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: OrderDetailsShapeProps;
};

const PRIORITY_COLORS: Record<string, string> = {
    LOW: '#34c759',
    NORMAL: '#007aff',
    HIGH: '#ff9500',
    URGENT: '#ff453a',
};

export class OrderDetailsShapeUtil extends BaseBoxShapeUtil<OrderDetailsShape> {
    static override type = 'order-details' as const;

    override getDefaultProps(): OrderDetailsShapeProps {
        return {
            w: 380,
            h: 420,
            orderId: '',
            title: '',
            clientName: '',
            poNumber: '',
            deadline: '',
            loadingDate: '',
            priority: 'NORMAL',
            notes: '',
            status: 'draft',
        };
    }

    override component(shape: OrderDetailsShape) {
        const { w, h, title, clientName, poNumber, deadline, loadingDate, priority, notes, status } = shape.props;

        const update = useCallback((patch: Partial<OrderDetailsShapeProps>) => {
            this.editor.updateShape<OrderDetailsShape>({
                id: shape.id,
                type: 'order-details',
                props: { ...shape.props, ...patch },
            });
            // Fire external callback if wired
            const cb = (window as any).__omsOrderChange;
            if (typeof cb === 'function') cb(shape.props.orderId, { ...shape.props, ...patch });
        }, [shape]);

        const stopProp = (e: React.PointerEvent) => e.stopPropagation();

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
                    border: '1px solid var(--glass-border, rgba(0,0,0,0.12))',
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
                    background: 'color-mix(in oklab, var(--brand, #e63329) 8%, transparent)',
                    borderBottom: '1px solid var(--glass-border, rgba(0,0,0,0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <div style={{ fontSize: 16 }}>📋</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text, #111)' }}>Order Details</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>{poNumber || 'New Order'}</div>
                    </div>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px',
                        borderRadius: 999, background: PRIORITY_COLORS[priority] + '22',
                        color: PRIORITY_COLORS[priority], textTransform: 'uppercase',
                    }}>{priority}</span>
                </div>

                {/* Fields */}
                <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                    <Field label="Title">
                        <input
                            type="text"
                            value={title}
                            onChange={e => update({ title: e.target.value })}
                            placeholder="Order title..."
                            style={inputStyle}
                        />
                    </Field>

                    <Field label="Client Name">
                        <input
                            type="text"
                            value={clientName}
                            onChange={e => update({ clientName: e.target.value })}
                            placeholder="Client name..."
                            style={inputStyle}
                        />
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Deadline">
                            <input
                                type="date"
                                value={deadline}
                                onChange={e => update({ deadline: e.target.value })}
                                style={inputStyle}
                            />
                        </Field>
                        <Field label="Loading Date">
                            <input
                                type="date"
                                value={loadingDate}
                                onChange={e => update({ loadingDate: e.target.value })}
                                style={inputStyle}
                            />
                        </Field>
                    </div>

                    <Field label="Priority">
                        <select
                            value={priority}
                            onChange={e => update({ priority: e.target.value as any })}
                            style={inputStyle}
                        >
                            {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Notes">
                        <textarea
                            value={notes}
                            onChange={e => update({ notes: e.target.value })}
                            placeholder="Additional notes..."
                            rows={3}
                            style={{ ...inputStyle, resize: 'none', height: 64 }}
                        />
                    </Field>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--glass-border, rgba(0,0,0,0.1))',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: 'var(--text-muted, #888)',
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: status === 'draft' ? '#ff9500' : status === 'approved' ? '#34c759' : '#888',
                        display: 'inline-block',
                    }} />
                    {status.toUpperCase()}
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: OrderDetailsShape) {
        return <rect width={shape.props.w} height={shape.props.h} rx={16} />;
    }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid var(--glass-border, rgba(0,0,0,0.15))',
    borderRadius: 8,
    background: 'var(--bg-0, rgba(255,255,255,0.6))',
    color: 'var(--text, #111)',
    fontSize: 12,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
};
