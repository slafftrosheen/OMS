import ImageTracer from "imagetracerjs";
import { nodeAt, validContours, type CadContour } from "./cad-curves";
import { VECTOR_DEFAULT_PAINT, type VectorDocument } from "./cad-paint";

export interface TraceOptions {
  mode: "mono" | "color";
  threshold: number;
  colors: number;
  smoothing: number;
  noise: number;
  removeWhite: boolean;
}
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  mode: "mono",
  threshold: 128,
  colors: 8,
  smoothing: 1,
  noise: 8,
  removeWhite: true,
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
type TracedPath = {
  segments: Segment[];
  isholepath: boolean;
  holechildren: number[];
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
    width * height > 1024 * 1024 ||
    input.data.length !== width * height * 4
  )
    throw new Error("limit");
  if (
    !["mono", "color"].includes(options.mode) ||
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
  const data = new Uint8ClampedArray(input.data);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    for (let j = 0; j < 3; j++)
      data[i + j] = data[i + j] * alpha + 255 * (1 - alpha);
    if (options.mode === "mono") {
      const value =
        0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] <
        options.threshold
          ? 0
          : 255;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    data[i + 3] = 255;
  }
  const result = ImageTracer.imagedataToTracedata(
    { width, height, data },
    {
      ltres: options.smoothing,
      qtres: options.smoothing,
      pathomit: options.noise,
      numberofcolors: options.mode === "mono" ? 2 : options.colors,
      colorsampling: 2,
      colorquantcycles: 3,
      ...(options.mode === "mono"
        ? {
            pal: [
              { r: 0, g: 0, b: 0, a: 255 },
              { r: 255, g: 255, b: 255, a: 255 },
            ],
          }
        : {}),
    },
  );
  const paths: VectorDocument["paths"] = [];
  let total = 0;
  result.layers.forEach((layer: TracedPath[], index: number) => {
    const color = result.palette[index];
    if (options.removeWhite && Math.min(color.r, color.g, color.b) >= 245)
      return;
    const fill =
      "#" +
      [color.r, color.g, color.b]
        .map((n) => Math.round(n).toString(16).padStart(2, "0"))
        .join("");
    for (const p of layer) {
      if (p.isholepath || !p.segments.length) continue;
      const contours = [p, ...p.holechildren.map((i) => layer[i])].map((p) =>
        traceSegments(p.segments),
      );
      total += contours.reduce((n, c) => n + c.nodes.length, 0);
      if (total > 4096 || paths.length >= 512 || !validContours(contours))
        throw new Error("limit");
      paths.push({
        contours,
        fillRule: "evenodd",
        paint: { ...VECTOR_DEFAULT_PAINT, fill, stroke: "none", dash: [] },
      });
    }
  });
  if (!paths.length) throw new Error("empty");
  return { paths, width, height, warnings: ["trace-approximation"] };
}
