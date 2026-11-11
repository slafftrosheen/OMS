import {arrangeProductionPocket} from './production-layout';
import {createShapeId, type Editor} from '@tldraw/tldraw';
import {frameFilePocket, PRODUCTION_FILE_POCKETS, type CanvasOrderAttachment, type ProductionFilePocket} from '$lib/order/file-pockets';

export function documentFilePocket(editor:Editor,shape:{parentId:string;meta:Record<string,any>}):ProductionFilePocket|null{
  let parent=editor.getShape(shape.parentId as any);
  for(let depth=0;parent&&depth<32;depth++){
    const pocket=frameFilePocket(parent);if(pocket)return pocket;
    parent=editor.getShape(parent.parentId as any);
  }
  return PRODUCTION_FILE_POCKETS.includes(shape.meta.omsFilePocket)?shape.meta.omsFilePocket:null;
}

export function orderPocketAtPoint(editor: Editor, point: {x: number; y: number}) {
  return [...editor.getCurrentPageShapesSorted()].reverse().find(shape =>
    frameFilePocket(shape) && editor.getShapePageBounds(shape)?.containsPoint(point));
}
export function addOrderFileDocument(editor: Editor, file: Omit<CanvasOrderAttachment, 'file_type'>,
  position: {x: number; y: number}, pocket?: ProductionFilePocket) {
  const frame = pocket ? editor.getCurrentPageShapesSorted().find(s => frameFilePocket(s) === pocket) : orderPocketAtPoint(editor, position);
  if(editor.getInstanceState().isReadonly || frame && editor.isShapeOrAncestorLocked(frame))return;
  if(editor.getCurrentPageShapesSorted().some(s=>s.type==='document'&&(s.props as any).fileId===file.id))return;
  const target = pocket ?? (frame && frameFilePocket(frame)) ?? 'visuals';
  const local = frame ? editor.getPointInShapeSpace(frame, position) : position;
  const kind = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.startsWith('image/') && !/dxf/i.test(file.mimeType) ? 'image' : 'file';
  editor.createShape({ id: createShapeId(), type: 'document',
    parentId: frame?.id ?? editor.getCurrentPageId(), x: local.x, y: frame ? Math.max(180, local.y) : local.y,
    meta: {omsFilePocket: target,omsAutoArrange:!!frame},
    props: {w:360,h:280,title:file.originalName,content:'',status:'ready',url:file.url,mime:file.mimeType,kind,fileId:file.id}
  } as any);
  if(frame)arrangeProductionPocket(editor,frame.id,Number(frame.meta.omsPocketHeaderHeight)||164);
}
export function syncCreationFileDocuments(editor: Editor, attachments: CanvasOrderAttachment[]) {
  if (editor.getInstanceState().isReadonly) return;
  for (const file of attachments) {
    const existing = editor.getCurrentPageShapesSorted().find(shape => shape.type === 'document' && (shape.props as any).fileId === file.id);
    const frame = editor.getCurrentPageShapesSorted().find(shape => frameFilePocket(shape) === file.file_type);
    if (!frame || editor.isShapeOrAncestorLocked(frame) || existing && editor.isShapeOrAncestorLocked(existing)) continue;
    if (existing) {
      if (existing.meta.omsFilePocket !== file.file_type) {
        const moved=documentFilePocket(editor,existing)!==file.file_type;
        if(moved)editor.reparentShapes([existing.id], frame.id);
        editor.updateShape({id:existing.id,type:'document',...(moved?{x:24,y:180}:{}),meta:{...existing.meta,omsFilePocket:file.file_type}});
        if(moved)arrangeProductionPocket(editor,frame.id,Number(frame.meta.omsPocketHeaderHeight)||164);
      }
    } else {
      const position = editor.getShapePageTransform(frame).applyToPoint({x:24,y:180});
      addOrderFileDocument(editor,file,position,file.file_type);
    }
  }
}
