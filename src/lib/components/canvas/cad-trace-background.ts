import { MAX_TRACE_PIXELS, MAX_TRACE_SIDE, resolveTraceBackground, type TraceOptions } from './cad-trace-options';

export interface TraceRasterInput { width: number; height: number; data: Uint8ClampedArray }
export function validTraceRasterInput(input: TraceRasterInput): boolean {
  return !!input && Number.isInteger(input.width) && Number.isInteger(input.height) &&
    input.width >= 1 && input.height >= 1 && input.width <= MAX_TRACE_SIDE && input.height <= MAX_TRACE_SIDE &&
    input.width * input.height <= MAX_TRACE_PIXELS && input.data instanceof Uint8ClampedArray &&
    input.data.length === input.width * input.height * 4;
}
export function traceLuminance(data: Uint8ClampedArray, offset: number): number {
  const alpha = data[offset + 3];
  return (.2126 * data[offset] + .7152 * data[offset + 1] + .0722 * data[offset + 2]) * alpha / 255 + 255 - alpha;
}

/** One bounded byte per pixel, plus one uint32 queue only in border mode.
 * Four-neighbor connectivity preserves details that merely touch the outside
 * diagonally. Transparent pixels can connect a white region to an image edge,
 * but are always absent from output regardless of the selected background mode.
 * Mono classifies white after thresholding; color classifies source RGB before
 * quantization, so reduction cannot hide white in a mixed palette entry. */
export function traceBackgroundMask(input: TraceRasterInput, options: TraceOptions): Uint8Array | null {
  if (!validTraceRasterInput(input)) throw new Error('limit');
  const scope = resolveTraceBackground(options);
  if (scope === 'keep') return null;
  if (scope !== 'border' && scope !== 'all') throw new Error('geometry');
  const { width, height, data } = input, size = width * height;
  const mask = new Uint8Array(size);
  for (let p = 0; p < size; p++) {
    const i = p * 4;
    if (!data[i + 3] || (options.mode === 'mono' ? traceLuminance(data, i) >= options.threshold
      : Math.min(data[i], data[i + 1], data[i + 2]) >= 245)) mask[p] = 1;
  }
  if (scope === 'all') return mask;
  const queue = new Uint32Array(size);
  let tail = 0;
  const enqueue = (index: number) => {
    if (mask[index] === 1) { mask[index] = 2; queue[tail++] = index; }
  };
  for (let x = 0; x < width; x++) { enqueue(x); if (height > 1) enqueue((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { enqueue(y * width); if (width > 1) enqueue(y * width + width - 1); }
  for (let head = 0; head < tail; head++) {
    const index = queue[head], x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < size) enqueue(index + width);
  }
  for (let p = 0; p < size; p++) mask[p] = mask[p] === 2 ? 1 : 0;
  return mask;
}
