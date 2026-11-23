import { multiplyMatrix, validAppearance, type VectorGradient, type VectorMatrix } from './cad-appearance';
import { svgDiagonal, svgRelativeLength, svgTransform, SVG_IDENTITY } from './cad-svg-coordinates';
import { svgHref, svgLocalFragment } from './cad-svg-references';

type SvgColor = { ink: string; a: number };
export type SvgGradientFill = SvgColor & { gradient?: VectorGradient };
type Bounds = { x: number; y: number; w: number; h: number };
type GradientInput = {
  id: string | undefined;
  ids: ReadonlyMap<string, Element | null>;
  namespace: string | null;
  style: (element: Element) => (property: string) => string | undefined;
  color: (value: string) => SvgColor | null;
  alpha: (value?: string) => number;
  viewport: { width: number; height: number };
  bounds: Bounds;
  transform: VectorMatrix;
};

const gradientTags = new Set(['linearGradient', 'radialGradient']);
const inheritedValue = /^(?:inherit|unset|currentcolor)$/i;

/** Only local URLs may resolve definitions. Split off the authored solid fallback. */
export function svgPaintReference(value: string) {
  const match = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)(?:\s+(.+))?$/i.exec(value.trim());
  return match ? { id: svgLocalFragment(match[1] ?? match[2] ?? match[3]), fallback: match[4] } : null;
}

function gradientChain(input: GradientInput): Element[] {
  const chain: Element[] = [], visited = new Set<Element>();
  let id = input.id;
  while (id) {
    const element = input.ids.get(id);
    if (!element || !gradientTags.has(element.localName) || element.namespaceURI !== input.namespace ||
        chain.length >= 32 || visited.has(element)) throw new Error('svg-gradient');
    visited.add(element);
    chain.push(element);
    const href = svgHref(element);
    if (!href) break;
    id = svgLocalFragment(href);
    if (!id) throw new Error('svg-gradient');
  }
  if (!chain.length) throw new Error('svg-gradient');
  return chain;
}

function inheritedStyle(input: GradientInput, start: Element, property: string, initial: string) {
  for (let node: Element | null = start; node; node = node.parentElement) {
    const value = input.style(node)(property);
    if (!value || inheritedValue.test(value)) continue;
    return value.toLowerCase() === 'initial' ? initial : value;
  }
  return initial;
}

function gradientStops(chain: Element[], input: GradientInput) {
  const stops: Array<{ offset: number; color: string }> = [];
  let opacity: number | undefined;
  const source = chain.find(element => Array.from(element.children).some(c => c.localName === 'stop' && c.namespaceURI === input.namespace));
  if (!source) return { stops, opacity: 1 };
  // Templated stops inherit as children of the referencing gradient.
  let gradientColor: string | undefined;
  for (const child of source.children) {
    if (child.namespaceURI !== input.namespace || child.localName !== 'stop') continue;
    const attr = input.style(child);
    const offset = Math.max(stops.at(-1)?.offset ?? 0, input.alpha(child.getAttribute('offset') ?? '0'));
    const raw = (attr('stop-color') ?? 'black').trim();
    let value = raw;
    if (raw.toLowerCase() === 'currentcolor') {
      const ownColor = attr('color');
      value = ownColor && !inheritedValue.test(ownColor) ? ownColor
        : (gradientColor ??= inheritedStyle(input, chain[0], 'color', 'black'));
      if (value.toLowerCase() === 'initial') value = 'black';
    }
    const c = input.color(value);
    if (!c) throw new Error('svg-gradient');
    const localOpacity = (c.ink === 'none' ? 0 : c.a) * input.alpha(attr('stop-opacity'));
    opacity ??= localOpacity;
    if (Math.abs(opacity - localOpacity) > 1e-9) throw new Error('svg-gradient');
    const stop = { offset, color: c.ink === 'none' ? '#000000' : c.ink };
    const previous = stops.at(-1);
    if (previous?.offset === offset && previous.color === stop.color) continue;
    stops.push(stop);
    if (stops.length > 256) throw new Error('svg-gradient');
  }
  return { stops, opacity: opacity ?? 1 };
}

/** Convert SVG paint coordinates to the canvas's existing affine gradient model. */
export function readSvgGradient(input: GradientInput): SvgGradientFill | null {
  try {
    const chain = gradientChain(input), radial = chain[0].localName === 'radialGradient';
    const attr = (name: string, elements = chain) => elements.find(element => element.hasAttribute(name))?.getAttribute(name)?.trim();
    const interpolation = inheritedStyle(input, chain[0], 'color-interpolation', 'sRGB');
    if (!['auto', 'srgb'].includes(interpolation.toLowerCase())) return null;
    if ((attr('spreadMethod') ?? 'pad') !== 'pad') return null;
    const units = attr('gradientUnits') ?? 'objectBoundingBox';
    if (units !== 'objectBoundingBox' && units !== 'userSpaceOnUse') return null;
    const objectBox = units === 'objectBoundingBox';
    const { x, y, w, h } = input.bounds;
    if (objectBox && (!(w > 0) || !(h > 0))) return { ink: 'none', a: 1 };
    const { stops, opacity } = gradientStops(chain, input);
    if (!stops.length || !opacity) return { ink: 'none', a: 1 };
    const solid = { ink: stops.at(-1)!.color, a: opacity };
    if (stops.length === 1) return solid;
    const base: VectorMatrix = objectBox ? [w, 0, 0, h, x, y] : SVG_IDENTITY;
    const m = multiplyMatrix(multiplyMatrix(input.transform, base), svgTransform(attr('gradientTransform') ?? null));
    const viewport = objectBox ? { width: 1, height: 1 } : input.viewport;
    const radius = svgDiagonal(viewport);
    const matching = chain.filter(element => element.localName === chain[0].localName);
    const coordinate = (name: string) => attr(name, matching);
    const read = (key: string, fallback: string, extent: number) => svgRelativeLength(coordinate(key) ?? fallback, extent, objectBox);
    const pair = (x: string, y: string, dx: string, dy: string): [number, number] =>
      [read(x, dx, viewport.width), read(y, dy, viewport.height)];
    const cx = coordinate('cx') ?? '50%', cy = coordinate('cy') ?? '50%';
    const start = radial ? pair('fx', 'fy', cx, cy) : pair('x1', 'y1', '0%', '0%');
    const end = radial ? pair('cx', 'cy', cx, cy) : pair('x2', 'y2', '100%', '0%');
    const r0 = radial ? read('fr', '0', radius) : 0, r1 = radial ? read('r', '50%', radius) : 0;
    const centers = Math.hypot(start[0] - end[0], start[1] - end[1]);
    if ((!radial && centers === 0) || (radial && r1 === 0 && r0 === 0)) return solid;
    // Canvas, PDF and EPS share this representation for nested radial circles.
    if (radial && (r0 < 0 || r0 >= r1 || r0 + centers > r1)) return null;
    if (stops[0].offset > 0) stops.unshift({ ...stops[0], offset: 0 });
    if (stops.at(-1)!.offset < 1) stops.push({ ...stops.at(-1)!, offset: 1 });
    const gradient: VectorGradient = { type: radial ? 'radial' : 'linear', matrix: m, start, end, r0, r1, stops };
    return validAppearance({ gradient }) ? { ink: 'none', a: opacity, gradient } : null;
  } catch {
    return null;
  }
}
