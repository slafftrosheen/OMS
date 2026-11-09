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
    isRd?: boolean;
    rdNotes?: string;
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
const FRAMES_X = 1080;
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
                w: 480,
                h: 760,
                orderId: seed.orderId,
                title: seed.title ?? '',
                clientName: seed.clientName ?? '',
                poNumber: seed.poNumber ?? '',
                deadline: seed.deadline ?? '',
                loadingDate: seed.loadingDate ?? '',
                priority: seed.priority ?? 'NORMAL',
                notes: seed.notes ?? '',
                status: seed.status ?? 'draft',
                isRd: seed.isRd??false,rdNotes:seed.rdNotes??'',
            },
        });

        editor.createShape({
            id: addressId,
            type: 'order-address',
            x: LEFT_X+500,
            y: 0,
            isLocked: false,
            props: {
                w: 480,
                h: 640,
                orderId: seed.orderId,
                clientName:seed.clientName??'',
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
                    w: 1000,
                    h: 1200,
                    orderId: seed.orderId,
                    profileIndex: index,
                    quantity:profile.quantity??1,
                    data: JSON.parse(JSON.stringify(profile.configuration??{})),
                },
            });

            profileY += 1240;
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
    detailsId: TLShapeId | undefined,
    addressId: TLShapeId | undefined,
    data: Partial<OrderSeed>
) {
    const sync = (id: TLShapeId | undefined, type: string, fields: Array<keyof OrderSeed>) => {
        const shape = id ? editor.getShape(id) : undefined;
        if (!shape || shape.type !== type) return;
        const current = shape.props as Record<string, unknown>;
        if (data.orderId && current.orderId !== data.orderId) return;
        const patch = Object.fromEntries(fields
            .filter((key) => data[key] !== undefined && data[key] !== current[key])
            .map((key) => [key, data[key]]));
        if (Object.keys(patch).length) editor.updateShape({ id: shape.id, type, props: patch } as any);
    };
    editor.batch(() => {
        sync(detailsId, 'order-details', [
            'title', 'clientName', 'poNumber', 'deadline', 'loadingDate', 'priority', 'notes', 'status','isRd','rdNotes'
        ]);
        sync(addressId, 'order-address', [
            'clientName','deliveryAddress', 'deliveryContact', 'deliveryPhone', 'deliveryEmail', 'shippingMethod'
        ]);
        if(data.profiles&&data.orderId){
            const forms=editor.getCurrentPageShapes().filter(shape=>shape.type==='profile-7st'&&(shape.props as any).orderId===data.orderId);
            data.profiles.forEach((profile,index)=>{
                if(forms.some(shape=>(shape.props as any).profileIndex===index))return;
                editor.createShape({id:createShapeId(),type:'profile-7st',x:LEFT_X,y:800+1240*index,props:{w:1000,h:1200,orderId:data.orderId,profileIndex:index,quantity:profile.quantity??1,data:JSON.parse(JSON.stringify(profile.configuration??{}))}} as any);
            });
            for(const shape of forms){
                const index=(shape.props as any).profileIndex;
                const profile=data.profiles[index];
                if(!profile){editor.deleteShape(shape.id);continue;}
                const legacy=(shape.props as any).quantity===undefined;
                const configuration=JSON.parse(JSON.stringify(profile.configuration??{}));
                if(JSON.stringify((shape.props as any).data)!==JSON.stringify(configuration)||(shape.props as any).quantity!==(profile.quantity??1))
                    editor.updateShape({id:shape.id,type:shape.type,...(legacy?{y:800+1240*index}:{}),props:{data:configuration,quantity:profile.quantity??1,...(legacy?{w:1000,h:1200}:{})}} as any);
            }
        }

    });
}
