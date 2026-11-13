import {getShapeDrawingFontId, getLoadedDrawingFont, drawingFontFamily} from './drawing-fonts';
import { selectedTextGuide, type CadTextGuide, type TextGuide } from './cad-text-guide';
import { DefaultFontFamilies, type Editor, type TLShapeId, type TLTextShape } from '@tldraw/tldraw';
import { drawingTextBaseline, drawingTextLineHeight, getDrawingTextSpacing, withDrawingTextSpacing } from './drawing-text-spacing';
import assetUrls from './tldraw-asset-urls.json';
import { cadPointToCanvas, unitLengthToCanvas, cadMmPerPixel, type CadSettings } from './cad-settings';
import { curveBounds, mapContours, nodeAt, type CadContour } from './cad-curves';
import { assertCadEditable, cadRevision, makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';

export interface CadTextOptions {
  text: string;
  font: string;
  fontData?: ArrayBuffer;
  height: number;
  x: number;
  y: number;
  keepSource: boolean;
  sourceId?: string;
  layout?: Partial<CadTextLayout>;
  arc?: CadTextArc;
  guide?: CadTextGuide;
}
export interface CadTextArc { radius: number; angle: number; direction: 'clockwise' | 'counterclockwise' }
export interface CadTextPlan extends CadPlan {
  guideText?: { lengthMm: number; advanceMm: number; offsetMm: number; distanceMm: number; reverse: boolean; closed: boolean; guideId: string };
  arcText?: { radiusMm: number; advanceMm: number; sweepDegrees: number; angle: number; direction: CadTextArc['direction'] };
}
interface GlyphPlacement { contours: CadContour[]; center: number }
interface GlyphRun { contours: CadContour[]; advance: number; glyphs: GlyphPlacement[]; horizontal: boolean }
export interface CadTextLayout { align: 'start' | 'middle' | 'end'; letterSpacing: number; lineHeight: number }
export const DEFAULT_TEXT_LAYOUT: CadTextLayout = { align: 'start', letterSpacing: 0, lineHeight: 1.35 };
export function validateCadTextLayout(value: Partial<CadTextLayout> = {}): CadTextLayout {
  const layout = { ...DEFAULT_TEXT_LAYOUT, ...value };
  if (!['start', 'middle', 'end'].includes(layout.align) || !Number.isFinite(layout.letterSpacing) || layout.letterSpacing < -50 || layout.letterSpacing > 200 || !Number.isFinite(layout.lineHeight) || layout.lineHeight < 0.5 || layout.lineHeight > 5) throw new CadOperationError('geometry');
  return layout;
}
// tldraw 2.4 text sizes; not exported by its public runtime barrel.
const FONT_SIZES = { s: 18, m: 24, l: 36, xl: 44 };
const fonts = {
  sans: assetUrls.fonts.sansSerif,
  serif: assetUrls.fonts.serif,
  mono: assetUrls.fonts.monospace,
  draw: assetUrls.fonts.draw
};
const cache = new Map<string, Promise<any>>();
export async function readCadFont(bytes: ArrayBuffer): Promise<any> {
  if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new CadOperationError('font');
  try {
    const { create } = await import('fontkit');
    const font = create(new Uint8Array(bytes));
    if (typeof font.layout !== 'function' || !Number.isFinite(font.unitsPerEm) || font.unitsPerEm <= 0)
      throw new Error('font');
    return font;
  } catch {
    throw new CadOperationError('font');
  }
}
export async function getCadFont(name: string, bytes?: ArrayBuffer) {
  if (name === 'custom') {
    if (!bytes) throw new CadOperationError('font');
    return readCadFont(bytes);
  }
  if (!fonts[name]) throw new CadOperationError('font');
  if (!cache.has(name))
    cache.set(
      name,
      (async () => {
        const response = await fetch(fonts[name]);
        if (!response.ok) throw new CadOperationError('font');
        return readCadFont(await response.arrayBuffer());
      })().catch((error) => {
        cache.delete(name);
        throw error;
      })
    );
  return cache.get(name)!;
}
function layoutGlyphRun(font: any, text: string, x = 0, baseline = 0, size = 100, letterSpacing = 0, browserTracking = false): GlyphRun {
  // SVG text can be longer than a CAD lettering operation. Keep conversion's
  // public 500-character limit, but do not make adding spacing break SVG export
  // of a longer editable label (the editor accepts up to 10,000 characters).
  if ([...text].length > (browserTracking ? 10000 : 500) || !Number.isFinite(size) || size <= 0) throw new CadOperationError('limit');
  for (const char of text)
    if (!/\s/u.test(char) && !font.hasGlyphForCodePoint(char.codePointAt(0)))
      throw new CadOperationError('missing-glyph');
  const run = font.layout(text, browserTracking && letterSpacing ? { liga: false, clig: false } : undefined),
    scale = size / font.unitsPerEm;
  const result: CadContour[] = [], glyphs: GlyphPlacement[] = [];
  let clusterCenter = 0, horizontal = true;
  let advanceX = 0,
    advanceY = 0,
    total = 0, advancing = 0;
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i],
      position = run.positions[i];
    // Keep shaped ligatures intact and avoid inserting space before zero-advance
    // combining marks. Tracking is added at the next advancing glyph instead.
    if (position.xAdvance !== 0 && advancing++ > 0) advanceX += letterSpacing / 100 * font.unitsPerEm;
    if (!glyph.id && text.trim()) throw new CadOperationError('missing-glyph');
    const firstContour = result.length;
    if (![position.xAdvance, position.yAdvance, position.xOffset, position.yOffset].every(Number.isFinite)) throw new CadOperationError('font');
    if (position.xAdvance !== 0 || !glyphs.length) clusterCenter = (advanceX + position.xAdvance / 2) * scale;
    if (position.yAdvance !== 0 || position.xAdvance < 0) horizontal = false;
    let contour: CadContour | null = null;
    const point = (a: number, b: number) => ({
      x: x + (advanceX + position.xOffset + a) * scale,
      y: baseline - (advanceY + position.yOffset + b) * scale
    });
    for (const { command, args } of glyph.path.commands) {
      if (++total > (browserTracking ? 600000 : 15000)) throw new CadOperationError('limit');
      if (command === 'moveTo') {
        contour = { closed: false, nodes: [nodeAt(point(args[0], args[1]))] };
        result.push(contour);
        continue;
      }
      if (!contour) throw new CadOperationError('font');
      if (command === 'closePath') {
        const first = contour.nodes[0],
          last = contour.nodes.at(-1)!;
        if (contour.nodes.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-8) {
          first.inX = last.inX;
          first.inY = last.inY;
          contour.nodes.pop();
        }
        contour.closed = true;
        continue;
      }
      const previous = contour.nodes.at(-1)!;
      const end =
        command === 'lineTo'
          ? point(args[0], args[1])
          : command === 'quadraticCurveTo'
            ? point(args[2], args[3])
            : command === 'bezierCurveTo'
              ? point(args[4], args[5])
              : null;
      if (!end) throw new CadOperationError('font');
      const node = nodeAt(end);
      if (command === 'quadraticCurveTo') {
        const control = point(args[0], args[1]);
        previous.outX = ((control.x - previous.x) * 2) / 3;
        previous.outY = ((control.y - previous.y) * 2) / 3;
        node.inX = ((control.x - node.x) * 2) / 3;
        node.inY = ((control.y - node.y) * 2) / 3;
      } else if (command === 'bezierCurveTo') {
        const a = point(args[0], args[1]),
          b = point(args[2], args[3]);
        previous.outX = a.x - previous.x;
        previous.outY = a.y - previous.y;
        node.inX = b.x - node.x;
        node.inY = b.y - node.y;
      }
      contour.nodes.push(node);
    }
    glyphs.push({ contours: result.slice(firstContour).filter(c => c.nodes.length >= 2), center: clusterCenter });
    advanceX += position.xAdvance;
    advanceY += position.yAdvance;
  }
  return { contours: result.filter((c) => c.nodes.length >= 2), advance: advanceX * scale, glyphs, horizontal };
}
export const isCadTextSingleLine = (text: string) => !/[\r\n\u2028\u2029]/u.test(text);
export function glyphRunContours(font: any, text: string, x = 0, baseline = 0, size = 100, letterSpacing = 0): CadContour[] {
  return layoutGlyphRun(font, text, x, baseline, size, letterSpacing, true).contours;
}
/** New outline text uses shaped line advances for alignment, including whitespace. */
export function layoutCadText(font: any, text: string, options: Partial<CadTextLayout> = {}): CadContour[] {
  const layout = validateCadTextLayout(options);
  if ([...text].length > 500 || text.split('\n').length > 20) throw new CadOperationError('limit');
  const lines = text.split('\n').map((line, i) => layoutGlyphRun(font, line, 0, i * 100 * layout.lineHeight, 100, layout.letterSpacing));
  const width = Math.max(0, ...lines.map(line => line.advance));
  return lines.flatMap(line => {
    const dx = (width - line.advance) * (layout.align === 'end' ? 1 : layout.align === 'middle' ? 0.5 : 0);
    return mapContours(line.contours, point => ({ x: point.x + dx, y: point.y }));
  });
}
/** Place shaped glyphs rigidly on a circular baseline. Zero-advance marks use
 * their preceding glyph's rotation; Bézier handles undergo the same rigid map.
 * Height measures the straight ink run, before bending, so radius is never
 * silently recalibrated to force the curved result into a target bounding box. */
export function layoutCadArcText(font: any, text: string, options: CadTextArc & {
  height: number; x: number; y: number; layout?: Partial<CadTextLayout>;
}): { contours: CadContour[]; advance: number; sweepDegrees: number } {
  if (!isCadTextSingleLine(text)) throw new CadOperationError('arc-text-line');
  if (![options.radius, options.height, options.x, options.y, options.angle].every(Number.isFinite) ||
      options.radius <= 0 || options.height <= 0 || Math.abs(options.angle) > 360 ||
      !['clockwise', 'counterclockwise'].includes(options.direction)) throw new CadOperationError('geometry');
  const layout = validateCadTextLayout(options.layout);
  const run = layoutGlyphRun(font, text, 0, 0, 100, layout.letterSpacing);
  if (!run.horizontal) throw new CadOperationError('arc-text-layout');
  const bounds = curveBounds(run.contours);
  if (!run.contours.length || !bounds.h) throw new CadOperationError('geometry');
  const scale = options.height / bounds.h, advance = run.advance * scale;
  const sweep = advance / options.radius;
  if (advance <= 0) throw new CadOperationError('arc-text-advance');
  if (!Number.isFinite(sweep) || sweep > 2 * Math.PI + 1e-12) throw new CadOperationError('arc-text-fit');
  const anchor = advance * (layout.align === 'middle' ? 0.5 : layout.align === 'end' ? 1 : 0);
  const direction = options.direction === 'clockwise' ? -1 : 1;
  const contours = run.glyphs.flatMap(glyph => {
    const center = glyph.center * scale;
    const angle = options.angle * Math.PI / 180 + direction * (center - anchor) / options.radius;
    const x = options.x + options.radius * Math.cos(angle), y = options.y - options.radius * Math.sin(angle);
    const cos = -direction * Math.sin(angle), sin = -direction * Math.cos(angle);
    return mapContours(glyph.contours, point => {
      const dx = point.x * scale - center, dy = point.y * scale;
      return { x: x + cos * dx - sin * dy, y: y + sin * dx + cos * dy };
    });
  });
  return { contours, advance, sweepDegrees: sweep * 180 / Math.PI };
}
/** Shaped glyphs move rigidly along the guide; the guide itself is retained. */
export function layoutCadGuideText(font: any, text: string, guide: TextGuide, options: {
  height: number; offset: number; distance: number; reverse: boolean; layout?: Partial<CadTextLayout>;
}): { contours: CadContour[]; advance: number } {
  if (!isCadTextSingleLine(text)) throw new CadOperationError('arc-text-line');
  if (![options.height, options.offset, options.distance].every(Number.isFinite) || options.height <= 0 || typeof options.reverse !== 'boolean') throw new CadOperationError('geometry');
  const layout=validateCadTextLayout(options.layout),run=layoutGlyphRun(font,text,0,0,100,layout.letterSpacing);
  if(!run.horizontal)throw new CadOperationError('guide-layout');
  const bounds=curveBounds(run.contours);
  if(!run.contours.length||!bounds.h)throw new CadOperationError('geometry');
  const scale=options.height/bounds.h,advance=run.advance*scale;
  if(!Number.isFinite(advance)||advance<=0)throw new CadOperationError('arc-text-advance');
  const start=(guide.length-advance)*(layout.align==='middle'?.5:layout.align==='end'?1:0)+options.offset;
  if(advance>guide.length+1e-9||!guide.closed&&(start < -1e-9||start+advance>guide.length+1e-9))throw new CadOperationError('guide-fit');
  const contours=run.glyphs.flatMap(glyph=>{
    const center=glyph.center*scale,raw=start+center;
    const along=guide.closed?((raw%guide.length)+guide.length)%guide.length:raw;
    const {point,tangent}=guide.sample(options.reverse?guide.length-along:along),sign=options.reverse?-1:1;
    const tx=tangent.x*sign,ty=tangent.y*sign;
    return mapContours(glyph.contours,p=>{
      const dx=p.x*scale-center,dy=p.y*scale-options.distance;
      return {x:point.x+tx*dx-ty*dy,y:point.y+ty*dx+tx*dy};
    });
  });
  return {contours,advance};
}
export async function prepareCadText(editor: Editor, settings: CadSettings, options: CadTextOptions): Promise<CadTextPlan> {
  const revision = cadRevision(editor),
    source = options.sourceId ? editor.getShape(options.sourceId as TLShapeId) : null;
  assertCadEditable(editor, source ? [source.id] : []);
  if (options.arc && options.guide) throw new CadOperationError('geometry');
  if (options.sourceId && (options.arc || options.guide)) throw new CadOperationError('selection');
  if (options.sourceId && source?.type !== 'text') throw new CadOperationError('selection');
  const p = source?.props as any,
    text = String(source ? p.text : options.text).replace(/\r\n?/g, '\n').normalize('NFC');
  if (!text.trim() || [...text].length > 500 || text.split('\n').length > 20) throw new CadOperationError('limit');
  const layout = source ? null : validateCadTextLayout(options.layout);
  const guide = options.guide ? selectedTextGuide(editor, settings, options.guide.shapeId) : undefined;
  const uploadedId = source ? getShapeDrawingFontId(source) : options.font.startsWith('omsfont-') ? options.font : null;
  const uploaded = uploadedId ? getLoadedDrawingFont(editor, uploadedId) : undefined;
  if (uploadedId && !uploaded) throw new CadOperationError('font');
  const font = uploaded?.font ?? await getCadFont(source ? p.font : options.font, options.fontData);
  let contours: CadContour[] = [];
  let arcText: CadTextPlan['arcText'], guideText: CadTextPlan['guideText'];
  if (source) {
    const fontSize = FONT_SIZES[p.size],
      bounds = editor.getShapeGeometry(source).bounds;
    const spacing = getDrawingTextSpacing(source as TLTextShape);
    const spans = withDrawingTextSpacing(editor, spacing, fontSize, () => editor.textMeasure.measureTextSpans(text, {
      fontFamily: uploaded ? drawingFontFamily(uploaded.record) : DefaultFontFamilies[p.font],
      fontSize,
      lineHeight: drawingTextLineHeight(fontSize, spacing),
      fontStyle: 'normal',
      fontWeight: 'normal',
      textAlign: p.textAlign,
      width: Math.ceil(bounds.w / p.scale),
      height: Math.ceil(bounds.h / p.scale),
      padding: 0,
      overflow: 'wrap'
    }));
    const baseline = drawingTextBaseline(font, fontSize, spacing, spans[0]?.box.y ?? 0);
    for (const span of spans)
      contours.push(...glyphRunContours(font, span.text, span.box.x, span.box.y + baseline, fontSize, spacing.letterSpacing));
    const matrix = editor.getShapePageTransform(source);
    contours = mapContours(contours, (point) => matrix.applyToPoint({ x: point.x * p.scale, y: point.y * p.scale }));
  } else if (guide && options.guide) {
    const offset=unitLengthToCanvas(options.guide.offset,settings),distance=unitLengthToCanvas(options.guide.distance,settings);
    const result=layoutCadGuideText(font,text,guide,{height:unitLengthToCanvas(options.height,settings),offset,distance,reverse:options.guide.reverse,layout:layout!});
    contours=result.contours;
    const factor=cadMmPerPixel(settings);
    guideText={lengthMm:guide.length*factor,advanceMm:result.advance*factor,offsetMm:offset*factor,distanceMm:distance*factor,
      reverse:options.guide.reverse,closed:guide.closed,guideId:options.guide.shapeId};
  } else if (options.arc) {
    const radius = unitLengthToCanvas(options.arc.radius, settings), origin = cadPointToCanvas(options, settings);
    const result = layoutCadArcText(font, text, { ...options.arc, radius, height: unitLengthToCanvas(options.height, settings),
      x: origin.x, y: origin.y, layout: layout! });
    contours = result.contours;
    arcText = { radiusMm: radius * cadMmPerPixel(settings), advanceMm: result.advance * cadMmPerPixel(settings),
      sweepDegrees: result.sweepDegrees, angle: options.arc.angle, direction: options.arc.direction };
  } else {
    contours = layoutCadText(font, text, layout!);
    const bounds = curveBounds(contours),
      wanted = unitLengthToCanvas(options.height, settings),
      origin = cadPointToCanvas(options, settings);
    if (!bounds.h || !Number.isFinite(wanted) || wanted <= 0) throw new CadOperationError('geometry');
    const scale = wanted / bounds.h;
    contours = mapContours(contours, (point) => ({
      x: origin.x + (point.x - bounds.x) * scale,
      y: origin.y + (point.y - bounds.y - bounds.h) * scale
    }));
  }
  if (cadRevision(editor) !== revision) throw new CadOperationError('stale');
  const plan = makeCadPlan(editor, settings, contours, {
    sourceIds: source ? [source.id] : options.guide ? [options.guide.shapeId] : [],
    removeIds: source && !options.keepSource ? [source.id] : [],
    name: 'Text outlines',
    fillRule: 'nonzero',
    warnings: [
      'font-outline-only',
      ...(source ? ['text-layout-review'] : []),
      ...(arcText ? ['arc-text-review'] : []),
      ...(guideText ? ['guide-text-review'] : []),
      ...(source && options.keepSource ? ['sources-overlap'] : [])
    ],
    shapes: [
      {
        type: 'cad-bezier',
        x: 0,
        y: 0,
        props: { contours, color: p?.color ?? 'black', fillRule: 'nonzero' },
        meta: { omsSourceText: text, omsFontName: font.fullName ?? options.font, ...(layout ? { omsTextLayout: { ...layout } } : {}), ...(arcText ? { omsTextArc: { ...arcText } } : {}), ...(guideText ? { omsTextGuide: { ...guideText } } : {}) }
      }
    ]
  });
  return { ...plan, ...(arcText ? { arcText } : {}), ...(guideText ? { guideText } : {}) };
}
