import { multiplyMatrix, type VectorMatrix } from './cad-appearance';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const SVG_MM_PER_PIXEL = 25.4 / 96;
export const SVG_IDENTITY: VectorMatrix = [1, 0, 0, 1, 0, 0];
const number = String.raw`[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?`;
const units: Record<string, number> = { '': 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54,
  in: 96, pt: 96 / 72, pc: 16, q: 96 / 101.6 };
const lengthPattern = new RegExp(`^(${number})([a-z]*)$`, 'i');

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

/** Map viewBox user coordinates to the intrinsic CSS-pixel viewport. */
export function svgViewport(root: Element) {
  const boxText = root.getAttribute('viewBox');
  const box = boxText === null ? null : svgNumbers(boxText, 4);
  if (box && (box.length !== 4 || box[2] <= 0 || box[3] <= 0)) throw new Error('svg-format');
  const widthText = root.getAttribute('width')?.trim(), heightText = root.getAttribute('height')?.trim();
  let width = widthText && !widthText.endsWith('%') ? svgLength(widthText) : undefined;
  let height = heightText && !heightText.endsWith('%') ? svgLength(heightText) : undefined;
  const estimated = width === undefined && height === undefined;
  if (box) {
    width = width ?? (height === undefined ? box[2] : height * box[2] / box[3]);
    height = height ?? width * box[3] / box[2];
  }
  if (width === undefined || height === undefined || width <= 0 || height <= 0)
    throw new Error('svg-size');
  if (width > 1e6 || height > 1e6) throw new Error('limit');
  if (!box) return { width, height, matrix: SVG_IDENTITY, estimated };
  const [x, y, w, h] = box;
  const sx = width / w, sy = height / h;
  const aspect = (root.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim();
  if (aspect === 'none') return { width, height, matrix: [sx, 0, 0, sy, -x * sx, -y * sy] as VectorMatrix, estimated };
  const alignment = /^x(Min|Mid|Max)Y(Min|Mid|Max)(?:\s+(meet|slice))?$/.exec(aspect);
  if (!alignment) throw new Error('svg-format');
  const scale = alignment[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  const fraction = { Min: 0, Mid: 0.5, Max: 1 };
  const dx = (width - scale * w) * fraction[alignment[1] as keyof typeof fraction] - x * scale;
  const dy = (height - scale * h) * fraction[alignment[2] as keyof typeof fraction] - y * scale;
  return { width, height, matrix: [scale, 0, 0, scale, dx, dy] as VectorMatrix, estimated };
}
