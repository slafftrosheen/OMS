import { arcContour, mapContours, nodeAt, type CadContour } from "./cad-curves";
import { rationalSplineContour } from "./cad-nurbs";
import { CadOperationError } from "./cad-plans";
import type { CadPoint } from "./cad-settings";
type Pair = [number, string];
const TAU = 2 * Math.PI;
const angle = (n: number) => ((n % TAU) + TAU) % TAU;
/** Largest singular value: approximation bounds must survive shear/nonuniform scale. */
export function matrixScale(m: number[]) {
  const a = m[0] * m[0] + m[1] * m[1],
    b = m[0] * m[2] + m[1] * m[3],
    d = m[2] * m[2] + m[3] * m[3];
  return Math.sqrt((a + d + Math.hypot(a - d, 2 * b)) / 2);
}
export function dxfColor(rgb: number, index: number) {
  if (Number.isInteger(rgb) && rgb >= 0 && rgb <= 0xffffff)
    return "#" + rgb.toString(16).padStart(6, "0");
  index = Math.abs(index);
  const basic = [
    "#000000",
    "#ff0000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#ff00ff",
    "#000000",
    "#808080",
    "#c0c0c0",
  ];
  if (index < 10) return basic[index] ?? basic[0];
  if (index >= 250 && index <= 255) {
    const g = [51, 80, 105, 130, 190, 255][index - 250]
      .toString(16)
      .padStart(2, "0");
    return "#" + g.repeat(3);
  }
  if (index > 255) return basic[0];
  const h = Math.floor((index - 10) / 10) / 4,
    v = [255, 165, 127, 76, 38][Math.floor((index % 10) / 2)],
    sat = index % 2 ? 0.5 : 1;
  const c = v * sat,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = v - c;
  const channels =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    channels
      .map((n) =>
        Math.floor(n + m)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function polylineContour(
  points: Array<CadPoint & { bulge: number }>,
  closed: boolean,
  tolerance: number,
): CadContour {
  if (points.length < 2 || points.length > 4096)
    throw new CadOperationError("geometry");
  const nodes = [nodeAt(points[0])];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      bulge = a.bulge;
    if (!bulge) nodes.push(nodeAt(b));
    else {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      if (!length) throw new CadOperationError("geometry");
      const k = (1 - bulge * bulge) / (4 * bulge),
        cx = (a.x + b.x) / 2 - dy * k,
        cy = (a.y + b.y) / 2 + dx * k,
        r = (length * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
      const arc = arcContour(
        cx,
        cy,
        r,
        r,
        Math.atan2(a.y - cy, a.x - cx),
        4 * Math.atan(bulge),
        Math.min(Math.PI / 2, Math.pow((tolerance / r) * 10000, 1 / 6)),
      );
      Object.assign(nodes.at(-1)!, {
        outX: arc.nodes[0].outX,
        outY: arc.nodes[0].outY,
      });
      nodes.push(...arc.nodes.slice(1));
    }
    if (nodes.length > 4096) throw new CadOperationError("limit");
  }
  if (closed) {
    const last = nodes.pop()!;
    nodes[0].inX = last.inX;
    nodes[0].inY = last.inY;
  }
  return { closed, nodes };
}
/** Autodesk HATCH boundary records: ordered parsing prevents seeds/fit points
 * from being accidentally interpreted as boundary vertices. */
export function hatchContours(pairs: Pair[], tolerance: number) {
  let i = pairs.findIndex(([c]) => c === 91),
    approximated = false;
  if (i < 0) throw new CadOperationError("geometry");
  const take = (code: number) => {
    if (pairs[i]?.[0] !== code) throw new CadOperationError("geometry");
    const v = Number(pairs[i++][1]);
    if (!Number.isFinite(v)) throw new CadOperationError("geometry");
    return v;
  };
  const count = (code: number, max = 4096) => {
    const n = take(code);
    if (!Number.isSafeInteger(n) || n < 0 || n > max)
      throw new CadOperationError("limit");
    return n;
  };
  const point = (code = 10) => ({ x: take(code), y: take(code + 10) });
  const loops = count(91, 512),
    contours: CadContour[] = [],
    flags: number[] = [];
  for (let loop = 0; loop < loops; loop++) {
    const flag = take(92);
    flags.push(flag);
    if (flag & 2) {
      const bulges = take(72),
        closed = take(73),
        n = count(93);
      const ps = Array.from({ length: n }, () => {
        const p = point();
        return { ...p, bulge: bulges && pairs[i]?.[0] === 42 ? take(42) : 0 };
      });
      if (!closed) throw new CadOperationError("unsupported");
      if (
        ps.length > 2 &&
        Math.hypot(ps[0].x - ps.at(-1)!.x, ps[0].y - ps.at(-1)!.y) < 1e-9
      )
        ps.pop();
      contours.push(polylineContour(ps, true, tolerance));
      approximated ||= ps.some((p) => !!p.bulge);
    } else {
      const edges = count(93),
        parts: CadContour[] = [];
      for (let edge = 0; edge < edges; edge++) {
        const kind = take(72);
        if (kind === 1)
          parts.push({
            closed: false,
            nodes: [nodeAt(point()), nodeAt(point(11))],
          });
        else if (kind === 2 || kind === 3) {
          const center = point(),
            major = kind === 3 ? point(11) : { x: take(40), y: 0 },
            r = Math.hypot(major.x, major.y),
            ratio = kind === 3 ? take(40) : 1;
          const start = (take(50) * Math.PI) / 180,
            end = (take(51) * Math.PI) / 180,
            ccw = take(73);
          if (!(r > 0) || !(ratio > 0) || ratio > 1)
            throw new CadOperationError("geometry");
          const sweep =
            (ccw ? 1 : -1) *
            (Math.abs(end - start) >= TAU - 1e-9
              ? TAU
              : angle(ccw ? end - start : start - end));
          const curve = arcContour(
            0,
            0,
            r,
            r * ratio,
            start,
            sweep,
            Math.min(Math.PI / 2, Math.pow((tolerance / r) * 10000, 1 / 6)),
          );
          // Full-circle arcContour closes its contour; joiner needs the terminal point.
          if (curve.closed) {
            const first = curve.nodes[0];
            curve.nodes.push({ ...first });
            curve.closed = false;
          }
          const a = Math.atan2(major.y, major.x),
            c = Math.cos(a),
            s = Math.sin(a);
          parts.push(
            mapContours([curve], (p) => ({
              x: center.x + c * p.x - s * p.y,
              y: center.y + s * p.x + c * p.y,
            }))[0],
          );
          approximated = true;
        } else if (kind === 4) {
          const degree = count(94, 5),
            rational = take(73);
          take(74);
          const nk = count(95, 8200),
            np = count(96),
            knots = Array.from({ length: nk }, () => take(40));
          const controls: CadPoint[] = [],
            weights: number[] = [];
          for (let n = 0; n < np; n++) {
            controls.push(point());
            weights.push(rational && pairs[i]?.[0] === 42 ? take(42) : 1);
          }
          // Some writers store the weight array after all control points.
          if (rational && pairs[i]?.[0] === 42)
            for (let n = 0; n < np; n++) weights[n] = take(42);
          if (pairs[i]?.[0] === 97) {
            const nf = count(97);
            for (let n = 0; n < nf; n++) point(11);
          }
          if (pairs[i]?.[0] === 12) point(12);
          if (pairs[i]?.[0] === 13) point(13);
          parts.push(
            rationalSplineContour(
              controls,
              weights,
              knots,
              degree,
              false,
              tolerance,
            ),
          );
          approximated = true;
        } else throw new CadOperationError("unsupported");
      }
      const nodes: CadContour["nodes"] = [];
      for (const part of parts) {
        if (!nodes.length) nodes.push(...part.nodes);
        else {
          const a = nodes.at(-1)!,
            b = part.nodes[0];
          if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(1e-8, tolerance))
            throw new CadOperationError("geometry");
          a.outX = b.outX;
          a.outY = b.outY;
          nodes.push(...part.nodes.slice(1));
        }
      }
      if (
        nodes.length < 3 ||
        Math.hypot(nodes[0].x - nodes.at(-1)!.x, nodes[0].y - nodes.at(-1)!.y) >
          Math.max(1e-8, tolerance)
      )
        throw new CadOperationError("geometry");
      const last = nodes.pop()!;
      nodes[0].inX = last.inX;
      nodes[0].inY = last.inY;
      contours.push({ closed: true, nodes });
    }
    if (pairs[i]?.[0] === 97) {
      const sources = count(97);
      for (let n = 0; n < sources; n++) {
        if (pairs[i++]?.[0] !== 330) throw new CadOperationError("geometry");
      }
    }
  }
  const style = Number(pairs.find(([c]) => c === 75)?.[1] ?? 0);
  // Explicit external/outer flags define outer/ignore styles. Do not guess topology.
  if (style && !flags.some((f) => f & 1))
    throw new CadOperationError("unsupported");
  return {
    contours: contours.filter((_, n) =>
      style === 2 ? !!(flags[n] & 1) : style === 1 ? !!(flags[n] & 17) : true,
    ),
    approximated,
  };
}
