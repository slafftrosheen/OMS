import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { CAD_APPEARANCE_TYPES, cadAppearanceGeometry } from './cad-shape-appearance';
import { vectorPaint, paintMetadata } from './cad-vector';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { unitLengthToCanvas, validateCadSettings, type CadSettings } from './cad-settings';

export const OUTLINE_FIELDS = ['stroke','strokeWidth','strokeOpacity','lineCap','lineJoin','miterLimit','dash','dashOffset'] as const;
export type OutlineField = typeof OUTLINE_FIELDS[number];
export type OutlinePatch = Partial<Pick<VectorPaint,OutlineField>>;
export type OutlineInput = OutlinePatch; // Width, dash lengths and offset use the active document unit.
export interface OutlinePlan { revision:string; patch:OutlinePatch; count:number; samples:VectorPaint[]; }

/** Groups are expanded once; mixed native/CAD or protected content is never silently skipped. */
export function readOutlineSelection(editor:Editor) {
  const selected=[...editor.getSelectedShapeIds()];
  if(!selected.length)throw new CadOperationError('selection');
  const shapes=[...editor.getShapeAndDescendantIds(selected)].map(id=>editor.getShape(id));
  if(shapes.length>500)throw new CadOperationError('limit');
  if(shapes.some(shape=>!shape||shape.type!=='group'&&!CAD_APPEARANCE_TYPES.has(shape.type)))throw new CadOperationError('selection');
  const leaves=(shapes as TLShape[]).filter(shape=>shape.type!=='group');
  if(!leaves.length)throw new CadOperationError('selection');
  for(const shape of leaves){
    cadAppearanceGeometry(shape);
    if(shape.meta.omsVectorPaint&&!validVectorPaint(shape.meta.omsVectorPaint))throw new CadOperationError('selection');
    const seen=new Set<string>();let parent=editor.getShape(shape.parentId as TLShapeId);
    while(parent&&!seen.has(parent.id)){
      if(parent.type!=='group')throw new CadOperationError('selection');
      seen.add(parent.id);parent=editor.getShape(parent.parentId as TLShapeId);
    }
    if(parent)throw new CadOperationError('selection');
  }
  return leaves.map(shape=>({shape,paint:vectorPaint(shape.meta,(shape.props as {color?:string}).color)}));
}
export function outlinePatchFromInput(input:OutlineInput,settings:CadSettings):OutlinePatch {
  if(!validateCadSettings(settings)||!input||typeof input!=='object'||Array.isArray(input))throw new CadOperationError('invalid');
  const keys=Object.keys(input);
  if(!keys.length||keys.some(key=>!OUTLINE_FIELDS.includes(key as OutlineField)))throw new CadOperationError('invalid');
  for(const key of ['strokeWidth','strokeOpacity','miterLimit','dashOffset'] as const)if(Object.hasOwn(input,key)&&!Number.isFinite(input[key]))throw new CadOperationError('invalid');
  if(Object.hasOwn(input,'dash')&&(!Array.isArray(input.dash)||input.dash.some(value=>!Number.isFinite(value))))throw new CadOperationError('invalid');
  const patch=structuredClone(input);
  if(Object.hasOwn(patch,'strokeWidth'))patch.strokeWidth=unitLengthToCanvas(patch.strokeWidth!,settings);
  if(Object.hasOwn(patch,'dashOffset'))patch.dashOffset=unitLengthToCanvas(patch.dashOffset!,settings);
  if(Object.hasOwn(patch,'dash')){
    if(!Array.isArray(patch.dash))throw new CadOperationError('invalid');
    patch.dash=patch.dash.map(value=>unitLengthToCanvas(value,settings));
  }
  // Validate the whole set against a neutral paint; validation also rejects undefined fields.
  const neutral=vectorPaint({},'black');
  if(!validVectorPaint({...neutral,...patch}))throw new CadOperationError('invalid');
  return patch;
}
function proposed(editor:Editor,patch:OutlinePatch){
  const source=readOutlineSelection(editor);
  assertCadEditable(editor,source.map(item=>item.shape.id));
  if(!Object.keys(patch).length||Object.keys(patch).some(key=>!OUTLINE_FIELDS.includes(key as OutlineField)))throw new CadOperationError('invalid');
  const updates=source.map(({shape,paint})=>{
    const next={...paint,...patch};
    if(!validVectorPaint(next))throw new CadOperationError('invalid');
    return {id:shape.id,type:shape.type,meta:{...shape.meta,omsVectorPaint:paintMetadata(next)}};
  });
  const before=editor.store?JSON.stringify(editor.store.getStoreSnapshot()).length:source.reduce((n,item)=>n+JSON.stringify(item.shape.meta).length,0);
  const after=before-source.reduce((n,item)=>n+JSON.stringify(item.shape.meta).length,0)+updates.reduce((n,item)=>n+JSON.stringify(item.meta).length,0);
  if(after>1_900_000&&after>=before)throw new CadOperationError('limit');
  return {source,updates};
}
export function prepareOutlinePlan(editor:Editor,input:OutlineInput,settings:CadSettings):OutlinePlan {
  const patch=outlinePatchFromInput(input,settings),{source}=proposed(editor,patch);
  return {revision:cadRevision(editor),patch,count:source.length,samples:source.slice(0,3).map(item=>({...item.paint,...patch}))};
}
export function applyOutlinePlan(editor:Editor,plan:OutlinePlan):boolean {
  try{
    if(plan.revision!==cadRevision(editor))return false;
    editor.complete();editor.setCurrentTool('select');
    if(plan.revision!==cadRevision(editor))return false;
    const {source,updates}=proposed(editor,plan.patch);
    const before=source.map(item=>JSON.stringify(item.shape.props));
    return drawingTransaction(editor,()=>{
      editor.updateShapes(updates);
      for(let i=0;i<updates.length;i++){
        const actual=editor.getShape(updates[i].id);
        if(!actual||JSON.stringify(actual.meta)!==JSON.stringify(updates[i].meta)||JSON.stringify(actual.props)!==before[i])throw new Error('outline-failed');
      }
    });
  }catch{return false;}
}
