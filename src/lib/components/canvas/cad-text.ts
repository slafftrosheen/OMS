import { DefaultFontFamilies, type Editor, type TLShapeId } from '@tldraw/tldraw';
import assetUrls from './tldraw-asset-urls.json';
import { cadPointToCanvas, unitLengthToCanvas, type CadSettings } from './cad-settings';
import { curveBounds, mapContours, nodeAt, type CadContour } from './cad-curves';
import { assertCadEditable, cadRevision, makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';

export interface CadTextOptions {
  text: string;
  font: 'sans' | 'serif' | 'mono' | 'draw' | 'custom';
  fontData?: ArrayBuffer;
  height: number;
  x: number;
  y: number;
  keepSource: boolean;
  sourceId?: string;
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
export function glyphRunContours(font: any, text: string, x = 0, baseline = 0, size = 100): CadContour[] {
  if ([...text].length > 500 || !Number.isFinite(size) || size <= 0) throw new CadOperationError('limit');
  for (const char of text)
    if (!/\s/u.test(char) && !font.hasGlyphForCodePoint(char.codePointAt(0)))
      throw new CadOperationError('missing-glyph');
  const run = font.layout(text),
    scale = size / font.unitsPerEm;
  const result: CadContour[] = [];
  let advanceX = 0,
    advanceY = 0,
    total = 0;
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i],
      position = run.positions[i];
    if (!glyph.id && text.trim()) throw new CadOperationError('missing-glyph');
    let contour: CadContour | null = null;
    const point = (a: number, b: number) => ({
      x: x + (advanceX + position.xOffset + a) * scale,
      y: baseline - (advanceY + position.yOffset + b) * scale
    });
    for (const { command, args } of glyph.path.commands) {
      if (++total > 15000) throw new CadOperationError('limit');
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
    advanceX += position.xAdvance;
    advanceY += position.yAdvance;
  }
  return result.filter((c) => c.nodes.length >= 2);
}
export async function prepareCadText(editor: Editor, settings: CadSettings, options: CadTextOptions): Promise<CadPlan> {
  const revision = cadRevision(editor),
    source = options.sourceId ? editor.getShape(options.sourceId as TLShapeId) : null;
  assertCadEditable(editor, source ? [source.id] : []);
  if (options.sourceId && source?.type !== 'text') throw new CadOperationError('selection');
  const p = source?.props as any,
    text = String(source ? p.text : options.text).normalize('NFC');
  if (!text.trim() || [...text].length > 500 || text.split('\n').length > 20) throw new CadOperationError('limit');
  const font = await getCadFont(source ? p.font : options.font, options.fontData);
  let contours: CadContour[] = [];
  if (source) {
    const fontSize = FONT_SIZES[p.size],
      bounds = editor.getShapeGeometry(source).bounds;
    const spans = editor.textMeasure.measureTextSpans(text, {
      fontFamily: DefaultFontFamilies[p.font],
      fontSize,
      lineHeight: 1.35,
      fontStyle: 'normal',
      fontWeight: 'normal',
      textAlign: p.textAlign,
      width: Math.ceil(bounds.w / p.scale),
      height: Math.ceil(bounds.h / p.scale),
      padding: 0,
      overflow: 'wrap'
    });
    const ascent = (font.ascent / font.unitsPerEm) * fontSize,
      descent = (-font.descent / font.unitsPerEm) * fontSize;
    const baseline = (Math.floor(fontSize * 1.35) - ascent - descent) / 2 + ascent;
    for (const span of spans)
      contours.push(...glyphRunContours(font, span.text, span.box.x, span.box.y + baseline, fontSize));
    const matrix = editor.getShapePageTransform(source);
    contours = mapContours(contours, (point) => matrix.applyToPoint({ x: point.x * p.scale, y: point.y * p.scale }));
  } else {
    text.split('\n').forEach((line, i) => contours.push(...glyphRunContours(font, line, 0, i * 135, 100)));
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
  return makeCadPlan(editor, settings, contours, {
    sourceIds: source ? [source.id] : [],
    removeIds: source && !options.keepSource ? [source.id] : [],
    name: 'Text outlines',
    fillRule: 'nonzero',
    warnings: [
      'font-outline-only',
      ...(source ? ['text-layout-review'] : []),
      ...(source && options.keepSource ? ['sources-overlap'] : [])
    ],
    shapes: [
      {
        type: 'cad-bezier',
        x: 0,
        y: 0,
        props: { contours, color: p?.color ?? 'black', fillRule: 'nonzero' },
        meta: { omsSourceText: text, omsFontName: font.fullName ?? options.font }
      }
    ]
  });
}
