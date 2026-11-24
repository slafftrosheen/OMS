import React from 'react';
import {BaseBoxShapeUtil,type TLBaseShape} from '@tldraw/tldraw';
import {NativeDraftFields} from './NativeDraftFields';
import {readCadSettings} from '../../cad-settings';
import {defaultCanvasFormSize} from './form-layout';
export type OrderDetailsShapeProps = {
    w: number;
    h: number;
    orderId: string;
    isRd: boolean;
    rdNotes: string;
    title: string;
    clientName: string;
    poNumber: string;
    deadline: string;
    loadingDate: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    notes: string;
    status: string;
};

export type OrderDetailsShape = TLBaseShape<'order-details', OrderDetailsShapeProps>;


export class OrderDetailsShapeUtil extends BaseBoxShapeUtil<OrderDetailsShape>{
 static override type='order-details' as const;
 override isAspectRatioLocked=()=>true;
 override getDefaultProps():OrderDetailsShapeProps{return {...defaultCanvasFormSize('order-details',readCadSettings(this.editor))!,orderId:'',title:'',clientName:'',poNumber:'',deadline:'',loadingDate:'',priority:'NORMAL',notes:'',status:'draft',isRd:false,rdNotes:''};}
 override component(shape:OrderDetailsShape){return <NativeDraftFields shape={shape} editor={this.editor} section="details"/>;}
 override indicator(shape:OrderDetailsShape){return <rect width={shape.props.w} height={shape.props.h}/>;}
}
