import type {Editor,TLTextShape} from '@tldraw/tldraw';
import {drawingTransaction} from './drawing-commands';
import {captureToolkitControls} from './toolkit-controls';
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
export function spaceDrawingSelection(editor:Editor,axis:'x'|'y',gap:number){
 if(!Number.isFinite(gap)||gap<0||gap>100000||!captureToolkitControls(editor).canEditSelection)return false;
 const shapes=editor.getSelectedShapes(),selected=new Set(shapes.map(s=>s.id));
 const hasSelectedAncestor=(shape:typeof shapes[number])=>{
  let parent=editor.getShape(shape.parentId as any);const seen=new Set<string>();
  while(parent&&!seen.has(parent.id)){if(selected.has(parent.id))return true;seen.add(parent.id);parent=editor.getShape(parent.parentId as any);}
  return false;
 };
 if(shapes.length<2||shapes.some(s=>FORM_WIDTHS[s.type]||s.type==='frame'||hasSelectedAncestor(s)))return false;
 const items=shapes.map(shape=>({shape,bounds:editor.getShapePageBounds(shape)}));if(items.some(i=>!i.bounds))return false;
 items.sort((a,b)=>a.bounds![axis]-b.bounds![axis]);
 const size=axis==='x'?'w':'h';let position=items[0].bounds![axis];
 const updates=items.map(({shape,bounds})=>{
  const point=editor.getShapePageTransform(shape).point();point[axis]+=position-bounds![axis];position+=bounds![size]+gap;
  const local=editor.getPointInParentSpace(shape,point);return {id:shape.id,type:shape.type,x:local.x,y:local.y};
 });
 if(updates.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)||Math.abs(s.x)>1000000||Math.abs(s.y)>1000000))return false;
 return drawingTransaction(editor,()=>editor.updateShapes(updates));
}
export function scaleCanvasForm(editor:Editor,id:string,percent:number){
 const shape=editor.getShape(id as any);if(!shape||!FORM_WIDTHS[shape.type]||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape)||!Number.isFinite(percent)||percent<10||percent>400)return false;
 const props=shape.props as {w:number;h:number},w=FORM_WIDTHS[shape.type]*percent/100;
 return drawingTransaction(editor,()=>editor.updateShape({id:shape.id,type:shape.type,props:{w,h:props.h*w/props.w}}));
}
