/**
 * DraftOrderTemplate — auto-spawns canvas shapes when a new draft order is initialized.
 *
 * The profile sheet is 6000 mm wide. Every template size and offset uses the
 * same document conversion; the form's HTML keeps its original design layout.
 */

import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { Box, Mat, createShapeId } from '@tldraw/tldraw';
import type {CanvasOrderAttachment} from '$lib/order/file-pockets';
import { CAD_MAX_COORDINATE, readCadSettings, validCadPoint } from '../cad-settings';
import { drawingTransaction } from '../drawing-commands';
import { defaultOrderCanvasScale, FORM_WIDTHS, ORDER_CANVAS_SCALE_META_KEY, readOrderCanvasScale } from '../shapes/form-shapes/form-layout';

export interface OrderSeed {
    attachments?: CanvasOrderAttachment[];
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
const FRAMES_X = 1880;
const FRAME_W = 800;
const FRAME_H = 500;
const FRAME_GAP = 40;

/**
 * Programmatically spawns the full order canvas from a seed object.
 * Call this once per order after the tldraw editor is mounted.
 */
export function spawnDraftOrderTemplate(editor: Editor, seed: OrderSeed): SpawnedShapes | null {
    if (editor.getInstanceState().isReadonly) return null;
    const detailsId = createShapeId();
    const addressId = createShapeId();
    const profileIds: TLShapeId[] = [];

    const laserFrameId = createShapeId();
    const cncFrameId = createShapeId();
    const benderFrameId = createShapeId();
    const visualsFrameId = createShapeId();

    const profiles = seed.profiles?.length ? seed.profiles : [{ name: 'Profile 7st', quantity: 1, configuration: {} }];
    if (editor.getCurrentPageShapeIds().size + profiles.length + 6 > editor.options.maxShapesPerPage) return null;
    const scale = defaultOrderCanvasScale(readCadSettings(editor));
    const meta = { [ORDER_CANVAS_SCALE_META_KEY]: scale };
    const shapes: Parameters<Editor['createShapes']>[0] = [];

    // ── Left rail: form shapes ──────────────────────────────────────────
    shapes.push({
        id: detailsId,
        type: 'order-details',
        x: LEFT_X * scale,
        y: 0,
        isLocked: false,
        meta,
        props: {
            w: 880 * scale,
            h: 460 * scale,
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

    shapes.push({
        id: addressId,
        type: 'order-address',
        x: (LEFT_X + 920) * scale,
        y: 0,
        isLocked: false,
        meta,
        props: {
            w: 880 * scale,
            h: 460 * scale,
            orderId: seed.orderId,
            clientName:seed.clientName??'',
            deliveryAddress: seed.deliveryAddress ?? '',
            deliveryContact: seed.deliveryContact ?? '',
            deliveryPhone: seed.deliveryPhone ?? '',
            deliveryEmail: seed.deliveryEmail ?? '',
            shippingMethod: seed.shippingMethod ?? 'courier',
        },
    });

    let profileY = 520;
    profiles.forEach((profile, index) => {
        const profileId = createShapeId();
        profileIds.push(profileId);

        shapes.push({
            id: profileId,
            type: 'profile-7st',
            x: LEFT_X * scale,
            y: profileY * scale,
            isLocked: false,
            meta,
            props: {
                w: 1800 * scale,
                h: 900 * scale,
                orderId: seed.orderId,
                profileIndex: index,
                quantity:profile.quantity??1,
                data: JSON.parse(JSON.stringify(profile.configuration??{})),
            },
        });

        profileY += 940;
    });

    // ── Right side: production zone frames ─────────────────────────────
    const frameLabels = [
        { id: laserFrameId, pocket: 'laser', label: 'Laser (DXF)', color: '#ff453a', y: 0 },
        { id: cncFrameId, pocket: 'cnc', label: 'CNC Routing', color: '#ff9500', y: FRAME_H + FRAME_GAP },
        { id: benderFrameId, pocket: 'bender', label: 'Bender', color: '#34c759', y: (FRAME_H + FRAME_GAP) * 2 },
        { id: visualsFrameId, pocket: 'visuals', label: 'Visuals (PDF/Rasters)', color: '#007aff', y: (FRAME_H + FRAME_GAP) * 3 },
    ];

    frameLabels.forEach(({ id, label, y, pocket }) => {
        shapes.push({
            id,
            type: 'frame',
            meta: { ...meta, omsFilePocket: pocket },
            x: FRAMES_X * scale,
            y: y * scale,
            props: {
                w: FRAME_W * scale,
                h: FRAME_H * scale,
                name: label,
            },
        });
    });
    for (const shape of shapes) shape.parentId = editor.getCurrentPageId();
    if (editor.getCurrentPageShapeIds().size + shapes.length > editor.options.maxShapesPerPage ||
        shapes.some(shape => !validTemplateBox(editor, shape))) return null;
    if (!drawingTransaction(editor, () => {
        editor.createShapes(shapes);
        for (const shape of shapes) {
            const saved = editor.getShape(shape.id!);
            if (!saved || saved.type !== shape.type || saved.x !== shape.x || saved.y !== shape.y || saved.parentId !== shape.parentId || !validTemplateBox(editor, saved) ||
                Object.entries(shape.props ?? {}).some(([key, value]) => JSON.stringify((saved.props as any)[key]) !== JSON.stringify(value)) ||
                Object.entries(shape.meta ?? {}).some(([key, value]) => saved.meta[key] !== value)) throw new Error('Template creation was not applied');
        }
    })) return null;

    // Fit the complete physical layout, including all production pockets.
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

function validTemplateBox(editor: Editor, shape: { x?: number; y?: number; rotation?: number; parentId?: string; props?: unknown }): boolean {
    const { w, h } = (shape.props ?? {}) as { w?: number; h?: number };
    const x = shape.x ?? 0, y = shape.y ?? 0, rotation = shape.rotation ?? 0;
    if (![x, y, w, h].every(value => Number.isFinite(value) && Math.abs(value!) <= CAD_MAX_COORDINATE) || w! <= 0 || h! <= 0 || !Number.isFinite(rotation)) return false;
    try {
        const local = Mat.Identity().translate(x, y).rotate(rotation);
        const parent = shape.parentId ? editor.getShape(shape.parentId as TLShapeId) : undefined;
        const transform = parent ? editor.getShapePageTransform(parent).clone().multiply(local) : local;
        return new Box(0, 0, w!, h!).corners.every(point => validCadPoint(transform.applyToPoint(point)));
    } catch { return false; }
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
    if (editor.getInstanceState().isReadonly) return;
    const sync = (id: TLShapeId | undefined, type: string, fields: Array<keyof OrderSeed>) => {
        const shape = id ? editor.getShape(id) : undefined;
        if (!shape || shape.type !== type || editor.isShapeOrAncestorLocked(shape)) return;
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
            const current: Array<any> = [...forms];
            const additions: Parameters<Editor['createShapes']>[0] = [];
            let safeAdditions = true;
            data.profiles.forEach((profile,index)=>{
                if(forms.some(shape=>(shape.props as any).profileIndex===index))return;
                // Continue the saved layout at its actual size; syncing an order
                // never recalibrates the page or moves/resizes existing artwork.
                const reference=current[0];
                const details=editor.getCurrentPageShapes().find(s=>s.type==='order-details'&&(s.props as any).orderId===data.orderId);
                const scale=reference?(reference.props as any).w/FORM_WIDTHS['profile-7st']:details?(details.props as any).w/FORM_WIDTHS['order-details']:defaultOrderCanvasScale(readCadSettings(editor));
                const layoutReference=reference??details;
                const physicalLayout=!layoutReference||layoutReference.meta[ORDER_CANVAS_SCALE_META_KEY]===readOrderCanvasScale(layoutReference);
                const parentId=reference?.parentId??details?.parentId??editor.getCurrentPageId();
                const parent=editor.getShape(parentId as TLShapeId);
                if(parent&&editor.isShapeOrAncestorLocked(parent))return;
                const siblings=current.filter(shape=>shape.parentId===parentId);
                const w=FORM_WIDTHS['profile-7st']*scale;
                const y=siblings.length?Math.max(...siblings.map(s=>s.y+(s.props as any).h))+(physicalLayout?40*scale:40):details?details.y+(details.props as any).h+(physicalLayout?60*scale:40):520*scale;
                const created={id:createShapeId(),type:'profile-7st',parentId,x:reference?.x??details?.x??LEFT_X*scale,y,
                    rotation:reference?.rotation??details?.rotation??0,meta:physicalLayout?{[ORDER_CANVAS_SCALE_META_KEY]:scale}:{},
                    props:{w,h:w/2,orderId:data.orderId,profileIndex:index,quantity:profile.quantity??1,data:JSON.parse(JSON.stringify(profile.configuration??{}))}};
                if(!validTemplateBox(editor,created))safeAdditions=false;
                additions.push(created);current.push(created);
            });
            // All missing profiles share one checked transaction. A refused or
            // adjusted creation cannot leave a partial stack on a saved order.
            if(safeAdditions&&additions.length&&editor.getCurrentPageShapeIds().size+additions.length<=editor.options.maxShapesPerPage){
                drawingTransaction(editor,()=>{
                    for(const planned of additions)editor.createShape(planned);
                    for(const planned of additions){
                        const saved=editor.getShape(planned.id!);
                        if(!saved||saved.type!==planned.type||saved.x!==planned.x||saved.y!==planned.y||saved.parentId!==planned.parentId||saved.rotation!==planned.rotation||!validTemplateBox(editor,saved)||
                            Object.entries(planned.props??{}).some(([key,value])=>JSON.stringify((saved.props as any)[key])!==JSON.stringify(value))||
                            Object.entries(planned.meta??{}).some(([key,value])=>saved.meta[key]!==value))throw new Error('Profile creation was not applied');
                    }
                });
            }
            for(const shape of forms){
                if(editor.isShapeOrAncestorLocked(shape))continue;
                const index=(shape.props as any).profileIndex;
                const profile=data.profiles[index];
                if(!profile){editor.deleteShape(shape.id);continue;}
                const configuration=JSON.parse(JSON.stringify(profile.configuration??{}));
                if(JSON.stringify((shape.props as any).data)!==JSON.stringify(configuration)||(shape.props as any).quantity!==(profile.quantity??1))
                    editor.updateShape({id:shape.id,type:shape.type,props:{data:configuration,quantity:profile.quantity??1}} as any);
            }
        }

    });
}
