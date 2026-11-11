import type {Editor, TLFrameShape} from '@tldraw/tldraw';
import {frameFilePocket} from '$lib/order/file-pockets';

export function productionCardLayout(width:number,count:number,headerHeight:number) {
  const gap=24, available=Math.max(120,width-gap*2);
  const columns=Math.max(1,Math.floor((available+gap)/(320+gap)));
  const cardWidth=Math.min(360,(available-gap*(columns-1))/columns);
  return Array.from({length:count},(_,i)=>({x:gap+(i%columns)*(cardWidth+gap),y:headerHeight+gap+Math.floor(i/columns)*304,w:cardWidth,h:280}));
}
/** Only cards created by the pocket importer are arranged. Hand-placed artwork
 * and grouped documents retain their coordinates. Frames grow, never crop files. */
export function arrangeProductionPocket(editor:Editor,frameId:TLFrameShape['id'],headerHeight=164) {
  const frame=editor.getShape<TLFrameShape>(frameId);
  if(!frame || !frameFilePocket(frame) || editor.getInstanceState().isReadonly || editor.isShapeOrAncestorLocked(frame))return;
  const shapes=editor.getCurrentPageShapesSorted();
  const children=shapes.filter(s=>s.parentId===frame.id);
  const cards=children.filter(s=>s.type==='document' && s.meta.omsAutoArrange===true && !editor.isShapeOrAncestorLocked(s));
  const positions=productionCardLayout(frame.props.w,cards.length,headerHeight);
  const updates:any[]=[];
  cards.forEach((s,i)=>{const p=positions[i];if(s.x!==p.x||s.y!==p.y||(s.props as any).w!==p.w||(s.props as any).h!==p.h)updates.push({id:s.id,type:s.type,x:p.x,y:p.y,props:{w:p.w,h:p.h}});});
  let height=Math.max(frame.props.h,headerHeight+48,...positions.map(p=>p.y+p.h+24));
  for(const child of children.filter(s=>!cards.includes(s))){
    const bounds=editor.getShapePageBounds(child);if(!bounds)continue;
    for(const corner of bounds.corners)height=Math.max(height,editor.getPointInShapeSpace(frame,corner).y+24);
  }
  height=Math.ceil(height);
  if(height>frame.props.h){
    updates.push({id:frame.id,type:'frame',props:{h:height}});
    // Keep the template's vertical stack readable as a pocket grows.
    if(Math.abs(frame.rotation)<1e-8)for(const other of shapes){
      if(other.id===frame.id||!frameFilePocket(other)||other.parentId!==frame.parentId||Math.abs(other.rotation)>1e-8||editor.isShapeOrAncestorLocked(other))continue;
      const w=(other.props as any).w;
      if(other.y>=frame.y+frame.props.h-1 && other.x<frame.x+frame.props.w && other.x+w>frame.x)
        updates.push({id:other.id,type:other.type,y:other.y+height-frame.props.h});
    }
  }
  if(updates.length)editor.updateShapes(updates);
}
