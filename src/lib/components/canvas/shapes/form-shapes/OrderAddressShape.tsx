import React, { useCallback } from 'react';
import { BaseBoxShapeUtil, HTMLContainer } from '@tldraw/tldraw';
import { getOrderBridge } from '../../state-bridge';

export type OrderAddressShapeProps = {
    w: number;
    h: number;
    orderId: string;
    deliveryAddress: string;
    deliveryContact: string;
    deliveryPhone: string;
    deliveryEmail: string;
    shippingMethod: string;
};

export type OrderAddressShape = {
    id: string;
    type: 'order-address';
    x: number;
    y: number;
    rotation: number;
    isLocked: boolean;
    opacity: number;
    meta: {};
    props: OrderAddressShapeProps;
};

export class OrderAddressShapeUtil extends BaseBoxShapeUtil<OrderAddressShape> {
    static override type = 'order-address' as const;

    override getDefaultProps(): OrderAddressShapeProps {
        return {
            w: 380,
            h: 340,
            orderId: '',
            deliveryAddress: '',
            deliveryContact: '',
            deliveryPhone: '',
            deliveryEmail: '',
            shippingMethod: 'courier',
        };
    }

    override component(shape: OrderAddressShape) {
        const { w, h, deliveryAddress, deliveryContact, deliveryPhone, deliveryEmail, shippingMethod } = shape.props;

        const update = useCallback((patch: Partial<OrderAddressShapeProps>) => {
            this.editor.updateShape<OrderAddressShape>({
                id: shape.id,
                type: 'order-address',
                props: { ...shape.props, ...patch },
            });
            getOrderBridge(this.editor)?.onOrderChange?.(shape.props.orderId, { ...shape.props, ...patch });
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
                    background: 'color-mix(in oklab, #007aff 8%, transparent)',
                    borderBottom: '1px solid var(--glass-border, rgba(0,0,0,0.1))',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <div style={{ fontSize: 16 }}>📍</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text, #111)' }}>Delivery Address</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginTop: 1 }}>Shipping & Contact Info</div>
                    </div>
                </div>

                <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                    <Field label="Full Delivery Address">
                        <textarea
                            value={deliveryAddress}
                            onChange={e => update({ deliveryAddress: e.target.value })}
                            placeholder="Street, City, Postal Code, Country..."
                            rows={3}
                            style={{ ...inputStyle, resize: 'none', height: 72 }}
                        />
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Contact Person">
                            <input
                                type="text"
                                value={deliveryContact}
                                onChange={e => update({ deliveryContact: e.target.value })}
                                placeholder="Full name..."
                                style={inputStyle}
                            />
                        </Field>
                        <Field label="Phone">
                            <input
                                type="tel"
                                value={deliveryPhone}
                                onChange={e => update({ deliveryPhone: e.target.value })}
                                placeholder="+371 XXXXXXXX"
                                style={inputStyle}
                            />
                        </Field>
                    </div>

                    <Field label="Email">
                        <input
                            type="email"
                            value={deliveryEmail}
                            onChange={e => update({ deliveryEmail: e.target.value })}
                            placeholder="delivery@client.com"
                            style={inputStyle}
                        />
                    </Field>

                    <Field label="Shipping Method">
                        <select
                            value={shippingMethod}
                            onChange={e => update({ shippingMethod: e.target.value })}
                            style={inputStyle}
                        >
                            <option value="courier">Courier</option>
                            <option value="pickup">Client Pickup</option>
                            <option value="own-transport">Own Transport</option>
                            <option value="freight">Freight / LTL</option>
                        </select>
                    </Field>
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: OrderAddressShape) {
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
