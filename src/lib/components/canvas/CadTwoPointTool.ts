import { registerCanvasDraft } from './canvas-document';
import {StateNode,createShapeId,DefaultColorStyle,type TLEventHandlers,type TLShapeId} from '@tldraw/tldraw';
import {CAD_MAX_COORDINATE,validCadPoint,type CadPoint} from './cad-settings';
import {clearCadSnap,snapCadPoint} from './cad-snap';
import {tryNewCadOutlineMeta} from './drawing-outline-defaults';
import { dimensionCreationStyle, dimensionStyleForCreation, type DimensionCreationStyle } from './cad-dimension-defaults';
import { dimensionCreationInsideLimits, dimensionCreationMatches } from './cad-dimension-creation';

export function twoPointGeometry(kind:'circle'|'dimension',start:CadPoint,end:CadPoint,zoom=1,style?:DimensionCreationStyle|null){
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 if(!validCadPoint(start)||!validCadPoint(end)||!validCadPoint({x:dx,y:dy})||length<1e-6)return null;
 if(kind==='circle'){
  const corner={x:start.x-length,y:start.y-length};
  if(!validCadPoint(corner)||!validCadPoint({x:start.x+length,y:start.y+length})||!validCadPoint({x:length*2,y:length*2}))return null;
  return {type:'cad-ellipse' as const,...corner,props:{w:length*2,h:length*2}};
 }
 const annotation=style===undefined?dimensionStyleForCreation(zoom):style;
 return annotation?{type:'cad-dimension' as const,x:start.x,y:start.y,props:{endX:dx,endY:dy,...annotation}}:null;
}
class CadTwoPointTool extends StateNode{
 protected kind:'circle'|'dimension'='circle';
 private clearDraft: () => void = () => {};
 private start:CadPoint|null=null;
 private shapeId:TLShapeId|null=null;
 private mark:string|null=null;
 private pageId:string|null=null;
 override onEnter=()=>{this.clearDraft();this.clearDraft=registerCanvasDraft(this.editor,()=>this.shapeId?{id:this.shapeId,props:null}:null);clearCadSnap(this.editor);this.start=null;this.shapeId=null;this.mark=null;this.pageId=null;this.editor.selectNone();this.editor.setCursor({type:'cross',rotation:0});};
 private point(){
  const raw=this.editor.inputs.currentPagePoint;let point={x:raw.x,y:raw.y};
  if(this.start&&this.editor.inputs.shiftKey){clearCadSnap(this.editor);const dx=point.x-this.start.x,dy=point.y-this.start.y,angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);point={x:this.start.x+length*Math.cos(angle),y:this.start.y+length*Math.sin(angle)};}
  else point=snapCadPoint(this.editor,point,this.shapeId,this.kind==='dimension'?this.start:null);
  return point;
 }
 private preview(){
  if(!this.start||!this.shapeId)return false;
  if(this.pageId!==this.editor.getCurrentPageId()){this.cancel();return false;}
  const geometry=twoPointGeometry(this.kind,this.start,this.point(),this.editor.getZoomLevel(),this.kind==='dimension'?dimensionCreationStyle(this.editor):undefined);
  try {
   if(!geometry||geometry.type==='cad-dimension'&&!dimensionCreationInsideLimits(this.editor,geometry)){
    if(this.editor.getShape(this.shapeId))this.editor.deleteShapes([this.shapeId]);
    if(this.editor.getShape(this.shapeId))throw new Error('Dimension preview removal was refused');
    return false;
   }
   const previous=this.editor.getShape(this.shapeId);
   const meta=this.kind==='circle'?(previous?.meta??tryNewCadOutlineMeta(this.editor)):undefined;
   if(meta===null)return false;
   const requested={id:this.shapeId,parentId:this.editor.getCurrentPageId(),...geometry,props:{...geometry.props,color:this.editor.getStyleForNextShape(DefaultColorStyle)},...(meta?{meta}:{})};
   if(previous)this.editor.updateShape(requested);
   else this.editor.createShape(requested);
   if(geometry.type==='cad-dimension'&&!dimensionCreationMatches(this.editor,{...requested,type:'cad-dimension',props:{...geometry.props,color:requested.props.color}}))
    throw new Error('Dimension preview was refused or changed');
   if(geometry.type==='cad-ellipse'){
    const actual=this.editor.getShape(this.shapeId);
    if(!actual||actual.type!==geometry.type||actual.parentId!==requested.parentId||actual.rotation!==0||actual.x!==requested.x||actual.y!==requested.y||
     Object.entries(requested.props).some(([key,value])=>(actual.props as Record<string,unknown>)[key]!==value)||JSON.stringify(actual.meta)!==JSON.stringify(meta))
     throw new Error('Circle preview was refused or changed');
    const bounds=this.editor.getShapePageBounds(actual);
    if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(value=>Number.isFinite(value)&&Math.abs(value)<=CAD_MAX_COORDINATE))
     throw new Error('Circle preview exceeds drawing bounds');
   }
   return !!this.editor.getShape(this.shapeId);
  } catch {this.cancel();return false;}
 }
 override onPointerDown:TLEventHandlers['onPointerDown']=info=>{
  if(info.button!==0)return;
  if(this.editor.getInstanceState().isReadonly){this.cancel();return;}
  if(this.start){if(this.preview())this.finish();return;}
  const point=this.point();if(!validCadPoint(point)||this.editor.getCurrentPageShapeIds().size>=this.editor.options.maxShapesPerPage)return;
  this.start=point;this.shapeId=createShapeId();this.pageId=this.editor.getCurrentPageId();this.mark=`cad-two-point-${this.shapeId}`;this.editor.mark(this.mark);
 };
 override onPointerMove=()=>{if(this.editor.getInstanceState().isReadonly)this.cancel();else if(this.start)this.preview();else this.point();};
 override onKeyDown:TLEventHandlers['onKeyDown']=info=>{if(this.editor.getInstanceState().isReadonly){this.cancel();return;}if(info.key==='Escape')this.cancel();else if(info.key==='Enter'&&this.preview())this.finish();};
 override onCancel=()=>this.cancel();
 override onComplete=()=>this.cancel();
 override onInterrupt=()=>this.cancel();
 override onExit=()=>this.cancel(false);
 private finish(){this.clearDraft();clearCadSnap(this.editor);const id=this.shapeId,mark=this.mark;this.shapeId=null;this.start=null;this.mark=null;this.pageId=null;this.editor.setCurrentTool('select');if(id)this.editor.setSelectedShapes([id]);if(mark)this.editor.mark(mark+'-complete');}
 private cancel(select=true){this.clearDraft();clearCadSnap(this.editor);const mark=this.mark;this.mark=null;this.shapeId=null;this.start=null;this.pageId=null;if(mark)this.editor.bailToMark(mark);if(select)this.editor.setCurrentTool('select');}
}
export class CadCircleTool extends CadTwoPointTool{static override id='cad-circle';protected override kind='circle' as const;}
export class CadDimensionTool extends CadTwoPointTool{static override id='cad-dimension';protected override kind='dimension' as const;}
