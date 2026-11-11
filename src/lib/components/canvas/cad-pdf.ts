import {
  validAppearance,
  multiplyMatrix,
  type VectorClip,
  type VectorGradient,
  type VectorRaster,
} from "./cad-appearance";
import {
  nodeAt,
  curveBounds,
  validContours,
  type CadContour,
} from "./cad-curves";
import {
  VECTOR_DEFAULT_PAINT,
  type VectorDocument,
  type VectorPaint,
} from "./cad-paint";

type Matrix = [number, number, number, number, number, number];
type Point = { x: number; y: number };
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const transform = (m: Matrix, x: number, y: number): Point => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});
type Clip = VectorClip;
const rectangle = (x: number, y: number, w: number, h: number): CadContour => ({
  closed: true,
  nodes: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map(nodeAt),
});
export interface PdfVectorResources {
  get: (id: string) => any;
  images?: Map<any, Omit<VectorRaster, "matrix">>;
}

type State = {
  matrix: Matrix;
  baseMatrix: Matrix;
  paint: VectorPaint;
  clips: Clip[];
  effect: boolean;
  fillUnsupported: boolean;
  strokeUnsupported: boolean;
};

/** Interpret PDF.js's normalized drawing operators; never evaluate PDF/PostScript in JS. */
export function pdfOperatorsToVectors(
  list: { fnArray: number[]; argsArray: any[] },
  ops: Record<string, number>,
  viewport: { width: number; height: number; transform: number[] },
  resources?: PdfVectorResources,
): VectorDocument {
  if (list.fnArray.length > 150000) throw new Error("limit");
  const rgb = (a: number[]) =>
    "#" +
    Array.from(a)
      .slice(0, 3)
      .map((n) => Math.round(n).toString(16).padStart(2, "0"))
      .join("");
  const names = new Map(
    Object.entries(ops).map(([name, value]) => [value, name]),
  );
  let state: State = {
    matrix: viewport.transform as Matrix,
    baseMatrix: viewport.transform as Matrix,
    paint: { ...VECTOR_DEFAULT_PAINT, fill: "#000000", dash: [] },
    clips: [
      {
        contours: [rectangle(0, 0, viewport.width, viewport.height)],
        fillRule: "nonzero",
      },
    ],
    effect: false,
    fillUnsupported: false,
    strokeUnsupported: false,
  };
  const stack: State[] = [],
    paths: VectorDocument["paths"] = [],
    warnings = new Set<string>();
  let contours: CadContour[] = [],
    current: CadContour | undefined,
    pendingClip: "evenodd" | "nonzero" | null = null,
    total = 0;
  const point = (x: number, y: number) => transform(state.matrix, x, y);
  const move = (p: Point) => {
    current = { closed: false, nodes: [nodeAt(p)] };
    contours.push(current);
  };
  const line = (p: Point) => {
    if (!current) throw new Error("format");
    current.nodes.push(nodeAt(p));
  };
  const cubic = (a: Point, b: Point, c: Point) => {
    if (!current) throw new Error("format");
    const last = current.nodes.at(-1)!,
      next = nodeAt(c);
    last.outX = a.x - last.x;
    last.outY = a.y - last.y;
    next.inX = b.x - c.x;
    next.inY = b.y - c.y;
    current.nodes.push(next);
  };
  const close = () => {
    if (!current || current.closed) return;
    current.closed = true;
    const first = current.nodes[0],
      last = current.nodes.at(-1)!;
    if (
      current.nodes.length > 2 &&
      Math.hypot(first.x - last.x, first.y - last.y) < 1e-8
    ) {
      first.inX = last.inX;
      first.inY = last.inY;
      current.nodes.pop();
    }
  };
  const containsRect = (clip: Clip, cs: CadContour[], padding = 0) => {
    if (clip.contours.length !== 1) return false;
    const ns = clip.contours[0].nodes,
      b = curveBounds(clip.contours),
      q = curveBounds(cs);
    return (
      ns.length === 4 &&
      ns.every(
        (n, i) =>
          !n.inX &&
          !n.inY &&
          !n.outX &&
          !n.outY &&
          (n.x === ns[(i + 1) % 4].x || n.y === ns[(i + 1) % 4].y) &&
          (n.x === b.x || n.x === b.x + b.w) &&
          (n.y === b.y || n.y === b.y + b.h),
      ) &&
      q.x - padding >= b.x - 1e-6 &&
      q.y - padding >= b.y - 1e-6 &&
      q.x + q.w + padding <= b.x + b.w + 1e-6 &&
      q.y + q.h + padding <= b.y + b.h + 1e-6
    );
  };
  const end = () => {
    if (pendingClip) {
      // PDF implicitly closes open subpaths when clipping.
      state.clips.push({
        contours: structuredClone(contours)
          .filter((c) => c.nodes.length >= 2)
          .map((c) => ({ ...c, closed: true })),
        fillRule: pendingClip,
      });
      if (state.clips.length > 32) throw new Error("limit");
    }
    pendingClip = null;
    contours = [];
    current = undefined;
  };
  const gradient = (id: string, matrix: Matrix): VectorGradient | undefined => {
    const ir = resources?.get(id);
    if (!Array.isArray(ir) || ir[0] !== "RadialAxial") return;
    const g: VectorGradient = {
      type: ir[1] === "axial" ? "linear" : "radial",
      matrix: [...matrix],
      start: ir[4],
      end: ir[5],
      r0: ir[6] ?? 0,
      r1: ir[7] ?? 0,
      ...(ir[2] ? { bounds: ir[2] } : {}),
      stops: ir[3]?.map(([offset, color]: [number, string]) => ({
        offset,
        color,
      })),
    };
    if(g.type==='radial'&&g.r0>g.r1){[g.r0,g.r1]=[g.r1,g.r0];[g.start,g.end]=[g.end,g.start];g.stops=g.stops.slice().reverse().map(s=>({...s,offset:1-s.offset}));}
    if (!validAppearance({ gradient: g })) return;
    // SVG constrains focal circles to the outer circle. Crossing PDF cones
    // require the appearance renderer rather than a silently clamped gradient.
    if(g.type==='radial' && Math.hypot(g.start[0]-g.end[0],g.start[1]-g.end[1])+g.r0>g.r1+1e-8)return;
    return g;
  };
  const append = (
    cs: CadContour[],
    paint: VectorPaint,
    rule: "nonzero" | "evenodd",
  ) => {
    if (state.clips.some((c) => !c.contours.length)) return;
    paint.clips = state.clips
      .filter(
        (c) =>
          !containsRect(
            c,
            cs,
            paint.stroke === "none"
              ? 0
              : (paint.strokeWidth * paint.miterLimit) / 2,
          ),
      )
      .map((c) => structuredClone(c));
    if (!paint.clips.length) delete paint.clips;
    if (!validAppearance(paint)) throw new Error("limit");
    total += cs.reduce((n, c) => n + c.nodes.length, 0);
    if (total > 4096 || paths.length >= 512 || !validContours(cs))
      throw new Error("limit");
    paths.push({ contours: structuredClone(cs), fillRule: rule, paint });
  };
  const image = (key: any, matrix = state.matrix) => {
    const raster = resources?.images?.get(key);
    if (!raster || state.effect) {
      warnings.add("pdf-images");
      return;
    }
    const m = multiplyMatrix(matrix, [1, 0, 0, -1, 0, 1]);
    const cs = [
      {
        closed: true,
        nodes: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([x, y]) => nodeAt(transform(m, x, y))),
      },
    ];
    append(
      cs,
      {
        ...VECTOR_DEFAULT_PAINT,
        fill: "none",
        stroke: "none",
        fillOpacity: state.paint.fillOpacity,
        raster: { ...raster, matrix: m },
      },
      "nonzero",
    );
  };
  const paint = (fill: boolean, stroke: boolean, evenodd: boolean) => {
    const useful = contours.filter((c) => c.nodes.length >= 2);
    if (useful.length) {
      const b = curveBounds(useful),
        m = state.matrix;
      const sx = Math.hypot(m[0], m[1]),
        sy = Math.hypot(m[2], m[3]);
      const skew =
        Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-7 || Math.abs(sx - sy) > 1e-7;
      if (
        state.effect ||
        (fill && state.fillUnsupported) ||
        (stroke && state.strokeUnsupported) ||
        (stroke && skew)
      )
        warnings.add("pdf-effects");
      else
        append(
          useful,
          {
            ...state.paint,
            fill: fill ? state.paint.fill : "none",
            stroke: stroke ? state.paint.stroke : "none",
            gradient: fill ? state.paint.gradient : undefined,
            strokeWidth: state.paint.strokeWidth * sx,
            dash: state.paint.dash.map((n) => n * sx),
            dashOffset: state.paint.dashOffset * sx,
          },
          evenodd ? "evenodd" : "nonzero",
        );
    }
    end();
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    const name = names.get(list.fnArray[i]) ?? "",
      a = list.argsArray[i] ?? [];
    switch (name) {
      case "save":
        stack.push(structuredClone(state));
        if (stack.length > 100) throw new Error("limit");
        break;
      case "restore":
        if (!stack.length) throw new Error("format");
        state = stack.pop()!;
        break;
      case "transform":
        state.matrix = multiply(state.matrix, a as Matrix);
        break;
      case "paintFormXObjectBegin": {
        stack.push(structuredClone(state));
        if (stack.length > 100) throw new Error("limit");
        if (a[0]) state.matrix = multiply(state.matrix, a[0]);
        state.baseMatrix = [...state.matrix];
        if (a[1]) {
          const [x, y, r, b] = a[1],
            m = state.matrix;
          state.clips.push({
            contours: [
              {
                closed: true,
                nodes: [
                  [x, y],
                  [r, y],
                  [r, b],
                  [x, b],
                ].map(([x, y]) => nodeAt(point(x, y))),
              },
            ],
            fillRule: "nonzero",
          });
        }
        break;
      }
      case "paintFormXObjectEnd":
        if (!stack.length) throw new Error("format");
        state = stack.pop()!;
        break;
      case "constructPath": {
        const commands: number[] = a[0],
          values: number[] = a[1];
        let j = 0;
        if (values.length > 50000 || !Array.from(values).every(Number.isFinite))
          throw new Error("limit");
        for (const command of commands) {
          const cmd = names.get(command);
          const next = () => point(values[j++], values[j++]);
          if (cmd === "moveTo") move(next());
          else if (cmd === "lineTo") line(next());
          else if (cmd === "curveTo") cubic(next(), next(), next());
          else if (cmd === "curveTo2") {
            const p = current?.nodes.at(-1);
            if (!p) throw new Error("format");
            cubic(p, next(), next());
          } else if (cmd === "curveTo3") {
            const p = next(),
              q = next();
            cubic(p, q, q);
          } else if (cmd === "closePath") close();
          else if (cmd === "rectangle") {
            const x = values[j++],
              y = values[j++],
              w = values[j++],
              h = values[j++];
            move(point(x, y));
            line(point(x + w, y));
            line(point(x + w, y + h));
            line(point(x, y + h));
            close();
          } else throw new Error("format");
        }
        if (contours.reduce((n, c) => n + c.nodes.length, 0) > 4096)
          throw new Error("limit");
        break;
      }
      case "closePath":
        close();
        break;
      case "clip":
      case "eoClip":
        pendingClip = name === "eoClip" ? "evenodd" : "nonzero";
        break;
      case "endPath":
        end();
        break;
      case "stroke":
        paint(false, true, false);
        break;
      case "closeStroke":
        close();
        paint(false, true, false);
        break;
      case "fill":
        paint(true, false, false);
        break;
      case "eoFill":
        paint(true, false, true);
        break;
      case "fillStroke":
        paint(true, true, false);
        break;
      case "eoFillStroke":
        paint(true, true, true);
        break;
      case "closeFillStroke":
        close();
        paint(true, true, false);
        break;
      case "closeEOFillStroke":
        close();
        paint(true, true, true);
        break;
      case "setFillRGBColor":
        state.paint.fill = rgb(a);
        delete state.paint.gradient;
        state.fillUnsupported = false;
        break;
      case "setStrokeRGBColor":
        state.paint.stroke = rgb(a);
        state.strokeUnsupported = false;
        break;
      case "setFillTransparent":
        state.paint.fill = "none";
        delete state.paint.gradient;
        break;
      case "setStrokeTransparent":
        state.paint.stroke = "none";
        break;
      case "setLineWidth":
        state.paint.strokeWidth = a[0];
        break;
      case "setLineCap":
        state.paint.lineCap = ["butt", "round", "square"][
          a[0]
        ] as VectorPaint["lineCap"];
        break;
      case "setLineJoin":
        state.paint.lineJoin = ["miter", "round", "bevel"][
          a[0]
        ] as VectorPaint["lineJoin"];
        break;
      case "setMiterLimit":
        state.paint.miterLimit = a[0];
        break;
      case "setDash":
        state.paint.dash = Array.from(a[0]);
        state.paint.dashOffset = a[1];
        break;
      case "setGState":
        for (const [key, value] of a[0]) {
          if (key === "ca") state.paint.fillOpacity = value;
          else if (key === "CA") state.paint.strokeOpacity = value;
          else if (key === "LW") state.paint.strokeWidth = value;
          else if (key === "LC")
            state.paint.lineCap = ["butt", "round", "square"][
              value
            ] as VectorPaint["lineCap"];
          else if (key === "LJ")
            state.paint.lineJoin = ["miter", "round", "bevel"][
              value
            ] as VectorPaint["lineJoin"];
          else if (key === "ML") state.paint.miterLimit = value;
          else if (key === "D") {
            state.paint.dash = value[0];
            state.paint.dashOffset = value[1];
          } else if (
            (key === "BM" && value !== "source-over") ||
            (key === "SMask" && value) ||
            (key === "TR" && value)
          )
            state.effect = true;
        }
        break;
      case "beginGroup":
        stack.push(structuredClone(state));
        state.effect = true;
        warnings.add("pdf-effects");
        break;
      case "endGroup":
        if (!stack.length) throw new Error("format");
        state = stack.pop()!;
        break;
      case "setFillColorN": {
        // Shading patterns use the page base transform, plus their pattern matrix.
        const g =
          a[0] === "TilingPattern"
            ? undefined
            : gradient(
                a[1],
                multiplyMatrix(state.baseMatrix, a[2] ?? [1, 0, 0, 1, 0, 0]),
              );
        state.paint.gradient = g;
        state.fillUnsupported = !g;
        break;
      }
      case "setFillColor":
        state.fillUnsupported = true;
        break;
      case "setStrokeColorN":
      case "setStrokeColor":
        state.strokeUnsupported = true;
        break;
      case "shadingFill": {
        const g = gradient(a[0], state.matrix);
        if (!g || state.effect) warnings.add("pdf-effects");
        else
          append(
            [rectangle(0, 0, viewport.width, viewport.height)],
            { ...state.paint, stroke: "none", gradient: g },
            "nonzero",
          );
        break;
      }
      case "paintImageXObject":
        image(a[0]);
        break;
      case "paintInlineImageXObject":
        image(a[0]);
        break;
      case "paintImageXObjectRepeat": {
        if (a[3].length > 4000) throw new Error("limit");
        for (let j = 0; j < a[3].length; j += 2)
          image(
            a[0],
            multiplyMatrix(state.matrix, [
              a[1],
              0,
              0,
              a[2],
              a[3][j],
              a[3][j + 1],
            ]),
          );
        break;
      }
      case "showText":
      case "showSpacedText":
      case "nextLineShowText":
      case "nextLineSetSpacingShowText":
        warnings.add("pdf-text");
        break;
      default:
        if (
          name.startsWith("paintImage") ||
          name.startsWith("paintInlineImage") ||
          name === "paintSolidColorImageMask"
        )
          warnings.add("pdf-images");
        else if (
          [
            "beginAnnotation",
            "endAnnotation",
            "beginMarkedContentProps",
          ].includes(name)
        )
          warnings.add("pdf-annotations");
    }
  }
  return {
    paths,
    width: viewport.width,
    height: viewport.height,
    warnings: [...warnings],
  };
}
