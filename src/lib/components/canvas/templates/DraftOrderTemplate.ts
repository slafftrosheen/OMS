/**
 * DraftOrderTemplate — auto-spawns canvas shapes when a new draft order is initialized.
 *
 * Spawns:
 *   Phase 5: OrderDetailsShape [x:0, y:0], OrderAddressShape [x:0, y:440],
 *            Profile7stShape [x:0, y:800] — pinned to left rail.
 *   Phase 6: Production-zone frames: Laser (DXF), CNC Routing, Bender, Visuals (PDF/Rasters).
 */

import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { createShapeId } from '@tldraw/tldraw';

export interface OrderSeed {
    orderId: string;
    title?: string;
    clientName?: string;
    poNumber?: string;
    deadline?: string;
    loadingDate?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    notes?: string;
    status?: string;
    deliveryAddress?: string;
    deliveryContact?: string;
    deliveryPhone?: string;
    deliveryEmail?: string;
    shippingMethod?: string;
    profiles?: Array<{
        name?: string;
        quantity?: number;
        configuration?: any;
    }>;
}

export interface SpawnedShapes {
    detailsId: TLShapeId;
    addressId: TLShapeId;
    profileIds: TLShapeId[];
    frameIds: {
        laser: TLShapeId;
        cnc: TLShapeId;
        bender: TLShapeId;
        visuals: TLShapeId;
    };
}

/** Column origin for the forms panel (left rail). */
const LEFT_X = 24;
/** Column origin for the production frames (right side). */
const FRAMES_X = 460;
const FRAME_W = 700;
const FRAME_H = 500;
const FRAME_GAP = 40;

/**
 * Programmatically spawns the full order canvas from a seed object.
 * Call this once per order after the tldraw editor is mounted.
 */
export function spawnDraftOrderTemplate(editor: Editor, seed: OrderSeed): SpawnedShapes {
    const detailsId = createShapeId();
    const addressId = createShapeId();
    const profileIds: TLShapeId[] = [];

    const laserFrameId = createShapeId();
    const cncFrameId = createShapeId();
    const benderFrameId = createShapeId();
    const visualsFrameId = createShapeId();

    const profiles = seed.profiles?.length ? seed.profiles : [{ name: 'Profile 7st', quantity: 1, configuration: {} }];

    editor.batch(() => {
        // ── Left rail: form shapes ──────────────────────────────────────────
        editor.createShape({
            id: detailsId,
            type: 'order-details',
            x: LEFT_X,
            y: 0,
            isLocked: false,
            props: {
                w: 380,
                h: 420,
                orderId: seed.orderId,
                title: seed.title ?? '',
                clientName: seed.clientName ?? '',
                poNumber: seed.poNumber ?? '',
                deadline: seed.deadline ?? '',
                loadingDate: seed.loadingDate ?? '',
                priority: seed.priority ?? 'NORMAL',
                notes: seed.notes ?? '',
                status: seed.status ?? 'draft',
            },
        });

        editor.createShape({
            id: addressId,
            type: 'order-address',
            x: LEFT_X,
            y: 440,
            isLocked: false,
            props: {
                w: 380,
                h: 340,
                orderId: seed.orderId,
                deliveryAddress: seed.deliveryAddress ?? '',
                deliveryContact: seed.deliveryContact ?? '',
                deliveryPhone: seed.deliveryPhone ?? '',
                deliveryEmail: seed.deliveryEmail ?? '',
                shippingMethod: seed.shippingMethod ?? 'courier',
            },
        });

        let profileY = 800;
        profiles.forEach((profile, index) => {
            const profileId = createShapeId();
            profileIds.push(profileId);

            editor.createShape({
                id: profileId,
                type: 'profile-7st',
                x: LEFT_X,
                y: profileY,
                isLocked: false,
                props: {
                    w: 380,
                    h: 620,
                    orderId: seed.orderId,
                    profileIndex: index,
                    data: {
                        profileName: profile.name ?? `Profile ${index + 1}`,
                        quantity: profile.quantity ?? 1,
                        lineFreezer: profile.configuration?.lineFreezer ?? {
                            alu13: false, alu15: false, thickness: '', size: '', opalMaterial: '',
                        },
                        benderSides: profile.configuration?.benderSides ?? {
                            opalMaterial: '', frontMaterial: '', sidesMaterial: '', color: '', print: false,
                        },
                        painting: profile.configuration?.painting ?? {
                            frameType: '', backMaterial: '', color: '', noLed: false, print: false,
                        },
                        assembling: profile.configuration?.assembling ?? {
                            ledType: '', waterproof: [], frameOptions: [], specialRequirements: [],
                        },
                        delivery: profile.configuration?.delivery ?? { deliveryDate: '' },
                    },
                },
            });

            profileY += 640;
        });

        // ── Right side: production zone frames ─────────────────────────────
        const frameLabels = [
            { id: laserFrameId, label: 'Laser (DXF)', color: '#ff453a', y: 0 },
            { id: cncFrameId, label: 'CNC Routing', color: '#ff9500', y: FRAME_H + FRAME_GAP },
            { id: benderFrameId, label: 'Bender', color: '#34c759', y: (FRAME_H + FRAME_GAP) * 2 },
            { id: visualsFrameId, label: 'Visuals (PDF/Rasters)', color: '#007aff', y: (FRAME_H + FRAME_GAP) * 3 },
        ];

        frameLabels.forEach(({ id, label, y }) => {
            editor.createShape({
                id,
                type: 'frame',
                x: FRAMES_X,
                y,
                props: {
                    w: FRAME_W,
                    h: FRAME_H,
                    name: label,
                },
            });
        });
    });

    // Zoom to fit the left rail + first frame
    editor.zoomToFit({ animation: { duration: 400 } });

    return {
        detailsId,
        addressId,
        profileIds,
        frameIds: {
            laser: laserFrameId,
            cnc: cncFrameId,
            bender: benderFrameId,
            visuals: visualsFrameId,
        },
    };
}

/**
 * Sync live Svelte store data into existing canvas shapes without re-spawning.
 * Call this when the Svelte store is updated externally.
 */
export function syncOrderDataToCanvas(
    editor: Editor,
    detailsId: TLShapeId,
    addressId: TLShapeId,
    data: Partial<OrderSeed>
) {
    editor.batch(() => {
        editor.updateShape({
            id: detailsId,
            type: 'order-details',
            props: {
                title: data.title,
                clientName: data.clientName,
                deadline: data.deadline,
                loadingDate: data.loadingDate,
                priority: data.priority,
                notes: data.notes,
                status: data.status,
            },
        });

        editor.updateShape({
            id: addressId,
            type: 'order-address',
            props: {
                deliveryAddress: data.deliveryAddress,
                deliveryContact: data.deliveryContact,
                deliveryPhone: data.deliveryPhone,
            },
        });
    });
}
