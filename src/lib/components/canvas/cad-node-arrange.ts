import type { Editor } from '@tldraw/tldraw';
import type { CadBezierShape } from './shapes/CadBezierShape';
import { validContours, mapContours, type CadContour } from './cad-curves';
import { assertCadEditable, cadRevision } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { getSelectedCadNodes, setSelectedCadNodes, type CadNodeSelection } from './cad-node-selection';

export type NodeArrangeOptions =
  | {kind:'move';x:number;y:number}
  | {kind:'align';axis:'x'|'y';reference:'min'|'center'|'max'}
  | {kind:'distribute';axis:'x'|'y'};
export interface NodeArrangePlan {
  revision:string;selected:CadNodeSelection[];options:NodeArrangeOptions;
  source:CadContour[];result:CadContour[];contours:CadContour[];moved:number;
}
function source(editor:Editor) {
  const shape=editor.getOnlySelectedShape() as CadBezierShape|undefined;
  if(shape?.type!=='cad-bezier'||!validContours(shape.props.contours))throw Error('selection');
  assertCadEditable(editor,[shape.id]);
  if(editor.getShapeMask(shape.id)||(shape.meta.omsVectorPaint as any)?.clips?.length||editor.getBindingsInvolvingShape(shape.id).length)throw Error('unsupported');
  const nodes=getSelectedCadNodes(editor);
  if(!nodes.length)throw Error('selection');
  return {shape,nodes};
}
export function prepareNodeArrange(editor:Editor,options:NodeArrangeOptions):NodeArrangePlan {
  const {shape,nodes}=source(editor);
  if(!options||!['move','align','distribute'].includes(options.kind)||
      options.kind==='move'&&![options.x,options.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)||
      options.kind!=='move'&&!['x','y'].includes(options.axis)||
      options.kind==='align'&&!['min','center','max'].includes(options.reference))throw Error('invalid');
  const minimum=options.kind==='move'?1:options.kind==='align'?2:3;
  if(nodes.length<minimum)throw Error('count');
  const matrix=editor.getShapePageTransform(shape),contours=structuredClone(shape.props.contours);
  const points=nodes.map(n=>({...n,point:matrix.applyToPoint(contours[n.contourIndex].nodes[n.nodeIndex])}));
  const targets=new Map<string,{x:number;y:number}>();
  if(options.kind==='move')for(const n of points)targets.set(n.contourIndex+':'+n.nodeIndex,{x:n.point.x+options.x,y:n.point.y+options.y});
  else {
    const axis=options.axis, sorted=[...points].sort((a,b)=>a.point[axis]-b.point[axis]||a.contourIndex-b.contourIndex||a.nodeIndex-b.nodeIndex);
    const min=sorted[0].point[axis],max=sorted.at(-1)!.point[axis];
    sorted.forEach((n,i)=>{
      const value=options.kind==='distribute'?min+(max-min)*i/(sorted.length-1):options.reference==='min'?min:options.reference==='max'?max:(min+max)/2;
      targets.set(n.contourIndex+':'+n.nodeIndex,{...n.point,[axis]:value});
    });
  }
  let moved=0;
  for(const n of points){
    const point=targets.get(n.contourIndex+':'+n.nodeIndex)!;
    if(Math.abs(point.x)>1e6||Math.abs(point.y)>1e6)throw Error('bounds');
    const local=editor.getPointInShapeSpace(shape,point),node=contours[n.contourIndex].nodes[n.nodeIndex];
    if(Math.hypot(point.x-n.point.x,point.y-n.point.y)>1e-9)moved++;
    node.x=local.x;node.y=local.y;
  }
  const sourceContours=mapContours(shape.props.contours,p=>matrix.applyToPoint(p)),result=mapContours(contours,p=>matrix.applyToPoint(p));
  if(!validContours(contours)||!validContours(sourceContours)||!validContours(result))throw Error('bounds');
  if(editor.store&&JSON.stringify(editor.store.getStoreSnapshot()).length+JSON.stringify(contours).length-JSON.stringify(shape.props.contours).length>1_900_000)throw Error('limit');
  return {revision:cadRevision(editor),selected:structuredClone(nodes),options:structuredClone(options),source:sourceContours,result,contours,moved};
}
export function applyNodeArrange(editor:Editor,plan:NodeArrangePlan):boolean {
  try {
    if(plan.revision!==cadRevision(editor)||JSON.stringify(plan.selected)!==JSON.stringify(getSelectedCadNodes(editor)))return false;
    editor.complete();editor.setCurrentTool('select');
    if(plan.revision!==cadRevision(editor))return false;
    const fresh=prepareNodeArrange(editor,plan.options),shape=editor.getOnlySelectedShape() as CadBezierShape;
    const meta=JSON.stringify(shape.meta),props={...shape.props,contours:fresh.contours};
    const ok=drawingTransaction(editor,()=>{
      editor.updateShapes([{id:shape.id,type:shape.type,props:{contours:fresh.contours}}]);
      const actual=editor.getShape(shape.id);
      if(!actual||JSON.stringify(actual.props)!==JSON.stringify(props)||JSON.stringify(actual.meta)!==meta)throw Error('failed');
    });
    if(ok)setSelectedCadNodes(editor,fresh.selected);
    return ok;
  }catch{return false;}
}
