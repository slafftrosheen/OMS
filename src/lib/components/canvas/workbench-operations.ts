import type {Editor,TLTextShape} from '@tldraw/tldraw';
import {drawingTransaction} from './drawing-commands';
import {prepareArrangePlan,applyArrangePlan} from './drawing-arrange';
import {FORM_WIDTHS} from './shapes/form-shapes/form-layout';
export const TEXT_PIXELS={s:18,m:24,l:36,xl:44};
export function textPointSize(shape:TLTextShape){return TEXT_PIXELS[shape.props.size]*shape.props.scale*0.75;}
export function editDrawingText(editor:Editor,id:TLTextShape['id'],props:{text:string;font:TLTextShape['props']['font'];textAlign:TLTextShape['props']['textAlign'];autoSize:boolean;pointSize:number}){
 const shape=editor.getShape<TLTextShape>(id);
 if(!shape||shape.type!=='text'||editor.getOnlySelectedShape()?.id!==id||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape))return false;
 if(!Number.isFinite(props.pointSize)||props.pointSize<1||props.pointSize>3000||props.text.length>10000||!['draw','sans','serif','mono'].includes(props.font)||!['start','middle','end'].includes(props.textAlign))return false;
 const {pointSize,...rest}=props;
 return drawingTransaction(editor,()=>editor.updateShape({id,type:'text',props:{...rest,scale:pointSize/(TEXT_PIXELS[shape.props.size]*0.75)}}));
}
/** Compatibility entry point; shares precise bounds and protection with Arrange. */
export function spaceDrawingSelection(editor:Editor,axis:'x'|'y',gap:number){
 try{return applyArrangePlan(editor,prepareArrangePlan(editor,{kind:'space',axis,gap,anchor:'start'}));}catch{return false;}
}
export function scaleCanvasForm(editor:Editor,id:string,percent:number){
 const shape=editor.getShape(id as any);if(!shape||!FORM_WIDTHS[shape.type]||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape)||!Number.isFinite(percent)||percent<10||percent>400)return false;
 const props=shape.props as {w:number;h:number},w=FORM_WIDTHS[shape.type]*percent/100;
 return drawingTransaction(editor,()=>editor.updateShape({id:shape.id,type:shape.type,props:{w,h:props.h*w/props.w}}));
}
