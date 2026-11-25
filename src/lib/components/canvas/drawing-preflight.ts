import { fitDrawingSelection } from './drawing-camera';
import { atom, Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { contourSegments, mapContours, type CadContour } from './cad-curves';
import { shapeCadContours } from './cad-editing';
import { cadShapeDxfGeometry, type DxfCapturedScope, type DxfEntity } from './cad-dxf';
import { visitDxfCommonLines } from './cad-dxf-common-lines';
import { drawingObjectName } from './drawing-operations';
import { cadMmPerPixel, cadPointToCanvas, validateCadSettings, type CadPoint, type CadSettings } from './cad-settings';

export const PREFLIGHT_MAX_SHAPES = 1000;
export const PREFLIGHT_MAX_SEGMENTS = 12000;
export const PREFLIGHT_MAX_ISSUES = 500;
export type PreflightKind = 'open' | 'zero' | 'short' | 'duplicate' | 'shared' | 'clipped' | 'invalid' | 'text' | 'unsupported';
type SharedSegment = { from: CadPoint; to: CadPoint };
export type PreflightIssue = {
  kind: PreflightKind; id: TLShapeId; name: string; contour?: number; segment?: number; otherId?: TLShapeId;
  otherName?: string; otherContour?: number; lengthMm?: number; relatedIds?: TLShapeId[]; coveringContours?: number;
  sharedSegment?: SharedSegment;
};
export interface DrawingPreflight {
  revision: string; pageId: string; scope: 'selected' | 'all'; thresholdMm: number;
  checked: number; omitted: number; open: number; closed: number; segments: number;
  sharedEdges: number; duplicatePasses: number;
  issues: PreflightIssue[]; issueCount: number; truncated: boolean; sourceIds: TLShapeId[];
}
export interface PreflightDxfScope extends DxfCapturedScope { revision: string }

function createPreflightHighlight() {
  return atom<{ pageId: string; revision: string; segment: SharedSegment } | null>('drawing preflight highlight', null);
}
const highlights = new WeakMap<Editor, ReturnType<typeof createPreflightHighlight>>();
function drawingPreflightHighlight(editor: Editor) {
  let highlight = highlights.get(editor);
  if (!highlight) {
    highlight = createPreflightHighlight();
    highlights.set(editor, highlight);
  }
  return highlight;
}
export function clearPreflightHighlight(editor: Editor) {
  highlights.get(editor)?.set(null);
}
export function readPreflightHighlight(editor: Editor): SharedSegment | null {
  const highlight = drawingPreflightHighlight(editor).get();
  return highlight && highlight.pageId === editor.getCurrentPageId() && highlight.revision === preflightRevision(editor)
    ? highlight.segment : null;
}
/** Selection is deliberately excluded: locating an issue must not stale the report. */
export function preflightRevision(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPage(), editor.getCurrentPageShapesSorted()]);
}
const distance=(a:CadPoint,b:CadPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const coordinate=(n:number)=>{if(!Number.isFinite(n)||Math.abs(n)>1e8)throw new Error('invalid');return (Math.round(n*1e6)/1e6||0).toFixed(6);};
const point=(p:CadPoint)=>coordinate(p.x)+','+coordinate(p.y);
function leastRotation(tokens:string[]):string[] {
  // Booth's minimum rotation, avoiding quadratic work on long closed contours.
  const n=tokens.length;let a=0,b=1,k=0;
  while(a<n&&b<n&&k<n){
    const left=tokens[(a+k)%n],right=tokens[(b+k)%n];
    if(left===right){k++;continue;}
    if(left>right){a+=k+1;if(a===b)a++;}else{b+=k+1;if(a===b)b++;}
    k=0;
  }
  const start=Math.min(a,b);return [...tokens.slice(start),...tokens.slice(0,start)];
}
function segmentToken(points:CadPoint[]):string {
  const straight=distance(points[0],points[1])===0&&distance(points[2],points[3])===0;
  return (straight?'L':'C')+(straight?[points[0],points[3]]:points).map(point).join(';');
}
/** Recorded segment geometry, rounded to 0.000001 mm. Reversal and closed seam
 * position are ignored; differing segmentation and converted conics are not. */
export function preflightContourKey(contour:CadContour):string {
  const segments=[...contourSegments(contour)];
  const forward=segments.map(segmentToken),reverse=segments.slice().reverse().map(s=>segmentToken([...s].reverse()));
  const key=(tokens:string[])=> (contour.closed?leastRotation(tokens):tokens).join('|');
  const a=key(forward),b=key(reverse);return (contour.closed?'closed:':'open:')+(a<b?a:b);
}
function analyticKey(entity:DxfEntity):string|null {
  if(entity.type==='circle')return 'circle:'+point(entity.center)+':'+coordinate(entity.radius);
  if(entity.type==='ellipse'){
    const major=entity.major.x<0||entity.major.x===0&&entity.major.y<0?{x:-entity.major.x,y:-entity.major.y}:entity.major;
    return 'ellipse:'+point(entity.center)+':'+point(major)+':'+entity.ratio.toPrecision(14);
  }
  if(entity.type==='arc')return 'arc:'+point(entity.center)+':'+coordinate(entity.radius)+':'+entity.start.toFixed(9)+':'+entity.end.toFixed(9);
  return null;
}
export function inspectDrawingPreflight(editor:Editor,settings:CadSettings,scope:'selected'|'all',thresholdMm=0.1):DrawingPreflight {
  if(!validateCadSettings(settings)||!['selected','all'].includes(scope)||!Number.isFinite(thresholdMm)||thresholdMm<=0||thresholdMm>100)throw new Error('settings');
  const ids=[...new Set(scope==='all'?[...editor.getCurrentPageShapeIds()]:[...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])])];
  if(!ids.length)throw new Error('empty');
  if(ids.length>PREFLIGHT_MAX_SHAPES)throw new Error('limit');
  const result:DrawingPreflight={revision:preflightRevision(editor),pageId:editor.getCurrentPageId(),scope,thresholdMm,checked:0,omitted:0,open:0,closed:0,segments:0,sharedEdges:0,duplicatePasses:0,issues:[],issueCount:0,truncated:false,sourceIds:ids};
  const seen=new Map<string,{id:TLShapeId;name:string;contour?:number}>();
  const sharedCandidates: DxfEntity[] = [];
  const sharedSources: Array<{ id: TLShapeId; name: string; contour: number }> = [];
  const issue=(value:PreflightIssue)=>{result.issueCount++;if(result.issues.length<PREFLIGHT_MAX_ISSUES)result.issues.push(value);else result.truncated=true;};
  const duplicate=(key:string,shape:TLShape,contour?:number)=>{
    const existing=seen.get(key),name=drawingObjectName(shape);
    if(existing)issue({kind:'duplicate',id:shape.id,name,contour,otherId:existing.id,otherName:existing.name,otherContour:existing.contour});
    else seen.set(key,{id:shape.id,name,contour});
  };
  const mm=cadMmPerPixel(settings);
  const modelSpace: CadSettings = { ...settings, unit: 'mm' };
  for(const id of ids){
    const shape=editor.getShape(id);
    if(!shape||['group','frame'].includes(shape.type))continue;
    const name=drawingObjectName(shape);
    let geometry:ReturnType<typeof cadShapeDxfGeometry>;
    try{geometry=cadShapeDxfGeometry(editor,shape,settings);}catch{geometry={reason:'invalid'};}
    if(geometry.reason){
      result.omitted++;
      issue({kind:geometry.reason==='curved'?'unsupported':geometry.reason,id,name});
      // Invalid straight paths can still reveal zero segments; omitted artwork,
      // masks and decorative rasters must never masquerade as checked cut paths.
      if(geometry.reason!=='invalid')continue;
    }else result.checked++;
    const analytic=geometry.entity&&analyticKey(geometry.entity);
    if(analytic&&geometry.entity){
      const entity=geometry.entity;
      const open=entity.type==='arc';
      if(open){result.open++;issue({kind:'open',id,name,contour:0});}else result.closed++;
      duplicate(analytic,shape,0);
      if(entity.type==='arc'&&entity.radius*((entity.end-entity.start+360)%360)*Math.PI/180<thresholdMm)
        issue({kind:'short',id,name,contour:0,segment:0,lengthMm:entity.radius*((entity.end-entity.start+360)%360)*Math.PI/180});
      if(++result.segments>PREFLIGHT_MAX_SEGMENTS)throw new Error('limit');
      continue;
    }
    let contours:CadContour[];
    try{contours=mapContours(shapeCadContours(editor,shape),p=>({x:(p.x-settings.originX)*mm,y:(settings.originY-p.y)*mm}));}catch{continue;}
    for(let ci=0;ci<contours.length;ci++){
      const contour=contours[ci],segments=[...contourSegments(contour)];
      result.segments+=segments.length;if(result.segments>PREFLIGHT_MAX_SEGMENTS)throw new Error('limit');
      if(contour.closed)result.closed++;else{result.open++;issue({kind:'open',id,name,contour:ci});}
      if(!geometry.reason)duplicate(preflightContourKey(contour),shape,ci);
      for(let si=0;si<segments.length;si++){
        const p=segments[si],upper=distance(p[0],p[1])+distance(p[1],p[2])+distance(p[2],p[3]);
        if(upper===0)issue({kind:'zero',id,name,contour:ci,segment:si,lengthMm:0});
        // The control polygon upper-bounds true arc length: this never calls a
        // long loop "short" just because its endpoints are close.
        else if(upper<thresholdMm)issue({kind:'short',id,name,contour:ci,segment:si,lengthMm:upper});
      }
    }
    if (geometry.reason) continue;
    for (const [contour, entity] of (geometry.entities ?? (geometry.entity ? [geometry.entity] : [])).entries()) {
      if (entity.type === 'polyline' && entity.closed || entity.type === 'spline' && entity.contour.closed) {
        sharedCandidates.push(entity);
        sharedSources.push({ id, name, contour });
      }
    }
  }
  try {
    visitDxfCommonLines(sharedCandidates, ({ from, to, duplicatePasses }, indices) => {
      result.sharedEdges++;
      result.duplicatePasses += duplicatePasses;
      if (result.issues.length >= PREFLIGHT_MAX_ISSUES) {
        result.issueCount++;
        result.truncated = true;
        return;
      }
      const participants = Array.from(indices, index => sharedSources[index]);
      const [first, second] = participants;
      issue({ kind: 'shared', ...first, otherId: second.id, otherName: second.name, otherContour: second.contour,
        lengthMm: distance(from, to), coveringContours: participants.length,
        relatedIds: [...new Set(participants.map(source => source.id))],
        sharedSegment: { from: cadPointToCanvas(from, modelSpace), to: cadPointToCanvas(to, modelSpace) } });
    });
  } catch (error) {
    if (error instanceof RangeError) throw new Error('limit');
    throw error;
  }
  return result;
}
/** Navigation only, including read-only drawings. Never deletes or edits paths. */
export function locatePreflightIssue(editor:Editor,report:DrawingPreflight,index:number):boolean {
  clearPreflightHighlight(editor);
  if(report.revision!==preflightRevision(editor)||editor.getCurrentPageId()!==report.pageId)return false;
  const issue=report.issues[index];if(!issue||!editor.getShape(issue.id))return false;
  editor.complete();editor.setCurrentTool('select');
  if(report.revision!==preflightRevision(editor))return false;
  const related = issue.relatedIds ?? (issue.otherId ? [issue.otherId] : []);
  editor.setSelectedShapes([...new Set([issue.id, ...related.filter(id => !!editor.getShape(id))])]);
  if (issue.sharedSegment) {
    const { from, to } = issue.sharedSegment, padding = 24;
    editor.zoomToBounds(new Box(
      Math.min(from.x, to.x) - padding, Math.min(from.y, to.y) - padding,
      Math.abs(from.x - to.x) + padding * 2, Math.abs(from.y - to.y) + padding * 2,
    ));
    drawingPreflightHighlight(editor).set({ pageId: report.pageId, revision: report.revision, segment: issue.sharedSegment });
  } else fitDrawingSelection(editor);
  return true;
}

/** Export the objects from the check, even after Locate changes the selection. */
export function capturePreflightDxfScope(editor: Editor, report: DrawingPreflight): PreflightDxfScope | null {
  if (!report.checked || report.pageId !== editor.getCurrentPageId() || report.revision !== preflightRevision(editor)) return null;
  return { pageId: report.pageId, shapeIds: [...report.sourceIds], revision: report.revision };
}
