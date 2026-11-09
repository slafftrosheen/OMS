import React from 'react';
import {BaseBoxShapeUtil,type TLBaseShape} from '@tldraw/tldraw';
import {NativeDraftFields} from './NativeDraftFields';
export type OrderAddressShapeProps = {
    w: number;
    h: number;
    orderId: string;
    clientName: string;
    deliveryAddress: string;
    deliveryContact: string;
    deliveryPhone: string;
    deliveryEmail: string;
    shippingMethod: string;
};

export type OrderAddressShape = TLBaseShape<'order-address', OrderAddressShapeProps>;


export class OrderAddressShapeUtil extends BaseBoxShapeUtil<OrderAddressShape>{
 static override type='order-address' as const;
 override getDefaultProps():OrderAddressShapeProps{return {w:480,h:640,orderId:'',clientName:'',deliveryAddress:'',deliveryContact:'',deliveryPhone:'',deliveryEmail:'',shippingMethod:'courier'};}
 override component(shape:OrderAddressShape){return <NativeDraftFields shape={shape} editor={this.editor} section="delivery"/>;}
 override indicator(shape:OrderAddressShape){return <rect width={shape.props.w} height={shape.props.h}/>;}
}
