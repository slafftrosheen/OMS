import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { arrangementRoots } from './drawing-arrange';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { validCadPoint, type CadPoint } from './cad-settings';

export const TRANSFORM_ANCHORS = ['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'] as const;
export type TransformAnchor = typeof TRANSFORM_ANCHORS[number];
export type TransformOptions = { anchor: TransformAnchor; copies: number } & (
  | { kind: 'position'; relative: boolean; x: number; y: number }
  | { kind: 'scale'; x: number; y: number });
export interface TransformPlan {
  revision: string; options: TransformOptions; selected: TLShapeId[]; generated: number;
  source: { x: number; y: number; w: number; h: number };
  results: Array<{ x: number; y: number; w: number; h: number }>;
}
const TYPES = new Set(['group','geo','draw','highlight','line','text','image','cad-path','cad-bezier','cad-ellipse','cad-arc','cad-dimension']);
const corners = (b: {x:number;y:number;w:number;h:number}) => [{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}];
const validBox = (b: Box | undefined): b is Box => !!b && b.w >= 0 && b.h >= 0 && corners(b).every(validCadPoint);
export function transformAnchorPoint(bounds: {x:number;y:number;w:number;h:number}, anchor: TransformAnchor): CadPoint {
  const index = TRANSFORM_ANCHORS.indexOf(anchor);
  if (index < 0) throw new CadOperationError('invalid');
  return {x:bounds.x+bounds.w*(index%3)/2,y:bounds.y+bounds.h*Math.floor(index/3)/2};
}
function selection(editor: Editor) {
  const roots = arrangementRoots(editor);
  if (!roots.length || roots.length > 500) throw new CadOperationError('selection');
  try { assertCadEditable(editor, roots); } catch { throw new CadOperationError('protected'); }
  const shapes = [...editor.getShapeAndDescendantIds(roots)].map(id=>editor.getShape(id));
  if (shapes.length > 500 || shapes.some(s=>!s || !TYPES.has(s.type))) throw new CadOperationError('protected');
  for (const shape of shapes as TLShape[]) {
    if (editor.getShapeMask(shape.id) || (shape.meta.omsVectorPaint as any)?.clips?.length || editor.getBindingsInvolvingShape(shape.id).length) throw new CadOperationError('unsupported');
    let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      if (parent.type !== 'group') throw new CadOperationError('unsupported');
      seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
    }
  }
  const leaves = (shapes as TLShape[]).filter(s=>s.type!=='group');
  const boxes = leaves.map(s=>getCadShapePageBounds(editor,s));
  if (!boxes.length || boxes.some(b=>!validBox(b))) throw new CadOperationError('bounds');
  return {roots,shapes:shapes as TLShape[],leaves,bounds:Box.Common(boxes as Box[])};
}
/** Bounds use the page axes and exclude outlines; groups are one selection. */
export function getTransformSelectionBounds(editor: Editor): Box | null {
  try { return selection(editor).bounds; } catch { return null; }
}
function pointAt(point: CadPoint, options: TransformOptions, bounds: Box, step: number): CadPoint {
  const anchor = transformAnchorPoint(bounds,options.anchor);
  if (options.kind==='position') {
    const delta = options.relative ? options : {x:options.x-anchor.x,y:options.y-anchor.y};
    return {x:point.x+delta.x*step,y:point.y+delta.y*step};
  }
  return {x:anchor.x+(point.x-anchor.x)*options.x**step,y:anchor.y+(point.y-anchor.y)*options.y**step};
}
function boxAt(box: Box, options: TransformOptions, bounds: Box, step: number): Box {
  return Box.FromPoints(corners(box).map(p=>pointAt(p,options,bounds,step)));
}
function canScale(editor: Editor, shapes: TLShape[], options: TransformOptions) {
  if (options.kind!=='scale') return;
  const uniform = Math.abs(options.x-options.y)<1e-10;
  for (const shape of shapes) {
    const util = editor.getShapeUtil(shape);
    if (!util.canResize(shape)) throw new CadOperationError('unsupported');
    // tldraw preserves oblique objects' proportions during page-axis resizing.
    // Refuse that approximation; exact nonuniform scaling would require skew.
    if (!uniform && (util.isAspectRatioLocked(shape) || Math.abs(Math.sin(2*editor.getShapePageTransform(shape).rotation()))>1e-8)) throw new CadOperationError('proportions');
  }
}
export function prepareTransformPlan(editor: Editor, options: TransformOptions): TransformPlan {
  if (!options || !TRANSFORM_ANCHORS.includes(options.anchor) || !Number.isInteger(options.copies) || options.copies<0 || options.copies>200 ||
      ![options.x,options.y].every(Number.isFinite) || !['position','scale'].includes(options.kind) ||
      options.kind==='position' && typeof options.relative!=='boolean' ||
      options.kind==='scale' && (options.x<=0 || options.y<=0 || options.x>1000 || options.y>1000)) throw new CadOperationError('invalid');
  const {roots,shapes,leaves,bounds} = selection(editor);
  canScale(editor,leaves,options);
  const generated = shapes.length*options.copies;
  if (generated>500 || generated+editor.getCurrentPageShapeIds().size>editor.options.maxShapesPerPage ||
      options.copies && editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length+JSON.stringify(shapes).length*options.copies>1_850_000) throw new CadOperationError('limit');
  const first=boxAt(bounds,options,bounds,1);
  if (options.copies && Math.max(Math.abs(first.x-bounds.x),Math.abs(first.y-bounds.y),Math.abs(first.w-bounds.w),Math.abs(first.h-bounds.h))<1e-8) throw new CadOperationError('coincident');
  const results = Array.from({length:Math.max(1,options.copies)},(_,i)=>boxAt(bounds,options,bounds,i+1));
  if (results.some(b=>!validBox(b))) throw new CadOperationError('bounds');
  for (const shape of options.kind==='scale'?leaves:roots.map(id=>editor.getShape(id)!)) {
    const origin=editor.getShapePageTransform(shape).point();
    for (let step=1;step<=Math.max(1,options.copies);step++) {
      const point=pointAt(origin,options,bounds,step);
      if (!validCadPoint(point) || !validCadPoint(editor.getPointInParentSpace(shape,point))) throw new CadOperationError('bounds');
    }
  }
  const plain = (b:Box)=>({x:b.x,y:b.y,w:b.w,h:b.h});
  return {revision:cadRevision(editor),selected:[...editor.getSelectedShapeIds()],options:structuredClone(options),generated,source:plain(bounds),results:results.map(plain)};
}
const close = (a:number,b:number) => Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-9);
/** Native resize hooks retain text, image assets and CAD paint. Every result is
 * checked against exact page bounds; a clamped or refused edit rolls back. */
export function applyTransformPlan(editor: Editor, plan: TransformPlan): boolean {
  try {
    if (plan.revision!==cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision!==cadRevision(editor)) return false;
    const fresh=prepareTransformPlan(editor,plan.options), {roots,shapes,bounds}=selection(editor), options=fresh.options;
    const camera={...editor.getCamera()};
    const success=drawingTransaction(editor,()=>{
      const created: TLShapeId[]=[];
      for (let step=1;step<=Math.max(1,options.copies);step++) {
        let targets=roots;
        if (options.copies) {
          const before=new Set(editor.getCurrentPageShapeIds());
          editor.duplicateShapes(roots);
          targets=[...editor.getSelectedShapeIds()];
          if (editor.getCurrentPageShapeIds().size-before.size!==shapes.length || targets.length!==roots.length || targets.some(id=>before.has(id))) throw new Error('Incomplete copy');
          created.push(...targets);
        }
        const leaves=[...editor.getShapeAndDescendantIds(targets)].map(id=>editor.getShape(id)!).filter(s=>s.type!=='group');
        const snapshots=leaves.map(shape=>({shape,transform:editor.getShapePageTransform(shape),localBounds:editor.getShapeGeometry(shape).bounds,
          expected:boxAt(getCadShapePageBounds(editor,shape)!,options,bounds,step)}));
        if (options.kind==='position') {
          editor.updateShapes(targets.map(id=>{
            const shape=editor.getShape(id)!;
            const local=editor.getPointInParentSpace(shape,pointAt(editor.getShapePageTransform(shape).point(),options,bounds,step));
            return {id,type:shape.type,x:local.x,y:local.y};
          }));
        } else {
          const scale={x:options.x**step,y:options.y**step}, anchor=transformAnchorPoint(bounds,options.anchor);
          for (const snapshot of snapshots) editor.resizeShape(snapshot.shape.id,scale,{
            initialShape:snapshot.shape,initialPageTransform:snapshot.transform,initialBounds:snapshot.localBounds,
            scaleOrigin:anchor,scaleAxisRotation:0,mode:'scale_shape',isAspectRatioLocked:Math.abs(scale.x-scale.y)<1e-10
          });
        }
        for (const snapshot of snapshots) {
          const actual=editor.getShape(snapshot.shape.id), box=actual && getCadShapePageBounds(editor,actual);
          if (!validBox(box) || !['x','y','w','h'].every(key=>close(box[key as 'x'],snapshot.expected[key as 'x'])) ||
              Math.abs(Math.sin((editor.getShapePageTransform(actual!).rotation()-snapshot.transform.rotation())/2))>1e-8) throw new Error('Transform was adjusted');
        }
      }
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length>1_900_000) throw new Error('Document limit');
      editor.setSelectedShapes(options.copies?[...roots,...created]:roots);
    });
    editor.setCamera(camera);
    return success;
  } catch { return false; }
}
