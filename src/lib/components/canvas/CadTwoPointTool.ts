import {StateNode,createShapeId,DefaultColorStyle,type TLEventHandlers,type TLShapeId} from '@tldraw/tldraw';
import {validCadPoint,type CadPoint} from './cad-settings';
import {snapCadPoint} from './cad-snap';

export function twoPointGeometry(kind:'circle'|'dimension',start:CadPoint,end:CadPoint,zoom=1){
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 if(!validCadPoint(start)||!validCadPoint(end)||!validCadPoint({x:dx,y:dy})||length<1e-6)return null;
 if(kind==='circle'){
  const corner={x:start.x-length,y:start.y-length};
  if(!validCadPoint(corner)||!validCadPoint({x:length*2,y:length*2}))return null;
  return {type:'cad-ellipse',...corner,props:{w:length*2,h:length*2}};
 }
 return {type:'cad-dimension',x:start.x,y:start.y,props:{endX:dx,endY:dy,offset:30/zoom,decorationScale:1/zoom}};
}
class CadTwoPointTool extends StateNode{
 protected kind:'circle'|'dimension'='circle';
 private start:CadPoint|null=null;
 private shapeId:TLShapeId|null=null;
 private mark:string|null=null;
 override onEnter=()=>{this.start=null;this.shapeId=null;this.mark=null;this.editor.selectNone();this.editor.setCursor({type:'cross',rotation:0});};
 private point(){
  const raw=this.editor.inputs.currentPagePoint;let point={x:raw.x,y:raw.y};
  if(this.start&&this.editor.inputs.shiftKey){const dx=point.x-this.start.x,dy=point.y-this.start.y,angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);point={x:this.start.x+length*Math.cos(angle),y:this.start.y+length*Math.sin(angle)};}
  else point=snapCadPoint(this.editor,point,this.shapeId);
  return point;
 }
 private preview(){
  if(!this.start||!this.shapeId)return false;
  const geometry=twoPointGeometry(this.kind,this.start,this.point(),this.editor.getZoomLevel());if(!geometry)return false;
  if(this.editor.getShape(this.shapeId))this.editor.updateShape({id:this.shapeId,...geometry});
  else this.editor.createShape({id:this.shapeId,parentId:this.editor.getCurrentPageId(),...geometry,props:{...geometry.props,color:this.editor.getStyleForNextShape(DefaultColorStyle)}});
  return !!this.editor.getShape(this.shapeId);
 }
 override onPointerDown:TLEventHandlers['onPointerDown']=info=>{
  if(info.button!==0)return;
  if(this.editor.getInstanceState().isReadonly){this.cancel();return;}
  if(this.start){if(this.preview())this.finish();return;}
  const point=this.point();if(!validCadPoint(point)||this.editor.getCurrentPageShapeIds().size>=this.editor.options.maxShapesPerPage)return;
  this.start=point;this.shapeId=createShapeId();this.mark=`cad-two-point-${this.shapeId}`;this.editor.mark(this.mark);
 };
 override onPointerMove=()=>{if(this.editor.getInstanceState().isReadonly)this.cancel();else this.preview();};
 override onKeyDown:TLEventHandlers['onKeyDown']=info=>{if(this.editor.getInstanceState().isReadonly){this.cancel();return;}if(info.key==='Escape')this.cancel();else if(info.key==='Enter'&&this.preview())this.finish();};
 override onCancel=()=>this.cancel();
 override onComplete=()=>this.cancel();
 override onInterrupt=()=>this.cancel();
 override onExit=()=>this.cancel(false);
 private finish(){const id=this.shapeId,mark=this.mark;this.shapeId=null;this.start=null;this.mark=null;this.editor.setCurrentTool('select');if(id)this.editor.setSelectedShapes([id]);if(mark)this.editor.mark(mark+'-complete');}
 private cancel(select=true){const mark=this.mark;this.mark=null;this.shapeId=null;this.start=null;if(mark)this.editor.bailToMark(mark);if(select)this.editor.setCurrentTool('select');}
}
export class CadCircleTool extends CadTwoPointTool{static override id='cad-circle';protected override kind='circle' as const;}
export class CadDimensionTool extends CadTwoPointTool{static override id='cad-dimension';protected override kind='dimension' as const;}
