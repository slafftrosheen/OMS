import ImageTracer from 'imagetracerjs';
import type { CadPoint } from './cad-settings';
import type { TraceOptions } from './cad-trace';

export interface TraceColor { r: number; g: number; b: number; a: number }
export interface TraceBoundary { points: CadPoint[]; color: number; hole: boolean; children: number[] }
export interface TraceRasterBoundaries { boundaries: TraceBoundary[]; palette: TraceColor[]; noiseRemoved: boolean }
export const MAX_TRACE_PIXELS = 2048 * 2048, MAX_TRACE_SIDE = 2048, MAX_TRACE_BOUNDARY_POINTS = 131072;
const MAX_RAW_CONTOURS = 4096;
type Bin = TraceColor & { count: number; key: number };
const colorKey = (r: number, g: number, b: number, a: number) => r * 16777216 + g * 65536 + b * 256 + a;
const packedColor = (key: number): TraceColor => ({ r: Math.floor(key / 16777216), g: Math.floor(key / 65536) % 256, b: Math.floor(key / 256) % 256, a: key % 256 });
const binKey = (r: number, g: number, b: number, a: number) => (r >> 4) * 2048 + (g >> 4) * 128 + (b >> 4) * 8 + (a >> 5);
const axes = ['r', 'g', 'b', 'a'] as const;

/** Weighted, deterministic RGBA palette. Grid sampling can miss a small logo
 * accent entirely. Fully transparent RGB never enters the histogram, so it
 * cannot consume a color or produce a white matte around visible artwork. */
function colorPalette(data: Uint8ClampedArray, count: number, removeWhite: boolean) {
  const bins = new Map<number, Bin>(), exact = new Map<number, number>();
  let exactOverflow = false;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (!a || removeWhite && Math.min(r, g, b) >= 245) continue;
    if (!exactOverflow) {
      const key = colorKey(r, g, b, a); exact.set(key, (exact.get(key) ?? 0) + 1);
      if (exact.size > count) { exactOverflow = true; exact.clear(); }
    }
    const key = binKey(r, g, b, a), bin = bins.get(key);
    if (bin) { bin.r += r; bin.g += g; bin.b += b; bin.a += a; bin.count++; }
    else bins.set(key, { r, g, b, a, count: 1, key });
  }
  if (!bins.size) throw new Error('empty');
  if (!exactOverflow) {
    const keys = [...exact].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(entry => entry[0]);
    return { palette: keys.map(packedColor), exact: new Map(keys.map((key, i) => [key, i])), bins: null };
  }
  const entries = [...bins.values()].sort((a, b) => a.key - b.key).map(bin => ({ ...bin,
    r: bin.r / bin.count, g: bin.g / bin.count, b: bin.b / bin.count, a: bin.a / bin.count }));
  const measure = (members: Bin[]) => {
    const ranges = axes.map(axis => Math.max(...members.map(p => p[axis])) - Math.min(...members.map(p => p[axis])));
    const axis = axes[ranges.indexOf(Math.max(...ranges))];
    return { members, axis, weight: members.reduce((sum, p) => sum + p.count, 0), range: Math.max(...ranges) };
  };
  const boxes = [measure(entries)];
  while (boxes.length < count) {
    let chosen = -1, score = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i], value = box.range * Math.sqrt(box.weight);
      if (box.members.length > 1 && value > score) { chosen = i; score = value; }
    }
    if (chosen < 0) break;
    const box = boxes[chosen], sorted = box.members.slice().sort((a, b) => a[box.axis] - b[box.axis] || a.key - b.key);
    let weight = 0, split = 1;
    for (; split < sorted.length; split++) { weight += sorted[split - 1].count; if (weight >= box.weight / 2) break; }
    split = Math.min(sorted.length - 1, split);
    boxes.splice(chosen, 1, measure(sorted.slice(0, split)), measure(sorted.slice(split)));
  }
  let palette = boxes.map(box => Object.fromEntries(axes.map(axis => [axis,
    Math.round(box.members.reduce((sum, p) => sum + p[axis] * p.count, 0) / box.weight)])) as unknown as TraceColor);
  const assignments = new Map<number, number>();
  // Refinement works on the bounded histogram, not four million pixels times
  // every palette color. Zero-population colors retain their deterministic seed.
  for (let pass = 0; pass < 3; pass++) {
    const sums = palette.map(() => ({ r: 0, g: 0, b: 0, a: 0, count: 0 }));
    for (const entry of entries) {
      let index = 0, best = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const distance = axes.reduce((sum, axis) => sum + (entry[axis] - palette[i][axis]) ** 2, 0);
        if (distance < best) { best = distance; index = i; }
      }
      assignments.set(entry.key, index);
      const sum = sums[index]; sum.count += entry.count;
      for (const axis of axes) sum[axis] += entry[axis] * entry.count;
    }
    if (pass < 2) palette = palette.map((color, i) => sums[i].count ? Object.fromEntries(axes.map(axis => [axis,
      Math.round(sums[i][axis] / sums[i].count)])) as unknown as TraceColor : color);
  }
  return { palette, exact: null, bins: assignments };
}

export function readTraceRasterBoundaries(input: { width: number; height: number; data: Uint8ClampedArray }, options: TraceOptions): TraceRasterBoundaries {
  const { width, height, data } = input;
  const quantized = options.mode === 'color' ? colorPalette(data, options.colors, options.removeWhite) : null;
  const palette = quantized?.palette ?? [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }];
  // Remove color-mode white before quantization, in source-pixel space. A
  // white pixel must not survive by merging with gray; conversely retained
  // near-white tints must not vanish because their palette average is white.
  const visible = palette.map(color => color.a > 0 && !(options.mode === 'mono' && options.removeWhite && Math.min(color.r, color.g, color.b) >= 245));
  const array = Array.from({ length: height + 2 }, () => Array<number>(width + 2).fill(-1));
  const used = new Set<number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, a = data[i + 3];
    if (!a || quantized && options.removeWhite && Math.min(data[i], data[i + 1], data[i + 2]) >= 245) continue;
    let index: number;
    if (quantized) index = quantized.exact
      ? quantized.exact.get(colorKey(data[i], data[i + 1], data[i + 2], a))!
      : quantized.bins!.get(binKey(data[i], data[i + 1], data[i + 2], a))!;
    else {
      const luminance = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * a / 255 + 255 - a;
      index = luminance < options.threshold ? 0 : 1;
    }
    if (visible[index]) { array[y + 1][x + 1] = index; used.add(index); }
  }
  if (!used.size) throw new Error('empty');
  // Count both sides of visible color boundaries before pathscan allocates
  // point objects. Checkerboards and enormous noisy traces fail predictably.
  let edgePoints = 0;
  for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) {
    const a = array[y][x], right = array[y][x + 1], below = array[y + 1][x];
    if (a !== right) edgePoints += Number(a >= 0) + Number(right >= 0);
    if (a !== below) edgePoints += Number(a >= 0) + Number(below >= 0);
    if (edgePoints > MAX_TRACE_BOUNDARY_POINTS) throw new Error('limit');
  }
  const boundaries: TraceBoundary[] = [];
  let rawCount = 0, rawPoints = 0, noiseRemoved = false;
  for (const color of [...used].sort((a, b) => a - b)) {
    const paths = ImageTracer.pathscan(ImageTracer.layeringstep({ array, palette }, color), 0);
    rawCount += paths.length;
    if (rawCount > MAX_RAW_CONTOURS) throw new Error('limit');
    for (const path of paths) {
      rawPoints += path.points.length;
      if (rawPoints > MAX_TRACE_BOUNDARY_POINTS || path.points.length < 4 || path.points.some(p =>
        !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height)) throw new Error('limit');
    }
    // Filter only after the complete hole graph exists. ImageTracer's own
    // pathomit can orphan a retained complicated hole when its outer ring is
    // shorter than the threshold. A discarded parent never leaks its children.
    for (const path of paths) {
      if (path.isholepath) continue;
      if (path.points.length < options.noise) { noiseRemoved = true; continue; }
      const id = boundaries.length;
      boundaries.push({ points: path.points.map(({ x, y }) => ({ x, y })), color, hole: false, children: [] });
      for (const childIndex of path.holechildren) {
        const child = paths[childIndex];
        if (!child?.isholepath) throw new Error('geometry');
        if (child.points.length < options.noise) { noiseRemoved = true; continue; }
        boundaries[id].children.push(boundaries.length);
        boundaries.push({ points: child.points.map(({ x, y }) => ({ x, y })), color, hole: true, children: [] });
      }
    }
  }
  if (!boundaries.length) throw new Error('empty');
  if (boundaries.length > 512) throw new Error('limit');
  return { boundaries, palette, noiseRemoved };
}
