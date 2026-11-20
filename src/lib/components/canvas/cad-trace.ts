import { nodeAt, validContours, type CadContour } from "./cad-curves";
import { VECTOR_DEFAULT_PAINT, type VectorDocument } from "./cad-paint";
import { readTraceRasterBoundaries } from "./cad-trace-raster";
import { fitTraceBoundaries } from "./cad-trace-topology";
import { resolveTraceMethod, validTraceOptions, type TraceOptions } from './cad-trace-options';
import { validTraceRasterInput } from './cad-trace-background';
import { traceCenterlineRaster } from './cad-trace-centerline';
export { DEFAULT_TRACE_OPTIONS, type TraceOptions } from './cad-trace-options';
type Segment = {
  type: "L" | "Q";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
};
export function traceSegments(segments: Segment[]): CadContour {
  if (!segments.length) throw new Error("empty");
  const nodes = [nodeAt({ x: segments[0].x1, y: segments[0].y1 })];
  for (const s of segments) {
    const a = nodes.at(-1)!;
    const b = nodeAt(
      s.type === "Q" ? { x: s.x3!, y: s.y3! } : { x: s.x2, y: s.y2 },
    );
    if (s.type === "Q") {
      // Quadratic -> cubic is exact, including the closing segment.
      a.outX = ((s.x2 - a.x) * 2) / 3;
      a.outY = ((s.y2 - a.y) * 2) / 3;
      b.inX = ((s.x2 - b.x) * 2) / 3;
      b.inY = ((s.y2 - b.y) * 2) / 3;
    }
    nodes.push(b);
  }
  const first = nodes[0],
    last = nodes.at(-1)!;
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-7) {
    first.inX = last.inX;
    first.inY = last.inY;
    nodes.pop();
  }
  return { closed: true, nodes };
}
/** Worker-only CPU operation; hard limits also protect non-UI callers. */
export function traceRaster(
  input: { width: number; height: number; data: Uint8ClampedArray },
  options: TraceOptions,
): VectorDocument {
  if (!validTraceRasterInput(input)) throw new Error('limit');
  if (!validTraceOptions(options)) throw new Error('geometry');
  if (resolveTraceMethod(options) === 'centerline') return traceCenterlineRaster(input, options);
  const { width, height } = input;
  const raw = readTraceRasterBoundaries(input, options);
  const fitted = fitTraceBoundaries(raw.boundaries, options.smoothing, options.preserveCorners);
  const paths: VectorDocument["paths"] = [];
  for (let i = 0; i < raw.boundaries.length; i++) {
    const boundary = raw.boundaries[i];
    if (boundary.hole) continue;
    const color = raw.palette[boundary.color];
    const fill = "#" + [color.r, color.g, color.b].map(n => n.toString(16).padStart(2, "0")).join("");
    const contours = [fitted.contours[i], ...boundary.children.map(index => fitted.contours[index])];
    if (!validContours(contours)) throw new Error("limit");
    paths.push({ contours, fillRule: "evenodd", paint: { ...VECTOR_DEFAULT_PAINT,
      fill, fillOpacity: color.a / 255, stroke: "none", dash: [] } });
  }
  if (!paths.length) throw new Error("empty");
  return { paths, width, height, warnings: ["trace-approximation",
    ...(raw.noiseRemoved ? ["trace-noise"] : []), ...(fitted.conservative ? ["trace-topology"] : [])] };
}
