import {drawingFontPatch} from './drawing-fonts';
import {Box,type Editor,type TLTextShape,type TLShape} from '@tldraw/tldraw';
import {drawingTransaction} from './drawing-commands';
import {prepareArrangePlan,applyArrangePlan} from './drawing-arrange';
import {FORM_WIDTHS,defaultCanvasFormSize} from './shapes/form-shapes/form-layout';
import {CAD_MAX_COORDINATE,readCadSettings,validCadPoint} from './cad-settings';
import {drawingTextSpacingMeta,validDrawingTextSpacing,type DrawingTextSpacing} from './drawing-text-spacing';
import {canFormatDrawingText,canKeepDrawingTextBounds,canKeepDrawingTextWidth,drawingTextFixedWidthAtScale,drawingTextPageBounds,MIN_DRAWING_TEXT_LAYOUT_WIDTH,reportDrawingTextBounds,withDrawingTextFormatting} from './drawing-text-formatting';
import {drawingTextScaleForPointSize} from './drawing-text-size';
export {TEXT_PIXELS,textPointSize} from './drawing-text-size';
export function editDrawingText(editor:Editor,id:TLTextShape['id'],props:{text:string;font:string;textAlign:TLTextShape['props']['textAlign'];autoSize:boolean;pointSize?:number}&Partial<DrawingTextSpacing>){
 const shape=editor.getShape<TLTextShape>(id);
 if(!shape||shape.type!=='text'||editor.getOnlySelectedShape()?.id!==id||!canFormatDrawingText(editor)||editor.isShapeOrAncestorLocked(shape))return false;
 if(props.pointSize!==undefined&&(!Number.isFinite(props.pointSize)||props.pointSize<1||props.pointSize>3000)||typeof props.text!=='string'||props.text.length>10000||typeof props.autoSize!=='boolean'||!['start','middle','end'].includes(props.textAlign)||!validDrawingTextSpacing(props))return false;
 const {pointSize,font,letterSpacing,lineHeight,...rest}=props;
 try {
 const patch=drawingFontPatch(editor,{...shape,props:{...shape.props,text:props.text}},font);
 const spacing:Partial<DrawingTextSpacing>={};
 if(letterSpacing!==undefined)spacing.letterSpacing=letterSpacing;
 if(lineHeight!==undefined)spacing.lineHeight=lineHeight;
 const meta=Object.keys(spacing).length?drawingTextSpacingMeta({meta:patch.meta},spacing):patch.meta;
 const scale=pointSize===undefined?shape.props.scale:drawingTextScaleForPointSize(shape.props.size,pointSize,readCadSettings(editor));
 const width=!props.autoSize&&(scale!==shape.props.scale||shape.props.autoSize)?drawingTextFixedWidthAtScale(editor,shape,scale):undefined;
 if(width!==undefined&&!canKeepDrawingTextWidth(width))return false;
 const nextProps={...rest,...patch.props,scale,...(width!==undefined?{w:Math.max(MIN_DRAWING_TEXT_LAYOUT_WIDTH,width)}:{})};
 if(Object.entries(nextProps).every(([key,value])=>shape.props[key as keyof TLTextShape['props']]===value)&&JSON.stringify(meta)===JSON.stringify(shape.meta))return true;
 const previousBounds=drawingTextPageBounds(editor,shape);
 return drawingTransaction(editor,()=>{
  withDrawingTextFormatting(editor,()=>editor.updateShape({id,type:'text',meta,props:nextProps}));
  const applied=editor.getShape<TLTextShape>(id);
  if(!applied||Object.entries(nextProps).some(([key,value])=>applied.props[key as keyof TLTextShape['props']]!==value)||JSON.stringify(applied.meta)!==JSON.stringify(meta))throw new Error('Text changes were not applied');
  if(!canKeepDrawingTextBounds(drawingTextPageBounds(editor,applied),previousBounds)){reportDrawingTextBounds(editor);throw new Error('Text exceeds canvas limits');}
 });
 } catch {return false;}
}
/** Compatibility entry point; shares precise bounds and protection with Arrange. */
export function spaceDrawingSelection(editor:Editor,axis:'x'|'y',gap:number){
 try{return applyArrangePlan(editor,prepareArrangePlan(editor,{kind:'space',axis,gap,anchor:'start'}));}catch{return false;}
}
export function scaleCanvasForm(editor:Editor,id:string,percent:number){
 const shape=editor.getShape(id as any);if(!shape||!FORM_WIDTHS[shape.type]||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape)||!Number.isFinite(percent)||percent<10||percent>400)return false;
 const settings=readCadSettings(editor),baseline=settings?defaultCanvasFormSize(shape.type,settings)!.w:FORM_WIDTHS[shape.type];
 const props=shape.props as {w:number;h:number},w=baseline*percent/100,h=props.h*w/props.w;
 if(![props.w,props.h,w,h].every(value=>Number.isFinite(value)&&value>0)||Math.max(w,h)>CAD_MAX_COORDINATE||!formInsidePageLimits(editor,shape,w,h))return false;
 if(w===props.w&&h===props.h)return true;
 return drawingTransaction(editor,()=>{
  editor.updateShape({id:shape.id,type:shape.type,props:{w,h}});
  const applied=editor.getShape(shape.id),size=applied?.props as {w?:number;h?:number}|undefined;
  if(!applied||size?.w!==w||size?.h!==h||applied.x!==shape.x||applied.y!==shape.y||applied.rotation!==shape.rotation||applied.parentId!==shape.parentId||!formInsidePageLimits(editor,applied,w,h))throw new Error('Form scale was not applied');
 });
}

function formInsidePageLimits(editor:Editor,shape:TLShape,w:number,h:number):boolean{
 try{
  const transform=editor.getShapePageTransform(shape);
  return new Box(0,0,w,h).corners.every(point=>validCadPoint(transform.applyToPoint(point)));
 }catch{return false;}
}
