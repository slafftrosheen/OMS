import {Box,Mat,reverseRecordsDiff,type Editor,type TLFrameShape,type TLShapeId} from '@tldraw/tldraw';
import {frameFilePocket} from '$lib/order/file-pockets';
import {ORDER_CANVAS_SCALE_META_KEY, readOrderCanvasScale} from '$lib/order/canvas-layout-scale';
import {CAD_MAX_COORDINATE,validCadPoint} from './cad-settings';
import {drawingTransaction} from './drawing-commands';

type LayoutShape={id:TLShapeId;type:string;parentId:string;x:number;y:number;rotation:number;props:Record<string,any>;meta:Record<string,any>;isLocked?:boolean;[key:string]:any};
type DocumentChange={id:TLShapeId;type:'document';parentId?:string;x?:number;y?:number;rotation?:number;props?:Record<string,any>;meta?:Record<string,any>};
type LayoutPlan={before:Map<string,LayoutShape>;after:Map<string,LayoutShape>;affected:Set<string>;geometry:Set<string>;changed:LayoutShape[];created?:LayoutShape};
type LayoutOptions={history?:'record'|'ignore'};

function sameRecord(a:Record<string,any>,b:Record<string,any>,ignoreIndex=false):boolean{
  return !!b&&Object.keys(a).every(key=>ignoreIndex&&key==='index'||JSON.stringify(a[key])===JSON.stringify(b[key]));
}
function matchesCreatedShape(expected:LayoutShape,actual:LayoutShape):boolean{
  return Object.keys(expected).every(key=>key==='props'||key==='meta'
    ? sameRecord(expected[key],actual[key]) : JSON.stringify(expected[key])===JSON.stringify(actual[key]));
}

/** Proposed parent transforms must use the planned records. Native editor
 * transform/bounds caches read stored records even when given a candidate. */
function layoutTransform(records:Map<string,LayoutShape>,shape:LayoutShape,pageId:string,seen=new Set<string>()):Mat{
  if(seen.has(shape.id)||seen.size>128||![shape.x,shape.y,shape.rotation].every(Number.isFinite)||!validCadPoint(shape))throw new Error('Invalid pocket position');
  seen.add(shape.id);
  const local=Mat.Identity().translate(shape.x,shape.y).rotate(shape.rotation);
  if(shape.parentId===pageId)return local;
  const parent=records.get(shape.parentId);
  if(!parent)throw new Error('Missing pocket parent');
  return layoutTransform(records,parent,pageId,seen).multiply(local);
}

function insideLayoutLimits(editor:Editor,records:Map<string,LayoutShape>,shape:LayoutShape):boolean{
  try{
    let bounds:Box;
    if(shape.type==='frame'||shape.type==='document'){
      const {w,h}=shape.props;
      if(![w,h].every(value=>Number.isFinite(value)&&value>0&&value<=CAD_MAX_COORDINATE))return false;
      bounds=new Box(0,0,w,h);
    }else{
      // Unchanged descendants can contain actual CAD geometry, not just cards.
      const stored=editor.getShape(shape.id);if(!stored)return false;
      bounds=editor.getShapeGeometry(stored).bounds;
      if(![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite))return false;
    }
    const transform=layoutTransform(records,shape,editor.getCurrentPageId());
    return bounds.corners.every(point=>validCadPoint(transform.applyToPoint(point)));
  }catch{return false;}
}

function lockedInLayout(records:Map<string,LayoutShape>,shape:LayoutShape,pageId:string):boolean{
  const seen=new Set<string>();let current:LayoutShape|undefined=shape;
  while(current){
    if(current.isLocked||seen.has(current.id)||seen.size>128)return true;
    seen.add(current.id);if(current.parentId===pageId)return false;
    current=records.get(current.parentId);
  }
  return true;
}

/** The saved height is already in canvas units; only the fallback is a design size. */
export function productionPocketHeaderHeight(frame:{meta?:unknown}) {
  const height=(frame.meta as Record<string,unknown>|undefined)?.omsPocketHeaderHeight;
  return typeof height==='number' && Number.isFinite(height) && height>0
    ? height : 164*readOrderCanvasScale(frame);
}

export function productionCardLayout(width:number,count:number,headerHeight:number,scale=1) {
  const gap=24*scale, available=Math.max(120*scale,width-gap*2);
  const columns=Math.max(1,Math.floor((available+gap)/(320*scale+gap)));
  const cardWidth=Math.min(360*scale,(available-gap*(columns-1))/columns);
  return Array.from({length:count},(_,i)=>({x:gap+(i%columns)*(cardWidth+gap),y:headerHeight+gap+Math.floor(i/columns)*304*scale,w:cardWidth,h:280*scale}));
}

/** Retain a viewer's orientation while arranging its complete visible box.
 * A reassignment between rotated pockets changes its local rotation. Packing
 * its unrotated width/height would clip it into the header or adjacent cards. */
function rotatedCardLayout(width:number,cards:LayoutShape[],headerHeight:number,scale:number){
  const gap=24*scale,minWidth=120*scale,height=280*scale;
  const angles=cards.map(card=>({c:Math.abs(Math.cos(card.rotation)),s:Math.abs(Math.sin(card.rotation))}));
  const layoutWidth=Math.max(width,...angles.map(({c,s})=>c*minWidth+s*height+2*gap));
  const available=layoutWidth-2*gap,base=productionCardLayout(layoutWidth,cards.length,headerHeight,scale);
  let x=gap,y=headerHeight+gap,rowHeight=0;
  const positions=cards.map((card,index)=>{
    const {c,s}=angles[index];
    const w=c>1e-8?Math.min(base[index].w,Math.max(minWidth,(available-s*height)/c)):base[index].w;
    const rotation=Mat.Identity().rotate(card.rotation);
    const bounds=Box.FromPoints(new Box(0,0,w,height).corners.map(point=>rotation.applyToPoint(point)));
    if(x>gap&&x+bounds.w>layoutWidth-gap+1e-8*scale){x=gap;y+=rowHeight+gap;rowHeight=0;}
    const position={x:x-bounds.x,y:y-bounds.y,w,h:height,bottom:y+bounds.h};
    x+=bounds.w+gap;rowHeight=Math.max(rowHeight,bounds.h);
    return position;
  });
  return {width:layoutWidth,positions};
}
/** Only cards created by the pocket importer are arranged. Hand-placed artwork
 * and grouped documents retain their coordinates. Frames grow, never crop files. */
function prepareProductionLayout(editor:Editor,frameId?:TLFrameShape['id'],headerHeight?:number,change?:DocumentChange,isNew=false):LayoutPlan|null{
 try{
  if(editor.getInstanceState().isReadonly)return null;
  if(headerHeight!==undefined&&(!Number.isFinite(headerHeight)||headerHeight<=0||headerHeight>CAD_MAX_COORDINATE))return null;
  const before=new Map<string,LayoutShape>(editor.getCurrentPageShapesSorted().map(s=>[s.id,s as unknown as LayoutShape]));
  const after=new Map(before),pageId=editor.getCurrentPageId();
  if(change){
    const previous=before.get(change.id);
    if(isNew?(!!previous||before.size>=editor.options.maxShapesPerPage):(!previous||previous.type!=='document'||lockedInLayout(before,previous,pageId)))return null;
    const next={x:0,y:0,rotation:0,parentId:pageId,meta:{},...previous,...change,props:{...previous?.props,...change.props}} as LayoutShape;
    after.set(next.id,next);
    if(lockedInLayout(after,next,pageId))return null;
  }
  const frame=frameId?after.get(frameId):undefined;
  if(frameId&&(!frame||!frameFilePocket(frame)||lockedInLayout(after,frame,pageId)))return null;
  if(frame){
  const scale=readOrderCanvasScale(frame);
  const header=typeof headerHeight==='number' && Number.isFinite(headerHeight) && headerHeight>0
    ? headerHeight : productionPocketHeaderHeight(frame);
  const shapes=[...after.values()];
  const children=shapes.filter(s=>s.parentId===frame.id);
  const cards=children.filter(s=>s.type==='document' && s.meta.omsAutoArrange===true && !lockedInLayout(after,s,pageId));
  const arranged=rotatedCardLayout(frame.props.w,cards,header,scale),positions=arranged.positions;
  const updates:any[]=[];
  if(arranged.width>frame.props.w)updates.push({id:frame.id,type:'frame',props:{w:arranged.width}});
  if(headerHeight!==undefined&&frame.meta.omsPocketHeaderHeight!==header)
    updates.push({id:frame.id,type:'frame',meta:{...frame.meta,omsPocketHeaderHeight:header}});
  cards.forEach((s,i)=>{
    const p=positions[i], changedScale=readOrderCanvasScale(s)!==scale;
    if(s.x!==p.x||s.y!==p.y||(s.props as any).w!==p.w||(s.props as any).h!==p.h||changedScale)
      updates.push({id:s.id,type:s.type,x:p.x,y:p.y,props:{w:p.w,h:p.h},
        ...(changedScale?{meta:{...s.meta,[ORDER_CANVAS_SCALE_META_KEY]:scale}}:{})});
  });
  let height=Math.max(frame.props.h,header+48*scale,...positions.map(p=>p.bottom+24*scale));
  for(const child of children.filter(s=>!cards.includes(s))){
    const stored=editor.getShape(child.id);
    const bounds=child.type==='document'||child.type==='frame'?new Box(0,0,child.props.w,child.props.h):stored?editor.getShapeGeometry(stored).bounds:null;
    if(!bounds)return null;
    const transform=layoutTransform(after,child,pageId),inverse=layoutTransform(after,frame,pageId).invert();
    for(const corner of bounds.corners)height=Math.max(height,inverse.applyToPoint(transform.applyToPoint(corner)).y+24*scale);
  }
  height=Math.ceil(height/scale)*scale;
  if(height>frame.props.h){
    updates.push({id:frame.id,type:'frame',props:{h:height}});
    // Keep the template's vertical stack readable as a pocket grows.
    if(Math.abs(frame.rotation)<1e-8)for(const other of shapes){
      if(other.id===frame.id||!frameFilePocket(other)||other.parentId!==frame.parentId||Math.abs(other.rotation)>1e-8||lockedInLayout(after,other,pageId))continue;
      const w=(other.props as any).w;
      if(other.y>=frame.y+frame.props.h-scale && other.x<frame.x+arranged.width && other.x+w>frame.x)
        updates.push({id:other.id,type:other.type,y:other.y+height-frame.props.h});
    }
  }
  for(const update of updates){const current=after.get(update.id)!;after.set(update.id,{...current,...update,props:{...current.props,...update.props}});}
  }
  const changed=[...after.values()].filter(shape=>before.has(shape.id)&&!sameRecord(before.get(shape.id)!,shape));
  const created=isNew&&change?after.get(change.id):undefined;
  const affected=new Set<string>(created?[created.id]:[]);
  const geometry=new Set<string>(affected);
  for(const shape of changed){
    const previous=before.get(shape.id)!;
    if(lockedInLayout(before,previous,pageId)||lockedInLayout(after,shape,pageId))return null;
    const moved=shape.x!==previous.x||shape.y!==previous.y||shape.rotation!==previous.rotation||shape.parentId!==previous.parentId;
    const resized=shape.props.w!==previous.props.w||shape.props.h!==previous.props.h;
    affected.add(shape.id);
    if(!moved&&!resized)continue;
    for(const id of editor.getShapeAndDescendantIds([shape.id])){
      const child=after.get(id);if(!child)return null;
      if(moved&&lockedInLayout(before,before.get(id)!,pageId))return null;
      affected.add(id);
      geometry.add(id);
    }
  }
  if([...geometry].some(id=>!insideLayoutLimits(editor,after,after.get(id)!)))return null;
  return {before,after,affected,geometry,changed,created};
 }catch{return null;}
}

function applyProductionLayout(editor:Editor,plan:LayoutPlan,options:LayoutOptions={}):boolean{
  if(!plan.created&&!plan.changed.length)return true;
  const apply=()=>{
    if(editor.getInstanceState().isReadonly)throw new Error('Pocket is read-only');
    for(const id of plan.affected){
      const previous=plan.before.get(id);
      if(previous&&!sameRecord(previous,editor.getShape(id as TLShapeId) as any))throw new Error('Pocket changed');
    }
    if(plan.created)editor.createShape(plan.created as any);
    for(const shape of plan.changed){
      const previous=plan.before.get(shape.id)!;
      if(shape.parentId!==previous.parentId)editor.reparentShapes([shape.id],shape.parentId as any);
    }
    if(plan.changed.length)editor.updateShapes(plan.changed.map(shape=>{
      const patch={...shape};
      // Native reparenting assigns a safe index among the destination siblings.
      if(plan.before.get(shape.id)!.parentId!==shape.parentId)delete patch.index;
      return patch;
    }) as any);
    const actual=new Map<string,LayoutShape>(editor.getCurrentPageShapesSorted().map(s=>[s.id,s as unknown as LayoutShape]));
    for(const id of plan.affected){
      const expected=plan.after.get(id)!,applied=actual.get(id),previous=plan.before.get(id);
      if(!applied||!(previous?sameRecord(expected,applied,previous.parentId!==expected.parentId):matchesCreatedShape(expected,applied))||plan.geometry.has(id)&&!insideLayoutLimits(editor,actual,applied))throw new Error('Pocket layout was not applied');
    }
  };
  if(options.history!=='ignore')return drawingTransaction(editor,apply);
  // Resize observers must not consume undo/redo history. Capture and reverse
  // precisely this synchronous write, including store side effects, because
  // history marks cannot roll back a history-ignored batch.
  let succeeded=true;
  editor.run(()=>{
    const changes=editor.store.extractingChanges(()=>{try{apply();}catch{succeeded=false;}});
    if(!succeeded)editor.store.applyDiff(reverseRecordsDiff(changes),{runCallbacks:false});
  },{history:'ignore'});
  return succeeded;
}

/** Placement and its complete pocket relayout are checked before any write and
 * share one rollback boundary, including downstream frames and their contents. */
export function placeProductionDocument(editor:Editor,change:DocumentChange,isNew:boolean,frameId?:TLFrameShape['id']):boolean{
  const plan=prepareProductionLayout(editor,frameId,undefined,change,isNew);
  return !!plan&&applyProductionLayout(editor,plan);
}

export function arrangeProductionPocket(editor:Editor,frameId:TLFrameShape['id'],headerHeight?:number,options:LayoutOptions={}):boolean{
  const plan=prepareProductionLayout(editor,frameId,headerHeight);
  return !!plan&&applyProductionLayout(editor,plan,options);
}
