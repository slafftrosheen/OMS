import { multiplyMatrix, rectangularClipContainsBounds, type VectorClip, type VectorMatrix } from './cad-appearance';
import { CAD_PLAN_GEOMETRY_LIMITS, curveBounds, nodeAt, validContours } from './cad-curves';
import { VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorDocument } from './cad-paint';
import { SVG_MM_PER_PIXEL, SVG_NS, svgLength, svgNumbers, svgTransform, svgViewport } from './cad-svg-coordinates';
import { SVG_SHAPES, svgContours } from './cad-svg-path';

export const SVG_IMPORT_LIMIT = 8 * 1024 * 1024;

const inherited = [
  'color', 'fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'fill-rule',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'visibility',
] as const;
type Style = Partial<Record<typeof inherited[number], string>>;
const passive = new Set(['title', 'desc', 'metadata', 'defs']);
const unsupportedEffects = ['mask', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'mix-blend-mode'];

function styleReader(element: Element) {
  const style = new Map((element.getAttribute('style') ?? '').split(';').flatMap(declaration => {
    const colon = declaration.indexOf(':');
    return colon < 0 ? [] : [[declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim()] as const];
  }));
  return (name: string) => style.get(name) ?? element.getAttribute(name)?.trim();
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function alpha(value = '1') {
  const result = value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
  if (!Number.isFinite(result) || value === '') throw new Error('svg-format');
  return clamp(result);
}

function normalizedColor(raw: string): { ink: string; a: number } | null {
  const value = raw.toLowerCase();
  if (value === 'none' || value === 'transparent') return { ink: 'none', a: 1 };
  if (value === 'black' || value === 'white') return { ink: value === 'black' ? '#000000' : '#ffffff', a: 1 };
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(value)) {
    const hex = value.length < 6 ? [...value.slice(1)].map(n => n + n).join('') : value.slice(1);
    return { ink: '#' + hex.slice(0, 6), a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([^, /]+)[,\s]+([^, /]+)[,\s]+([^, /]+)(?:[, /]+([^, /]+))?\s*\)$/.exec(value);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(channel => channel.endsWith('%') ? Number(channel.slice(0, -1)) / 100 : Number(channel) / 255);
  if (!channels.every(Number.isFinite)) return null;
  return { ink: '#' + channels.map(channel => Math.round(clamp(channel) * 255).toString(16).padStart(2, '0')).join(''), a: alpha(rgb[4]) };
}

function savePaint(style: Style, scale: number, opacity: number, vectorEffect: string | undefined,
  color: (value: string) => { ink: string; a: number } | null, warnings: Set<string>) {
  const current = style.color ?? 'black';
  const parse = (value: string) => {
    const ink = color(value.toLowerCase() === 'currentcolor' ? current : value);
    if (!ink) warnings.add('svg-paint');
    return ink ?? { ink: 'none', a: 1 };
  };
  const fill = parse(style.fill ?? 'black'), stroke = parse(style.stroke ?? 'none');
  const width = svgLength(style['stroke-width'] ?? '1');
  const hasStroke = stroke.ink !== 'none' && width > 0;
  let dash: number[] = [], dashOffset = 0;
  if (hasStroke) {
    const pattern = style['stroke-dasharray'];
    if (pattern && pattern !== 'none') {
      dash = pattern.split(/[\s,]+/).map(svgLength);
      if (!dash.some(n => n > 0)) dash = [];
    }
    dashOffset = svgLength(style['stroke-dashoffset'] ?? '0');
  }
  const strokeScale = vectorEffect === 'non-scaling-stroke' ? 1 : scale;
  const fillOpacity = opacity * fill.a * alpha(style['fill-opacity']);
  const strokeOpacity = opacity * stroke.a * alpha(style['stroke-opacity']);
  if (opacity < 1 && fill.ink !== 'none' && hasStroke) warnings.add('svg-opacity');
  return {
    ...VECTOR_DEFAULT_PAINT,
    fill: fillOpacity ? fill.ink : 'none',
    stroke: hasStroke && strokeOpacity ? stroke.ink : 'none',
    fillOpacity, strokeOpacity,
    strokeWidth: Math.max(0, width) * strokeScale,
    lineCap: (style['stroke-linecap'] ?? 'butt') as typeof VECTOR_DEFAULT_PAINT.lineCap,
    lineJoin: (style['stroke-linejoin'] ?? 'miter') as typeof VECTOR_DEFAULT_PAINT.lineJoin,
    miterLimit: Number(style['stroke-miterlimit'] ?? 4),
    dash: dash.map(n => n * strokeScale), dashOffset: dashOffset * strokeScale,
  };
}

/** Read detached XML and produce only numeric geometry and allow-listed paint.
 * The document, stylesheets and resource references never reach the canvas. */
export function readVectorSvg(source: string) {
  if (source.length > SVG_IMPORT_LIMIT) throw new Error('svg-input-limit');
  if (/<!DOCTYPE/i.test(source)) throw new Error('svg-format');
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = xml.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI && root.namespaceURI !== SVG_NS || xml.querySelector('parsererror'))
    throw new Error('svg-format');
  const { width, height, matrix, estimated } = svgViewport(root);
  const warnings = new Set<string>();
  if (estimated) warnings.add('svg-estimated-size');
  if (xml.querySelector('style') || Array.from(xml.childNodes).some(n => n.nodeName === 'xml-stylesheet'))
    warnings.add('svg-style');
  const paths: VectorDocument['paths'] = [], ids = new Map<string, Element | null>();
  const elements = xml.getElementsByTagName('*');
  if (elements.length > 10_000) throw new Error('limit');
  for (const element of elements) {
    if (element.id) ids.set(element.id, ids.has(element.id) ? null : element);
  }
  const viewportClip: VectorClip = {
    contours: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }].map(nodeAt) }],
    fillRule: 'nonzero',
  };
  let count = 0, nodes = 0;
  const colors = new Map<string, ReturnType<typeof normalizedColor>>();
  let context: CanvasRenderingContext2D | null | undefined;
  const color = (value: string) => {
    if (colors.has(value)) return colors.get(value)!;
    let result = normalizedColor(value);
    // A detached canvas normalizes CSS names and additional solid color formats
    // without resolving resources, CSS variables or styles from the source DOM.
    if (!result && !/url\(|var\(|currentcolor|inherit/i.test(value)) {
      context ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
      if (context) {
        context.fillStyle = '#010203';
        context.fillStyle = value;
        const first = context.fillStyle;
        context.fillStyle = '#a1a2a3';
        context.fillStyle = value;
        if (first === context.fillStyle) result = normalizedColor(String(first));
      }
    }
    colors.set(value, result);
    return result;
  };

  function clip(value: string, transform: VectorMatrix): VectorClip | null {
    const match = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value);
    const target = match && ids.get(match[1]);
    if (!target || target.namespaceURI !== root.namespaceURI || target.localName !== 'clipPath' ||
        !['', 'userSpaceOnUse'].includes(target.getAttribute('clipPathUnits') ?? '') || target.children.length !== 1) return null;
    const child = target.children[0], style = styleReader(child), clipStyle = styleReader(target);
    if (child.namespaceURI !== root.namespaceURI || !SVG_SHAPES.has(child.localName) ||
        style('clip-path') || clipStyle('clip-path') || style('display') === 'none' || style('visibility') === 'hidden') return null;
    const m = multiplyMatrix(multiplyMatrix(transform, svgTransform(clipStyle('transform') ?? null)), svgTransform(style('transform') ?? null));
    const contours = svgContours(child, m, warnings);
    return validContours(contours) ? {
      contours: contours.map(c => ({ ...c, closed: true })),
      fillRule: (style('clip-rule') ?? clipStyle('clip-rule')) === 'evenodd' ? 'evenodd' : 'nonzero',
    } : null;
  }

  function visit(element: Element, parent: VectorMatrix, styles: Style, clips: VectorClip[], opacity: number, depth: number) {
    if (depth > 64) throw new Error('limit');
    const tag = element.localName;
    if (passive.has(tag) || tag === 'style') return;
    if (element.namespaceURI !== root.namespaceURI || !SVG_SHAPES.has(tag) && tag !== 'g' && element !== root) {
      warnings.add(tag === 'text' ? 'svg-text' : tag === 'image' ? 'svg-image' : 'svg-elements');
      return;
    }
    const attr = styleReader(element);
    if (attr('display') === 'none') return;
    const resolved = { ...styles };
    for (const key of inherited) {
      const value = attr(key);
      if (value !== undefined && value !== 'inherit') resolved[key] = value;
    }
    try {
      const transform = multiplyMatrix(parent, svgTransform(attr('transform') ?? null));
      const ownOpacity = alpha(attr('opacity'));
      if (!ownOpacity || Math.abs(transform[0] * transform[3] - transform[1] * transform[2]) === 0) return;
      if (unsupportedEffects.some(key => attr(key) && !['none', 'normal'].includes(attr(key)!))) {
        warnings.add('svg-effects');
        return;
      }
      const clipPath = attr('clip-path');
      if (clipPath && clipPath !== 'none') {
        if (clips.length >= 32) throw new Error('limit');
        const next = clip(clipPath, transform);
        if (!next) { warnings.add('svg-effects'); return; }
        clips = [...clips, next];
      }
      if (tag === 'g' || element === root) {
        if (opacity * ownOpacity < 1 && element.children.length > 1) warnings.add('svg-opacity');
        for (const child of element.children) visit(child, transform, resolved, clips, opacity * ownOpacity, depth + 1);
        return;
      }
      if (resolved.visibility === 'hidden' || resolved.visibility === 'collapse') return;
      let contours = svgContours(element, transform, warnings);
      if (!contours.length) return;
      if (!validContours(contours)) { warnings.add('svg-geometry'); return; }
      const a = Math.hypot(transform[0], transform[1]), b = Math.hypot(transform[2], transform[3]);
      const vectorEffect = attr('vector-effect');
      const paint = savePaint(resolved, a, opacity * ownOpacity, vectorEffect, color, warnings);
      if (tag === 'line') paint.fill = 'none';
      if (paint.stroke !== 'none' && vectorEffect !== 'non-scaling-stroke' &&
          (Math.abs(a - b) > 1e-8 * Math.max(a, b) ||
          Math.abs(transform[0] * transform[2] + transform[1] * transform[3]) > 1e-8 * a * b)) {
        warnings.add('svg-stroke');
        paint.stroke = 'none';
      }
      if (paint.fill === 'none' && paint.stroke === 'none') return;
      // SVG closes the fill boundary implicitly. Keep an authored open
      // stroke open, but retain the visible closure for fill-only artwork.
      if (paint.stroke === 'none') {
        contours = contours.filter(c => c.nodes.length > 2 || c.nodes.some(n => n.inX || n.inY || n.outX || n.outY))
          .map(c => c.closed ? c : { ...c, closed: true });
        if (!contours.length) return;
      }
      const bounds = curveBounds(contours);
      const retained = clips.filter(c => !rectangularClipContainsBounds(c, bounds,
        paint.stroke === 'none' ? 0 : paint.strokeWidth * paint.miterLimit / 2));
      const painted = retained.length ? { ...paint, clips: retained } : paint;
      if (!validVectorPaint(painted)) { warnings.add('svg-paint'); return; }
      nodes += contours.reduce((sum, shape) => sum + shape.nodes.length, 0);
      count += contours.length;
      if (nodes > CAD_PLAN_GEOMETRY_LIMITS.maxNodes || count > CAD_PLAN_GEOMETRY_LIMITS.maxContours || paths.length >= 512)
        throw new Error('limit');
      paths.push({ contours, paint: painted, fillRule: resolved['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero' });
    } catch (error) {
      if (error instanceof Error && error.message === 'limit') throw error;
      warnings.add('svg-geometry');
    }
  }
  visit(root, matrix, {}, [viewportClip], 1, 0);
  return { document: { paths, width, height, warnings: [...warnings] } satisfies VectorDocument, widthMm: width * SVG_MM_PER_PIXEL };
}
