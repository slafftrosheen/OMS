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
type Clip = { x: number; y: number; w: number; h: number } | null;
type State = {
  matrix: Matrix;
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
    paint: { ...VECTOR_DEFAULT_PAINT, fill: "#000000", dash: [] },
    clips: [{ x: 0, y: 0, w: viewport.width, h: viewport.height }],
    effect: false,
    fillUnsupported: false,
    strokeUnsupported: false,
  };
  const stack: State[] = [],
    paths: VectorDocument["paths"] = [],
    warnings = new Set<string>();
  let contours: CadContour[] = [],
    current: CadContour | undefined,
    pendingClip = false,
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
  const clipRect = (): Clip => {
    if (
      contours.length !== 1 ||
      !current?.closed ||
      current.nodes.length !== 4 ||
      current.nodes.some((n) => n.inX || n.inY || n.outX || n.outY)
    )
      return null;
    const b = curveBounds(contours);
    return current.nodes.every((n, i) => {
      const next = current!.nodes[(i + 1) % 4];
      return (
        (Math.abs(n.x - next.x) < 1e-8 || Math.abs(n.y - next.y) < 1e-8) &&
        (Math.abs(n.x - b.x) < 1e-8 || Math.abs(n.x - b.x - b.w) < 1e-8) &&
        (Math.abs(n.y - b.y) < 1e-8 || Math.abs(n.y - b.y - b.h) < 1e-8)
      );
    })
      ? b
      : null;
  };
  const end = () => {
    if (pendingClip) state.clips.push(clipRect());
    pendingClip = false;
    contours = [];
    current = undefined;
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
      const clipped = state.clips.some(
        (c) =>
          !c ||
          b.x < c.x - 1e-6 ||
          b.y < c.y - 1e-6 ||
          b.x + b.w > c.x + c.w + 1e-6 ||
          b.y + b.h > c.y + c.h + 1e-6,
      );
      if (clipped) warnings.add("pdf-clipping");
      else if (
        state.effect ||
        (fill && state.fillUnsupported) ||
        (stroke && state.strokeUnsupported) ||
        (stroke && skew)
      )
        warnings.add("pdf-effects");
      else {
        total += useful.reduce((n, c) => n + c.nodes.length, 0);
        if (total > 4096 || paths.length >= 512 || !validContours(useful))
          throw new Error("limit");
        paths.push({
          contours: structuredClone(useful),
          fillRule: evenodd ? "evenodd" : "nonzero",
          paint: {
            ...state.paint,
            fill: fill ? state.paint.fill : "none",
            stroke: stroke ? state.paint.stroke : "none",
            strokeWidth: state.paint.strokeWidth * sx,
            dash: state.paint.dash.map((n) => n * sx),
            dashOffset: state.paint.dashOffset * sx,
          },
        });
      }
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
        if (a[1]) {
          const [x, y, r, b] = a[1],
            m = state.matrix;
          if (Math.abs(m[1] * m[3]) > 1e-8 || Math.abs(m[0] * m[2]) > 1e-8)
            state.clips.push(null);
          else {
            const p = point(x, y),
              q = point(r, b);
            state.clips.push({
              x: Math.min(p.x, q.x),
              y: Math.min(p.y, q.y),
              w: Math.abs(p.x - q.x),
              h: Math.abs(p.y - q.y),
            });
          }
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
        pendingClip = true;
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
        state.fillUnsupported = false;
        break;
      case "setStrokeRGBColor":
        state.paint.stroke = rgb(a);
        state.strokeUnsupported = false;
        break;
      case "setFillTransparent":
        state.paint.fill = "none";
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
      case "setFillColorN":
      case "setFillColor":
        state.fillUnsupported = true;
        break;
      case "setStrokeColorN":
      case "setStrokeColor":
        state.strokeUnsupported = true;
        break;
      case "shadingFill":
        warnings.add("pdf-effects");
        break;
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
