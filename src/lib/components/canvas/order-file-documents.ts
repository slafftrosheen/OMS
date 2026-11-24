import {placeProductionDocument} from './production-layout';
import {createShapeId, type Editor} from '@tldraw/tldraw';
import {frameFilePocket, PRODUCTION_FILE_POCKETS, type CanvasOrderAttachment, type ProductionFilePocket} from '$lib/order/file-pockets';
import {ORDER_CANVAS_SCALE_META_KEY, readOrderCanvasScale} from '$lib/order/canvas-layout-scale';
import {readCadSettings} from './cad-settings';
import {defaultOrderCanvasScale} from './shapes/form-shapes/form-layout';

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
  position: {x: number; y: number}, pocket?: ProductionFilePocket):boolean {
  const frame = pocket ? editor.getCurrentPageShapesSorted().find(s => frameFilePocket(s) === pocket) : orderPocketAtPoint(editor, position);
  if(editor.getInstanceState().isReadonly || frame && editor.isShapeOrAncestorLocked(frame))return false;
  if(editor.getCurrentPageShapesSorted().some(s=>s.type==='document'&&(s.props as any).fileId===file.id))return false;
  const target = pocket ?? (frame && frameFilePocket(frame)) ?? 'visuals';
  const local = frame ? editor.getPointInShapeSpace(frame, position) : position;
  const settings=frame?null:readCadSettings(editor);
  const scale=frame?readOrderCanvasScale(frame):settings?defaultOrderCanvasScale(settings):1;
  const kind = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.startsWith('image/') && !/dxf/i.test(file.mimeType) ? 'image' : 'file';
  return placeProductionDocument(editor,{ id: createShapeId(), type: 'document',
    parentId: frame?.id ?? editor.getCurrentPageId(), x: local.x, y: frame ? Math.max(180*scale, local.y) : local.y,
    meta: {omsFilePocket: target,omsAutoArrange:!!frame,[ORDER_CANVAS_SCALE_META_KEY]:scale},
    props: {w:360*scale,h:280*scale,title:file.originalName,content:'',status:'ready',url:file.url,mime:file.mimeType,kind,fileId:file.id}
  },true,frame?.id);
}
export function syncCreationFileDocuments(editor: Editor, attachments: CanvasOrderAttachment[]) {
  if (editor.getInstanceState().isReadonly) return;
  for (const file of attachments) {
    const existing = editor.getCurrentPageShapesSorted().find(shape => shape.type === 'document' && (shape.props as any).fileId === file.id);
    const frame = editor.getCurrentPageShapesSorted().find(shape => frameFilePocket(shape) === file.file_type);
    if (!frame || editor.isShapeOrAncestorLocked(frame) || existing && editor.isShapeOrAncestorLocked(existing)) continue;
    const scale=readOrderCanvasScale(frame);
    if (existing) {
      if (existing.meta.omsFilePocket !== file.file_type) {
        const moved=documentFilePocket(editor,existing)!==file.file_type;
        const rotation=moved?editor.getShapePageTransform(existing).rotation()-editor.getShapePageTransform(frame).rotation():existing.rotation;
        placeProductionDocument(editor,{id:existing.id,type:'document',...(moved?{parentId:frame.id,x:24*scale,y:180*scale,rotation}:{}),meta:{...existing.meta,omsFilePocket:file.file_type}},false,moved?frame.id:undefined);
      }
    } else {
      const position = editor.getShapePageTransform(frame).applyToPoint({x:24*scale,y:180*scale});
      addOrderFileDocument(editor,file,position,file.file_type);
    }
  }
}
