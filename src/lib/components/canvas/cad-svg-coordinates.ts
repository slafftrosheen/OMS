import { multiplyMatrix, type VectorMatrix } from './cad-appearance';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const SVG_MM_PER_PIXEL = 25.4 / 96;
export const SVG_IDENTITY: VectorMatrix = [1, 0, 0, 1, 0, 0];
export type SvgViewportSize = { width: number; height: number };
const number = String.raw`[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?`;
const units: Record<string, number> = { '': 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54,
  in: 96, pt: 96 / 72, pc: 16, q: 96 / 101.6 };
const lengthPattern = new RegExp(`^(${number})([a-z]*)$`, 'i');
const unitlessPattern = new RegExp(`^${number}$`);

export function svgRelativeLength(value: string, extent: number, objectBox = false): number {
  value = value.trim();
  const percent = value.endsWith('%');
  if (!percent && !objectBox) return svgLength(value);
  const literal = percent ? value.slice(0, -1) : value;
  if (!unitlessPattern.test(literal)) throw new Error('svg-format');
  const length = Number(literal) * (percent ? extent / 100 : 1);
  if (!Number.isFinite(length)) throw new Error('svg-format');
  return length;
}

export const svgDiagonal = ({ width, height }: SvgViewportSize) => Math.hypot(width, height) / Math.SQRT2;

export function svgLength(value: string): number {
  const match = lengthPattern.exec(value.trim());
  if (!match || !Object.hasOwn(units, match[2].toLowerCase())) throw new Error('svg-format');
  const size = Number(match[1]) * units[match[2].toLowerCase()];
  if (!Number.isFinite(size)) throw new Error('svg-format');
  return size;
}

export function svgNumbers(value: string, limit: number): number[] {
  const matches = value.match(new RegExp(number, 'g')) ?? [];
  if (matches.length > limit) throw new Error('limit');
  if (value.replace(new RegExp(number, 'g'), '').replace(/[\s,]/g, '')) throw new Error('svg-format');
  const values = matches.map(Number);
  if (!values.every(Number.isFinite)) throw new Error('svg-format');
  return values;
}

export const svgTranslate = (x: number, y = 0): VectorMatrix => [1, 0, 0, 1, x, y];

export function svgTransform(value: string | null): VectorMatrix {
  if (!value || value === 'none') return SVG_IDENTITY;
  const expression = /([a-zA-Z]+)\s*\(([^()]*)\)/g;
  let matrix = SVG_IDENTITY, end = 0, count = 0;
  for (const match of value.matchAll(expression)) {
    if (++count > 128 || /[^\s,]/.test(value.slice(end, match.index))) throw new Error('svg-format');
    end = match.index + match[0].length;
    const values = svgNumbers(match[2], 6);
    const [x, y, z] = values;
    const angle = x * Math.PI / 180, length = values.length;
    let next: VectorMatrix;
    if (match[1] === 'matrix' && length === 6) next = values as VectorMatrix;
    else if (match[1] === 'translate' && (length === 1 || length === 2)) next = svgTranslate(x, y);
    else if (match[1] === 'scale' && (length === 1 || length === 2)) next = [x, 0, 0, y ?? x, 0, 0];
    else if (match[1] === 'rotate' && (length === 1 || length === 3)) {
      const c = Math.cos(angle), s = Math.sin(angle);
      next = [c, s, -s, c, 0, 0];
      if (length === 3) next = multiplyMatrix(multiplyMatrix(svgTranslate(y, z), next), svgTranslate(-y, -z));
    } else if (match[1] === 'skewX' && length === 1) next = [1, 0, Math.tan(angle), 1, 0, 0];
    else if (match[1] === 'skewY' && length === 1) next = [1, Math.tan(angle), 0, 1, 0, 0];
    else throw new Error('svg-format');
    matrix = multiplyMatrix(matrix, next);
  }
  if (!count || /[^\s,]/.test(value.slice(end)) || !matrix.every(Number.isFinite)) throw new Error('svg-format');
  return matrix;
}

function svgViewBox(element: Element) {
  const boxText = element.getAttribute('viewBox');
  const box = boxText === null ? null : svgNumbers(boxText, 4);
  if (box && (box.length !== 4 || box[2] <= 0 || box[3] <= 0)) throw new Error('svg-format');
  return box;
}

function mapViewport(element: Element, width: number, height: number, box: number[] | null) {
  if (width > 1e6 || height > 1e6) throw new Error('limit');
  const viewport = { width, height, userViewport: { width: box?.[2] ?? width, height: box?.[3] ?? height } };
  if (!box) return { ...viewport, matrix: SVG_IDENTITY };
  const [x, y, w, h] = box;
  const sx = width / w, sy = height / h;
  const aspect = (element.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim();
  if (aspect === 'none') return { ...viewport, matrix: [sx, 0, 0, sy, -x * sx, -y * sy] as VectorMatrix };
  const alignment = /^x(Min|Mid|Max)Y(Min|Mid|Max)(?:\s+(meet|slice))?$/.exec(aspect);
  if (!alignment) throw new Error('svg-format');
  const scale = alignment[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  const fraction = { Min: 0, Mid: 0.5, Max: 1 };
  const dx = (width - scale * w) * fraction[alignment[1] as keyof typeof fraction] - x * scale;
  const dy = (height - scale * h) * fraction[alignment[2] as keyof typeof fraction] - y * scale;
  return { ...viewport, matrix: [scale, 0, 0, scale, dx, dy] as VectorMatrix };
}

/** Map viewBox user coordinates to the intrinsic CSS-pixel viewport. */
export function svgViewport(root: Element) {
  const box = svgViewBox(root);
  const widthText = root.getAttribute('width')?.trim(), heightText = root.getAttribute('height')?.trim();
  let width = widthText && !widthText.endsWith('%') ? svgLength(widthText) : undefined;
  let height = heightText && !heightText.endsWith('%') ? svgLength(heightText) : undefined;
  const estimated = width === undefined && height === undefined;
  if (box) {
    width = width ?? (height === undefined ? box[2] : height * box[2] / box[3]);
    height = height ?? width * box[3] / box[2];
  }
  if (width === undefined || height === undefined || width <= 0 || height <= 0) throw new Error('svg-size');
  return { ...mapViewport(root, width, height, box), estimated };
}

export function svgNestedViewport(element: Element, parent: SvgViewportSize, attr: (name: string) => string | undefined,
  override?: { width?: string; height?: string }) {
  const size = (axis: 'width' | 'height') => {
    const specified = override?.[axis], own = attr(axis);
    const value = specified && specified !== 'auto' ? specified : own;
    return value && value !== 'auto' ? svgRelativeLength(value, parent[axis]) : parent[axis];
  };
  const width = size('width'), height = size('height');
  if (width < 0 || height < 0) throw new Error('svg-format');
  if (!width || !height) return null;
  const mapping = mapViewport(element, width, height, svgViewBox(element));
  return { ...mapping, x: svgRelativeLength(attr('x') ?? '0', parent.width), y: svgRelativeLength(attr('y') ?? '0', parent.height) };
}
