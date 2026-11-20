import { nodeAt, validContours, type CadContour } from "./cad-curves";
import { VECTOR_DEFAULT_PAINT, type VectorDocument } from "./cad-paint";
import { MAX_TRACE_PIXELS, MAX_TRACE_SIDE, readTraceRasterBoundaries } from "./cad-trace-raster";
import { fitTraceBoundaries } from "./cad-trace-topology";

export interface TraceOptions {
  mode: "mono" | "color";
  threshold: number;
  colors: number;
  smoothing: number;
  noise: number;
  removeWhite: boolean;
  preserveCorners: boolean;
}
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  mode: "mono",
  threshold: 128,
  colors: 8,
  smoothing: .75,
  noise: 0,
  removeWhite: true,
  preserveCorners: true,
};
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
  const { width, height } = input;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_TRACE_SIDE || height > MAX_TRACE_SIDE || width * height > MAX_TRACE_PIXELS ||
    !(input.data instanceof Uint8ClampedArray) ||
    input.data.length !== width * height * 4
  )
    throw new Error("limit");
  if (
    !options || !["mono", "color"].includes(options.mode) ||
    typeof options.removeWhite !== "boolean" || typeof options.preserveCorners !== "boolean" ||
    !Number.isInteger(options.colors) ||
    options.colors < 2 ||
    options.colors > 32 ||
    !Number.isFinite(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 255 ||
    !Number.isFinite(options.smoothing) ||
    options.smoothing < 0.1 ||
    options.smoothing > 5 ||
    !Number.isInteger(options.noise) ||
    options.noise < 0 ||
    options.noise > 100
  )
    throw new Error("geometry");
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
