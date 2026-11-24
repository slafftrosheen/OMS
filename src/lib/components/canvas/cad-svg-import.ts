import { multiplyMatrix, rectangularClipContainsBounds, type VectorClip, type VectorMatrix } from './cad-appearance';
import { CAD_PLAN_GEOMETRY_LIMITS, curveBounds, nodeAt, validContours, type CadContour } from './cad-curves';
import { VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorDocument, type VectorPaint } from './cad-paint';
import { SVG_MM_PER_PIXEL, SVG_NS, svgDiagonal, svgNestedViewport, svgRelativeLength, svgTransform,
  svgTranslate, svgViewport, type SvgViewportSize } from './cad-svg-coordinates';
import { readSvgGradient, svgPaintReference, type SvgGradientFill } from './cad-svg-gradient';
import { SVG_SHAPES, svgContours, svgTransformedContours } from './cad-svg-path';
import { svgHref, svgLocalFragment } from './cad-svg-references';

export const SVG_IMPORT_LIMIT = 8 * 1024 * 1024;
const MAX_EXPANDED_ELEMENTS = 20_000;

const inherited = [
  'color', 'fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'fill-rule',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'visibility',
] as const;
type Style = Partial<Record<typeof inherited[number], string>>;
type ImportClip = {
  clip: VectorClip;
  viewport?: SvgViewportSize & { inverse: VectorMatrix };
};
type VisitState = {
  transform: VectorMatrix;
  styles: Style;
  clips: ImportClip[];
  opacity: number;
  viewport: SvgViewportSize;
};
type InstanceSize = { width?: string; height?: string };
const passive = new Set(['title', 'desc', 'metadata', 'defs', 'linearGradient', 'radialGradient']);
const containers = new Set(['g', 'svg', 'symbol']);
const unsupportedEffects = ['mask', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'mix-blend-mode'];
const supportedGraphics = (tag: string) => SVG_SHAPES.has(tag) || containers.has(tag) || tag === 'use';

function readStyle(element: Element) {
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
  color: (value: string) => { ink: string; a: number } | null, warnings: Set<string>, viewport: SvgViewportSize,
  gradientFill?: SvgGradientFill) {
  const current = style.color ?? 'black';
  const parse = (value: string) => {
    const reference = svgPaintReference(value);
    if (reference) warnings.add('svg-paint');
    const literal = reference ? reference.fallback ?? 'none' : value;
    const ink = color(literal.toLowerCase() === 'currentcolor' ? current : literal);
    if (!ink) warnings.add('svg-paint');
    return ink ?? { ink: 'none', a: 1 };
  };
  const fill = gradientFill ?? parse(style.fill ?? 'black'), stroke = parse(style.stroke ?? 'none');
  const extent = svgDiagonal(viewport);
  const length = (value: string) => svgRelativeLength(value, extent);
  const width = length(style['stroke-width'] ?? '1');
  const hasStroke = stroke.ink !== 'none' && width > 0;
  let dash: number[] = [], dashOffset = 0;
  if (hasStroke) {
    const pattern = style['stroke-dasharray'];
    if (pattern && pattern !== 'none') {
      dash = pattern.split(/[\s,]+/).map(length);
      if (!dash.some(n => n > 0)) dash = [];
    }
    dashOffset = length(style['stroke-dashoffset'] ?? '0');
  }
  const strokeScale = vectorEffect === 'non-scaling-stroke' ? 1 : scale;
  const fillOpacity = opacity * fill.a * alpha(style['fill-opacity']);
  const strokeOpacity = opacity * stroke.a * alpha(style['stroke-opacity']);
  if (opacity < 1 && fillOpacity && (fill.ink !== 'none' || gradientFill?.gradient) && hasStroke) warnings.add('svg-opacity');
  return {
    ...VECTOR_DEFAULT_PAINT,
    fill: fillOpacity ? fill.ink : 'none',
    ...(fillOpacity && gradientFill?.gradient ? { gradient: gradientFill.gradient } : {}),
    stroke: hasStroke && strokeOpacity ? stroke.ink : 'none',
    fillOpacity, strokeOpacity,
    strokeWidth: Math.max(0, width) * strokeScale,
    lineCap: (style['stroke-linecap'] ?? 'butt') as typeof VECTOR_DEFAULT_PAINT.lineCap,
    lineJoin: (style['stroke-linejoin'] ?? 'miter') as typeof VECTOR_DEFAULT_PAINT.lineJoin,
    miterLimit: Number(style['stroke-miterlimit'] ?? 4),
    dash: dash.map(n => n * strokeScale), dashOffset: dashOffset * strokeScale,
  };
}

function viewportCrop(width: number, height: number, transform?: VectorMatrix): ImportClip {
  const contours = [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }].map(nodeAt) }];
  const clip: VectorClip = { contours: transform ? svgTransformedContours(contours, transform) : contours, fillRule: 'nonzero' };
  if (!transform) return { clip };
  const [a, b, c, d, x, y] = transform, determinant = a * d - b * c;
  const inverse: VectorMatrix = [d / determinant, -b / determinant, -c / determinant, a / determinant,
    (c * y - d * x) / determinant, (b * x - a * y) / determinant];
  return inverse.every(Number.isFinite) ? { clip, viewport: { width, height, inverse } } : { clip };
}

function containsArtwork({ clip, viewport }: ImportClip, contours: CadContour[], bounds: ReturnType<typeof curveBounds>, padding: number) {
  if (rectangularClipContainsBounds(clip, bounds, padding)) return true;
  if (!viewport) return false;
  // Test the actual painted bounds in viewport coordinates. Testing a page
  // bounding box alone would leave redundant clips on rotated cutting curves.
  const local = curveBounds(svgTransformedContours(contours, viewport.inverse));
  const [a, b, c, d] = viewport.inverse;
  const px = padding * Math.hypot(a, c), py = padding * Math.hypot(b, d);
  return local.x - px >= -1e-6 && local.y - py >= -1e-6 &&
    local.x + local.w + px <= viewport.width + 1e-6 && local.y + local.h + py <= viewport.height + 1e-6;
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
  const { width, height, matrix, estimated, userViewport } = svgViewport(root);
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
  const styleCache = new WeakMap<Element, ReturnType<typeof readStyle>>();
  const styleReader = (element: Element) => {
    const cached = styleCache.get(element);
    if (cached) return cached;
    const style = readStyle(element);
    styleCache.set(element, style);
    return style;
  };
  const expanding = new Set<Element>();
  let count = 0, nodes = 0, visited = 0, attributeWork = 0;
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

  function localTarget(id: string | undefined) {
    const target = id && ids.get(id);
    return target && target.namespaceURI === root.namespaceURI ? target : null;
  }

  function useTranslation(attr: ReturnType<typeof readStyle>, viewport: SvgViewportSize) {
    return svgTranslate(svgRelativeLength(attr('x') ?? '0', viewport.width), svgRelativeLength(attr('y') ?? '0', viewport.height));
  }

  function countAttributes(element: Element) {
    for (const attr of element.attributes) attributeWork += attr.value.length;
    if (attributeWork > 4 * SVG_IMPORT_LIMIT) throw new Error('limit');
  }

  function clip(value: string, transform: VectorMatrix, viewport: SvgViewportSize): VectorClip | null {
    const paintRef = svgPaintReference(value);
    const target = !paintRef?.fallback && localTarget(paintRef?.id);
    if (!target || target.localName !== 'clipPath' ||
        !['', 'userSpaceOnUse'].includes(target.getAttribute('clipPathUnits') ?? '') || target.children.length !== 1) return null;
    countAttributes(target);
    const child = target.children[0], childStyle = styleReader(child), clipStyle = styleReader(target);
    if (child.namespaceURI !== root.namespaceURI || childStyle('clip-path') || clipStyle('clip-path') || childStyle('display') === 'none') return null;
    const isUse = child.localName === 'use';
    const shape = isUse ? localTarget(svgLocalFragment(svgHref(child))) : child;
    if (!shape || !SVG_SHAPES.has(shape.localName)) return null;
    countAttributes(child);
    if (isUse) countAttributes(shape);
    const style = styleReader(shape), visibility = style('visibility') ?? childStyle('visibility') ?? clipStyle('visibility');
    if (style('clip-path') || style('display') === 'none' || visibility === 'hidden' || visibility === 'collapse') return null;
    let m = multiplyMatrix(transform, svgTransform(clipStyle('transform') ?? null));
    if (isUse) {
      m = multiplyMatrix(m, svgTransform(childStyle('transform') ?? null));
      m = multiplyMatrix(m, useTranslation(childStyle, viewport));
    }
    m = multiplyMatrix(m, svgTransform(style('transform') ?? null));
    const contours = svgTransformedContours(svgContours(shape, m, viewport, warnings), m);
    return validContours(contours) ? {
      contours: contours.map(c => ({ ...c, closed: true })),
      fillRule: (style('clip-rule') ?? childStyle('clip-rule') ?? clipStyle('clip-rule')) === 'evenodd' ? 'evenodd' : 'nonzero',
    } : null;
  }

  function addClip(clips: ImportClip[], next: ImportClip) {
    if (clips.length >= 32) throw new Error('limit');
    return [...clips, next];
  }

  function visit(element: Element, state: VisitState, depth: number, instance?: InstanceSize) {
    if (++visited > MAX_EXPANDED_ELEMENTS || depth > 64) throw new Error('limit');
    const tag = element.localName;
    if (passive.has(tag) || tag === 'style' || (tag === 'symbol' && !instance)) return;
    if (element.namespaceURI !== root.namespaceURI || !supportedGraphics(tag)) {
      warnings.add(tag === 'text' ? 'svg-text' : tag === 'image' ? 'svg-image' : 'svg-elements');
      return;
    }
    countAttributes(element);
    const attr = styleReader(element);
    if (tag !== 'symbol' && attr('display') === 'none') return;
    const resolved = { ...state.styles };
    for (const key of inherited) {
      const value = attr(key);
      if (value !== undefined && value !== 'inherit') resolved[key] = value;
    }
    try {
      let transform = multiplyMatrix(state.transform, svgTransform(attr('transform') ?? null));
      let { viewport, clips } = state;
      const opacity = state.opacity * alpha(attr('opacity'));
      if (!opacity || transform[0] * transform[3] - transform[1] * transform[2] === 0) return;
      if (unsupportedEffects.some(key => attr(key) && !['none', 'normal'].includes(attr(key)!))) {
        warnings.add('svg-effects');
        return;
      }
      if (tag === 'use') transform = multiplyMatrix(transform, useTranslation(attr, viewport));
      if (element !== root && (tag === 'svg' || tag === 'symbol')) {
        if (tag === 'symbol' && (element.hasAttribute('refX') || element.hasAttribute('refY'))) {
          warnings.add('svg-reference');
          return;
        }
        const nested = svgNestedViewport(element, viewport, attr, instance);
        if (!nested) return;
        const placement = multiplyMatrix(transform, svgTranslate(nested.x, nested.y));
        if (attr('overflow') !== 'visible') clips = addClip(clips, viewportCrop(nested.width, nested.height, placement));
        transform = multiplyMatrix(placement, nested.matrix);
        viewport = nested.userViewport;
      }
      const clipPath = attr('clip-path');
      if (clipPath && clipPath !== 'none') {
        const next = clip(clipPath, transform, viewport);
        if (!next) { warnings.add('svg-effects'); return; }
        clips = addClip(clips, { clip: next });
      }
      if (tag === 'use' || containers.has(tag)) {
        const next = { transform, viewport, styles: resolved, clips, opacity }, first = paths.length;
        if (tag === 'use') {
          const target = localTarget(svgLocalFragment(svgHref(element)));
          if (!target || !supportedGraphics(target.localName) || expanding.has(target) || target.contains(element)) {
            warnings.add('svg-reference');
            return;
          }
          expanding.add(target);
          try { visit(target, next, depth + 1, { width: attr('width'), height: attr('height') }); }
          finally { expanding.delete(target); }
        } else {
          for (const child of element.children) visit(child, next, depth + 1);
        }
        if (opacity < 1 && paths.length - first > 1) warnings.add('svg-opacity');
        return;
      }
      if (resolved.visibility === 'hidden' || resolved.visibility === 'collapse') return;
      const local = svgContours(element, transform, viewport, warnings);
      let contours = svgTransformedContours(local, transform);
      if (!contours.length) return;
      if (!validContours(contours)) { warnings.add('svg-geometry'); return; }
      const a = Math.hypot(transform[0], transform[1]), b = Math.hypot(transform[2], transform[3]);
      const vectorEffect = attr('vector-effect');
      if (tag === 'line') resolved.fill = 'none';
      const fillRef = svgPaintReference(resolved.fill ?? 'black');
      let gradientFill: SvgGradientFill | null = null;
      if (fillRef) {
        gradientFill = readSvgGradient({ id: fillRef.id, ids, namespace: root.namespaceURI, style: styleReader,
          color, alpha, viewport, bounds: curveBounds(local), transform });
        if (!gradientFill) {
          warnings.add('svg-gradient');
          resolved.fill = fillRef.fallback ?? 'none';
        }
      }
      const paint: VectorPaint = savePaint(resolved, a, opacity, vectorEffect, color, warnings, viewport, gradientFill ?? undefined);
      // Our SVG fallback is an ordinary positive stroke for other consumers.
      // Retain the explicit semantic flag when that SVG returns to OMS.
      if (attr('data-oms-hairline') === 'true' && paint.strokeWidth > 0) paint.hairline = true;
      if (paint.stroke !== 'none' && vectorEffect !== 'non-scaling-stroke' &&
          (Math.abs(a - b) > 1e-8 * Math.max(a, b) ||
          Math.abs(transform[0] * transform[2] + transform[1] * transform[3]) > 1e-8 * a * b)) {
        warnings.add('svg-stroke');
        paint.stroke = 'none';
      }
      if (paint.fill === 'none' && !paint.gradient && paint.stroke === 'none') return;
      // SVG closes the fill boundary implicitly. Keep an authored open
      // stroke open, but retain the visible closure for fill-only artwork.
      if (paint.stroke === 'none') {
        contours = contours.filter(c => c.nodes.length > 2 || c.nodes.some(n => n.inX || n.inY || n.outX || n.outY))
          .map(c => c.closed ? c : { ...c, closed: true });
        if (!contours.length) return;
      }
      const bounds = curveBounds(contours);
      const padding = paint.stroke === 'none' ? 0 : paint.strokeWidth * paint.miterLimit / 2;
      const retained = clips.filter(c => !containsArtwork(c, contours, bounds, padding)).map(c => c.clip);
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
  visit(root, { transform: matrix, viewport: userViewport, styles: {}, clips: [viewportCrop(width, height)], opacity: 1 }, 0);
  return { document: { paths, width, height, warnings: [...warnings] } satisfies VectorDocument, widthMm: width * SVG_MM_PER_PIXEL };
}
