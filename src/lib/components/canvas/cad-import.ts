import { projectDxfRecords, type ProjectableDxfRecord } from "./cad-dxf-projection";
import { dxfTextContours } from "./cad-dxf-text";
import { VECTOR_DEFAULT_PAINT } from "./cad-paint";
import {
  hatchContours,
  polylineContour,
  matrixScale,
  dxfColor,
} from "./cad-dxf-geometry";
import { rationalSplineContour } from "./cad-nurbs";
import type { Editor } from "@tldraw/tldraw";
import {
  cadMmPerPixel,
  unitMm,
  validateCadSettings,
  type CadPoint,
  type CadSettings,
  type CadUnit,
} from "./cad-settings";
import {
  arcContour,
  curveBounds,
  mapContours,
  mix,
  nodeAt,
  validContours,
  type CadContour,
} from "./cad-curves";
import {
  assertCadEditable,
  cadRevision,
  CadOperationError,
  type CadPlan,
  type CadPlannedShape,
} from "./cad-plans";

export interface CadImportPlan extends CadPlan {
  omitted: { type: string; reason: string }[];
  sourceUnit: string;
  requiresUnit: boolean;
}
type Pair = [number, string];
type Record = ProjectableDxfRecord;
type Matrix = [number, number, number, number, number, number];
const TAU = Math.PI * 2;
const get = (r: Record, code: number, fallback = 0) => {
  const value = r.pairs.find((p) => p[0] === code);
  const n = value ? Number(value[1]) : fallback;
  if (!Number.isFinite(n)) throw new CadOperationError("geometry");
  return n;
};
const word = (r: Record, code: number) =>
  r.pairs.find((p) => p[0] === code)?.[1] ?? "";
const point = (r: Record, code = 10): CadPoint => ({
  x: get(r, code),
  y: get(r, code + 10),
});
const transform = (m: Matrix, p: CadPoint): CadPoint => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const angle = (a: number) => ((a % TAU) + TAU) % TAU;
function vertices(r: Record, code = 10) {
  const list: Array<CadPoint & { bulge: number }> = [];
  for (const [key, value] of r.pairs) {
    if (key === code) list.push({ x: Number(value), y: NaN, bulge: 0 });
    else if (key === code + 10 && list.length) list.at(-1)!.y = Number(value);
    else if (key === 42 && list.length) list.at(-1)!.bulge = Number(value);
  }
  if (list.some((p) => ![p.x, p.y, p.bulge].every(Number.isFinite)))
    throw new CadOperationError("geometry");
  return list;
}
function require2d(r: Record) {
  // Constant elevation is planar. Extrusion along -Z is valid OCS, not 3D.
  const z =
    r.type === "LINE"
      ? [get(r, 30), get(r, 31)]
      : r.type === "3DFACE"
        ? [30, 31, 32, 33].map((c) => get(r, c))
        : r.pairs.filter(([c]) => c === 30).map(([, v]) => Number(v));
  get(r, 38); // Validate elevation even though only XY is retained.
  if (r.type === "ELLIPSE" && Math.abs(get(r, 31)) > 1e-8)
    throw new CadOperationError("unsupported");
  if (
    z.some((v) => !Number.isFinite(v) || Math.abs(v - z[0]) > 1e-8) ||
    get(r, 39) ||
    Math.abs(get(r, 210)) > 1e-8 ||
    Math.abs(get(r, 220)) > 1e-8 ||
    Math.abs(Math.abs(get(r, 230, 1)) - 1) > 1e-8
  )
    throw new CadOperationError("unsupported");
  if (get(r, 67) || get(r, 60)) throw new CadOperationError("unsupported");
}
/** Exact conversion of clamped, non-rational degree 1–3 B-splines by knot insertion. */
export function splineContour(
  controls: CadPoint[],
  knots: number[],
  degree: number,
  closed: boolean,
): CadContour {
  let p = controls.map((v) => ({ ...v })),
    u = [...knots];
  if (
    !Number.isInteger(degree) ||
    degree < 1 ||
    degree > 3 ||
    p.length < degree + 1 ||
    p.length > 4096 ||
    u.length !== p.length + degree + 1 ||
    u.some((v, i) => !Number.isFinite(v) || (i && v < u[i - 1])) ||
    p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))
  )
    throw new CadOperationError("unsupported");
  const low = u[degree],
    high = u[p.length];
  if (
    !(high > low) ||
    u.slice(0, degree + 1).some((v) => v !== low) ||
    u.slice(-degree - 1).some((v) => v !== high)
  )
    throw new CadOperationError("unsupported");
  const inner = [...new Set(u.filter((v) => v > low && v < high))];
  for (const value of inner) {
    let multiplicity = u.filter((v) => v === value).length;
    if (multiplicity > degree) throw new CadOperationError("unsupported");
    while (multiplicity < degree) {
      const k = u.findIndex((v) => v > value) - 1,
        q: CadPoint[] = [];
      for (let i = 0; i <= k - degree; i++) q[i] = p[i];
      for (let i = k - multiplicity; i < p.length; i++) q[i + 1] = p[i];
      for (let i = k - degree + 1; i <= k - multiplicity; i++)
        q[i] = mix(p[i - 1], p[i], (value - u[i]) / (u[i + degree] - u[i]));
      p = q;
      u.splice(k + 1, 0, value);
      multiplicity++;
      if (p.length > 12000) throw new CadOperationError("limit");
    }
  }
  const nodes = [nodeAt(p[0])];
  for (let i = 0; i < p.length - 1; i += degree) {
    const a = nodes.at(-1)!,
      b = nodeAt(p[i + degree]);
    if (degree > 1) {
      const c1 = degree === 2 ? mix(p[i], p[i + 1], 2 / 3) : p[i + 1],
        c2 = degree === 2 ? mix(p[i + 2], p[i + 1], 2 / 3) : p[i + 2];
      a.outX = c1.x - a.x;
      a.outY = c1.y - a.y;
      b.inX = c2.x - b.x;
      b.inY = c2.y - b.y;
    }
    nodes.push(b);
  }
  if (closed) {
    const first = nodes[0],
      last = nodes.at(-1)!;
    if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-8)
      throw new CadOperationError("unsupported");
    first.inX = last.inX;
    first.inY = last.inY;
    nodes.pop();
  }
  return { closed, nodes };
}
/** Bounds of the created entities, including analytic arcs/ellipses (not preview samples). */
function plannedBounds(shapes: CadPlannedShape[]) {
  const points: CadPoint[] = [];
  for (const shape of shapes) {
    const p = shape.props as any,
      rotation = shape.rotation ?? 0,
      c = Math.cos(rotation),
      s = Math.sin(rotation);
    if (shape.type === "cad-ellipse") {
      const rx = p.w / 2,
        ry = p.h / 2,
        x = shape.x + c * rx - s * ry,
        y = shape.y + s * rx + c * ry;
      const dx = Math.hypot(rx * c, ry * s),
        dy = Math.hypot(rx * s, ry * c);
      points.push({ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy });
    } else if (shape.type === "cad-arc") {
      const start = (p.startAngle * Math.PI) / 180,
        sweep = ((p.endAngle - p.startAngle) * Math.PI) / 180;
      for (const a of [
        start,
        start + sweep,
        ...[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].filter(
          (a) => angle(a - start) <= sweep,
        ),
      ])
        points.push({
          x: shape.x + p.radius * Math.cos(a),
          y: shape.y - p.radius * Math.sin(a),
        });
    } else {
      const b = curveBounds(p.contours);
      points.push(
        { x: shape.x + b.x, y: shape.y + b.y },
        { x: shape.x + b.x + b.w, y: shape.y + b.y + b.h },
      );
    }
  }
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...points.map((p) => p.x)) - x,
    h: Math.max(...points.map((p) => p.y)) - y,
  };
}
function parse(text: string) {
  if (text.length > 8 * 1024 * 1024) throw new CadOperationError("limit");
  if (/AutoCAD Binary DXF|\0/.test(text)) throw new CadOperationError("format");
  const lines = text
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  if (lines.length % 2 || lines.length > 500000)
    throw new CadOperationError("format");
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!lines[i].trim() || !Number.isInteger(code) || code < 0 || code > 1071)
      throw new CadOperationError("format");
    pairs.push([code, [1,3].includes(code)?lines[i+1]:lines[i + 1].trim()]);
  }
  if (pairs.at(-1)?.[0] !== 0 || pairs.at(-1)?.[1] !== "EOF")
    throw new CadOperationError("format");
  const records: Record[] = [];
  for (const pair of pairs) {
    if (pair[0] === 0) records.push({ type: pair[1], pairs: [] });
    else if (records.length) records.at(-1)!.pairs.push(pair);
    else throw new CadOperationError("format");
  }
  if (records.length > 20000) throw new CadOperationError("limit");
  const hiddenLayers = new Set<string>();
  const layers = new Map<string, Record>();
  const styles = new Map<string, Record>();
  const entities: Record[] = [],
    blocks = new Map<string, { base: CadPoint & {z?:number}; records: Record[] }>();
  let section = "",
    block: { base: CadPoint & {z?:number}; records: Record[] } | null = null,
    units = 0;
  for (const r of records) {
    if (r.type === "SECTION") {
      if (section) throw new CadOperationError("format");
      section = word(r, 2);
      if (section === "HEADER") {
        const index = r.pairs.findIndex(
          (p) => p[0] === 9 && p[1] === "$INSUNITS",
        );
        if (index >= 0) units = Number(r.pairs[index + 1]?.[1]);
      }
      continue;
    }
    if (r.type === "ENDSEC") {
      section = "";
      block = null;
      continue;
    }
    if(section === "TABLES" && r.type === "STYLE") styles.set(word(r,2),r);
    if (section === "TABLES" && r.type === "LAYER") {
      layers.set(word(r, 2), r);
      if (get(r, 70) & 1 || get(r, 62, 7) < 0) hiddenLayers.add(word(r, 2));
    }
    if (section === "ENTITIES") entities.push(r);
    else if (section === "BLOCKS") {
      if (r.type === "BLOCK") {
        block = { base: {...point(r),z:get(r,30)}, records: [] };
        blocks.set(word(r, 2), block);
      } else if (r.type === "ENDBLK") block = null;
      else block?.records.push(r);
    }
  }
  if (section || !pairs.some((p) => p[0] === 2 && p[1] === "ENTITIES"))
    throw new CadOperationError("format");
  return { entities, blocks, units, hiddenLayers, layers, styles };
}
/** Bounded ASCII DXF intake. Unsupported entities remain visible in the review report. */
export function prepareCadImport(
  editor: Editor,
  settings: CadSettings,
  text: string,
  options: { unit?: CadUnit; keepCoordinates: boolean; font?:any; projection?:"strict"|"xy"|"xz"|"yz" },
): CadImportPlan {
  assertCadEditable(editor);
  if (!validateCadSettings(settings)) throw new CadOperationError("geometry");
  const parsed = parse(text),
    known: { [key: number]: [string, number] } = {
      1: ["in", 25.4],
      2: ["ft", 304.8],
      4: ["mm", 1],
      5: ["cm", 10],
      6: ["m", 1000],
      7: ["km", 1e6],
      9: ["mil", 0.0254],
      10: ["yd", 914.4],
      13: ["µm", 0.001],
    };
  if (options.unit && !["mm", "cm", "m", "in"].includes(options.unit))
    throw new CadOperationError("unit");
  const sourceUnit = options.unit ?? known[parsed.units]?.[0] ?? "",
    requiresUnit = !sourceUnit;
  const factor =
    (options.unit ? unitMm(options.unit) : (known[parsed.units]?.[1] ?? 1)) /
    cadMmPerPixel(settings);
  const root: Matrix = [
    factor,
    0,
    0,
    -factor,
    settings.originX,
    settings.originY,
  ];
  const contours: CadContour[] = [],
    shapes: CadPlannedShape[] = [],
    omitted: CadImportPlan["omitted"] = [];
  let seen = 0,
    approximated = false;
  const extraWarnings = new Set<string>();
  const appendCurves = (
    curves: CadContour[],
    m: Matrix,
    r: Record,
    filled = false,
    fillRule: "evenodd"|"nonzero" = "evenodd",
  ) => {
    const mapped = mapContours(curves, (p) => transform(m, p));
    if (!validContours(mapped)) throw new CadOperationError("geometry");
    contours.push(...mapped);
    const color = dxfColor(get(r, 420, -1), get(r, 62, 7));
    shapes.push({
      type: "cad-bezier",
      x: 0,
      y: 0,
      props: { contours: mapped, fillRule },
      meta: {
        omsObjectName: word(r, 8) || r.type,
        omsVectorPaint: {
          ...VECTOR_DEFAULT_PAINT,
          dash: [],
          fill: filled ? color : "none",
          stroke: filled ? "none" : color,
        },
      },
    });
  };
  const appendCurve = (curve: CadContour, m: Matrix, r: Record) =>
    appendCurves([curve], m, r);
  const walk = (
    records: Record[],
    parent: Matrix,
    ancestors: string[],
    inherited?: Record,
  ) => {
    for (let index = 0; index < records.length; index++) {
      const original = records[index];
      const layerName =
        !word(original, 8) || word(original, 8) === "0"
          ? word(inherited ?? original, 8) || "0"
          : word(original, 8);
      const layer = parsed.layers.get(layerName);
      const style =
        get(original, 62, 256) === 0
          ? inherited
          : get(original, 62, 256) === 256
            ? layer
            : original;
      const r: Record = {
        ...original,
        pairs: original.pairs
          .filter(([c]) => ![8, 62, 420].includes(c))
          .concat(
            [
              [8, layerName],
              [
                62,
                String(
                  get(original, 62, 256) > 0 && get(original, 62, 256) < 256
                    ? get(original, 62)
                    : get(style ?? original, 62, 7),
                ),
              ],
            ],
            word(original, 420) || word(style ?? original, 420)
              ? [[420, word(original, 420) || word(style ?? original, 420)]]
              : [],
          ),
      };
      const ocs = [
        "INSERT",
        "CIRCLE",
        "ARC",
        "LWPOLYLINE",
        "POLYLINE",
        "SOLID",
        "TRACE",
        "HATCH", "TEXT", "ATTRIB", "ATTDEF",
      ].includes(r.type);
      const m =
        r.projectedMatrix ? multiply(root,r.projectedMatrix) : ocs && get(r, 230, 1) < 0
          ? multiply(parent, [-1, 0, 0, 1, 0, 0])
          : parent;
      if (++seen > 4000) throw new CadOperationError("limit");
      try {
        if(!r.projectedMatrix)require2d(r);
        if (
          r.pairs.some(
            ([c, v]) => [30, 31, 32, 33, 38].includes(c) && Number(v) !== 0,
          )
        )
          extraWarnings.add("import-elevation");
        if (parsed.hiddenLayers.has(layerName))
          throw new CadOperationError("unsupported");
        if(r.projectedContours){appendCurves(r.projectedContours,m,r);approximated ||= r.type === "ELLIPSE";continue;}
        if (r.type === "SEQEND" || (r.type === "ATTDEF" && (!(get(r,70)&2)||!!(get(r,70)&1))))
          continue;
        if (r.type === "INSERT" || r.type === "DIMENSION") {
          const name = word(r, 2),
            block = parsed.blocks.get(name);
          if (!block || ancestors.includes(name) || ancestors.length >= 8)
            throw new CadOperationError("unsupported");
          if (r.type === "DIMENSION") {
            // Anonymous dimension blocks are already in WCS. Group 10 is a definition point, not insertion.
            walk(block.records, parent, [...ancestors, name], r);
            extraWarnings.add("import-dimension");
            continue;
          }
          const sx = get(r, 41, 1),
            sy = get(r, 42, 1),
            rotation = (get(r, 50) * Math.PI) / 180,
            c = Math.cos(rotation),
            s = Math.sin(rotation),
            location = point(r),
            columns = get(r, 70, 1),
            rows = get(r, 71, 1);
          if (
            !sx ||
            !sy ||
            !Number.isSafeInteger(columns) ||
            !Number.isSafeInteger(rows) ||
            columns < 1 ||
            rows < 1
          )
            throw new CadOperationError("geometry");
          if (columns * rows > 2000) throw new CadOperationError("limit");
          for (let row = 0; row < rows; row++)
            for (let col = 0; col < columns; col++) {
              // Array spacing rotates with the block but is not multiplied by its scale.
              const dx = col * get(r, 44),
                dy = row * get(r, 45);
              const local: Matrix = [
                c * sx,
                s * sx,
                -s * sy,
                c * sy,
                location.x -
                  c * sx * block.base.x +
                  s * sy * block.base.y +
                  c * dx -
                  s * dy,
                location.y -
                  s * sx * block.base.x -
                  c * sy * block.base.y +
                  s * dx +
                  c * dy,
              ];
              walk(block.records, multiply(m, local), [...ancestors, name], r);
            }
          continue;
        }
        if (["TEXT","MTEXT","ATTRIB","ATTDEF"].includes(r.type)) {
          const text=dxfTextContours(r,options.font,parsed.styles.get(word(r,7)||'STANDARD'));
          if(text.contours.length){
            appendCurves(text.contours,m,r,true,'nonzero');
            shapes.at(-1)!.meta={...shapes.at(-1)!.meta,omsSourceText:text.text,omsFontName:options.font.fullName??'Selected font'};
            extraWarnings.add('import-font-substitution');
            if(text.formatting)extraWarnings.add('text-layout-review');
          }
          continue;
        }
        if (["SOLID", "TRACE", "3DFACE"].includes(r.type)) {
          if (r.type === "3DFACE" && get(r, 70))
            throw new CadOperationError("unsupported");
          const ps = (
            r.type === "3DFACE" ? [10, 11, 12, 13] : [10, 11, 13, 12]
          ).map((c) => point(r, c));
          const unique = ps.filter(
            (p, i) =>
              !i || Math.hypot(p.x - ps[i - 1].x, p.y - ps[i - 1].y) > 1e-9,
          );
          if (
            unique.length > 2 &&
            Math.hypot(
              unique[0].x - unique.at(-1)!.x,
              unique[0].y - unique.at(-1)!.y,
            ) < 1e-9
          )
            unique.pop();
          if (unique.length < 3) throw new CadOperationError("geometry");
          appendCurves(
            [{ closed: true, nodes: unique.map(nodeAt) }],
            m,
            r,
            true,
          );
          continue;
        }
        if (r.type === "HATCH") {
          const result = hatchContours(
            r.pairs,
            0.002 / cadMmPerPixel(settings) / matrixScale(m),
          );
          appendCurves(result.contours, m, r, get(r, 70) === 1 && !get(r, 450));
          approximated ||= result.approximated;
          if (get(r, 70) !== 1 || get(r, 450))
            extraWarnings.add("import-hatch-boundary");
          continue;
        }
        if (r.type === "LINE") {
          appendCurve(
            { closed: false, nodes: [nodeAt(point(r)), nodeAt(point(r, 11))] },
            m,
            r,
          );
          continue;
        }
        if (r.type === "LWPOLYLINE" || r.type === "POLYLINE") {
          if (
            get(r, 70) & ~137 ||
            r.pairs.some(
              ([code, value]) =>
                [40, 41, 43].includes(code) && Number(value) !== 0,
            )
          )
            throw new CadOperationError("unsupported");
          const closed = !!(get(r, 70) & 1);
          let points = vertices(r);
          if (r.type === "POLYLINE") {
            points = [];
            let elevation: number | undefined;
            while (records[index + 1]?.type === "VERTEX") {
              const vertex = records[++index];
              if(!r.projectedMatrix)require2d(vertex);
              if (
                elevation !== undefined &&
                Math.abs(get(vertex, 30) - elevation) > 1e-8
              )
                throw new CadOperationError("unsupported");
              elevation = get(vertex, 30);
              if (get(vertex, 70) & ~32 || get(vertex, 40) || get(vertex, 41))
                throw new CadOperationError("unsupported");
              points.push({ ...point(vertex), bulge: get(vertex, 42) });
            }
            if (records[index + 1]?.type !== "SEQEND")
              throw new CadOperationError("geometry");
            index++;
          }
          if (
            points.length < 2 ||
            points.length > 4096 ||
            (r.type === "LWPOLYLINE" &&
              get(r, 90, points.length) !== points.length)
          )
            throw new CadOperationError("geometry");
          if (
            closed &&
            Math.hypot(
              points[0].x - points.at(-1)!.x,
              points[0].y - points.at(-1)!.y,
            ) < 1e-9
          )
            points.pop();
          const curve = polylineContour(
            points,
            closed,
            0.002 / cadMmPerPixel(settings) / matrixScale(m),
          );
          approximated ||= points.some((p) => p.bulge !== 0);
          appendCurve(curve, m, r);
          continue;
        }
        if (r.type === "SPLINE") {
          const controls = vertices(r),
            knots = r.pairs.filter((p) => p[0] === 40).map((p) => Number(p[1]));
          if (
            get(r, 72, knots.length) !== knots.length ||
            get(r, 73, controls.length) !== controls.length
          )
            throw new CadOperationError("geometry");
          const weights = r.pairs
            .filter((p) => p[0] === 41)
            .map((p) => Number(p[1]));
          const degree = get(r, 71);
          const rational =
            weights.some((w) => w !== 1) ||
            degree > 3 ||
            !!(get(r, 70) & 2) ||
            knots.slice(0, degree + 1).some((v) => v !== knots[degree]) ||
            knots.slice(-degree - 1).some((v) => v !== knots[controls.length]);
          if (weights.length && weights.length !== controls.length)
            throw new CadOperationError("geometry");
          const contour = rational
            ? rationalSplineContour(
                controls,
                weights.length ? weights : controls.map(() => 1),
                knots,
                get(r, 71),
                !!(get(r, 70) & 1),
                0.002 / cadMmPerPixel(settings) / matrixScale(m),
              )
            : splineContour(controls, knots, get(r, 71), !!(get(r, 70) & 1));
          if (rational) approximated = true;
          appendCurve(contour, m, r);
          continue;
        }
        if (["CIRCLE", "ARC", "ELLIPSE"].includes(r.type)) {
          const center = point(r),
            origin = transform(m, center),
            isEllipse = r.type === "ELLIPSE",
            major = isEllipse ? point(r, 11) : { x: get(r, 40), y: 0 },
            radius = Math.hypot(major.x, major.y),
            ratio = isEllipse ? get(r, 40) : 1;
          if (!(radius > 0) || !(ratio > 0) || ratio > 1)
            throw new CadOperationError("geometry");
          const vector = {
              x: m[0] * major.x + m[2] * major.y,
              y: m[1] * major.x + m[3] * major.y,
            },
            a = Math.atan2(vector.y, vector.x),
            rx = Math.hypot(vector.x, vector.y),
            ry = rx * ratio;
          const start = isEllipse ? get(r, 41) : (get(r, 50) * Math.PI) / 180,
            rawEnd = isEllipse ? get(r, 42, TAU) : (get(r, 51) * Math.PI) / 180,
            full =
              r.type === "CIRCLE" ||
              (isEllipse && Math.abs(rawEnd - start) >= TAU - 1e-9);
          const sweep = full ? TAU : angle(rawEnd - start);
          if (!sweep) throw new CadOperationError("geometry");
          const rotation = Math.atan2(major.y, major.x),
            c = Math.cos(rotation),
            s = Math.sin(rotation);
          const step = Math.min(
            Math.PI / 2,
            Math.pow(
              (0.002 / cadMmPerPixel(settings) / (radius * matrixScale(m))) *
                10000,
              1 / 6,
            ),
          );
          const curve = arcContour(
              0,
              0,
              radius,
              radius * ratio,
              start,
              sweep,
              step,
            ),
            mapped = mapContours([curve], (p) =>
              transform(m, {
                x: center.x + c * p.x - s * p.y,
                y: center.y + s * p.x + c * p.y,
              }),
            );
          if (!validContours(mapped)) throw new CadOperationError("geometry");
          const similar =
            Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-8 &&
            Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-8;
          if (!similar || (isEllipse && get(r, 230, 1) < 0)) {
            const minorSign = isEllipse ? get(r, 230, 1) : 1;
            appendCurve(
              curve,
              multiply(m, [
                c,
                s,
                -s * minorSign,
                c * minorSign,
                center.x,
                center.y,
              ]),
              r,
            );
            approximated = true;
          } else if (full) {
            contours.push(...mapped);
            shapes.push({
              type: "cad-ellipse",
              x: origin.x - rx * Math.cos(a) + ry * Math.sin(a),
              y: origin.y - rx * Math.sin(a) - ry * Math.cos(a),
              rotation: a,
              props: { w: 2 * rx, h: 2 * ry },
              meta: {
                omsObjectName: word(r, 8) || r.type,
                omsVectorPaint: {
                  ...VECTOR_DEFAULT_PAINT,
                  dash: [],
                  stroke: dxfColor(get(r, 420, -1), get(r, 62, 7)),
                },
              },
            });
          } else if (!isEllipse) {
            const mirrored = m[0] * m[3] - m[1] * m[2] > 0,
              endpoint = transform(m, {
                x: center.x + radius * Math.cos(mirrored ? rawEnd : start),
                y: center.y + radius * Math.sin(mirrored ? rawEnd : start),
              });
            const startAngle =
              (angle(
                Math.atan2(-(endpoint.y - origin.y), endpoint.x - origin.x),
              ) *
                180) /
              Math.PI;
            contours.push(...mapped);
            shapes.push({
              type: "cad-arc",
              x: origin.x,
              y: origin.y,
              props: {
                radius: rx,
                startAngle,
                endAngle: startAngle + (sweep * 180) / Math.PI,
              },
              meta: {
                omsObjectName: word(r, 8) || r.type,
                omsVectorPaint: {
                  ...VECTOR_DEFAULT_PAINT,
                  dash: [],
                  stroke: dxfColor(get(r, 420, -1), get(r, 62, 7)),
                },
              },
            });
          } else {
            appendCurve(
              curve,
              multiply(m, [c, s, -s, c, center.x, center.y]),
              r,
            );
            approximated = true;
          }
          continue;
        }
        throw new CadOperationError("unsupported");
      } catch (error) {
        if (
          (error as CadOperationError).code === "limit" ||
          (error as Error).message === "limit"
        )
          throw new CadOperationError("limit");
        omitted.push({
          type: r.type,
          reason: (error as CadOperationError).code ?? "geometry",
        });
        // Discard remaining children of a rejected legacy POLYLINE as one omitted entity.
        if (r.type === "POLYLINE") {
          while (["VERTEX", "SEQEND"].includes(records[index + 1]?.type))
            index++;
        }
      }
    }
  };
  if(options.projection && options.projection !== 'strict') {
    const projected=projectDxfRecords(parsed.entities,parsed.blocks,options.projection,0.002/(options.unit?unitMm(options.unit):(known[parsed.units]?.[1]??1)),parsed.hiddenLayers,parsed.layers);
    omitted.push(...projected.omitted);walk(projected.records,root,[]);extraWarnings.add('import-3d-projection');
  } else walk(parsed.entities, root, []);
  if (shapes.length > 2000 || (contours.length && !validContours(contours)))
    throw new CadOperationError("limit");
  let finalContours = contours;
  const bounds = plannedBounds(shapes);
  if (!options.keepCoordinates && contours.length) {
    const dx = settings.originX - bounds.x,
      dy = settings.originY - bounds.y - bounds.h;
    finalContours = mapContours(contours, (p) => ({
      x: p.x + dx,
      y: p.y + dy,
    }));
    for (const shape of shapes) {
      shape.x += dx;
      shape.y += dy;
    }
  }
  if (finalContours.length && !validContours(finalContours))
    throw new CadOperationError("geometry");
  return {
    revision: cadRevision(editor),
    contours: finalContours,
    sourceIds: [],
    removeIds: [],
    name: "DXF import",
    warnings: [
      ...(approximated ? ["import-curves-approximated"] : []),
      ...extraWarnings,
    ],
    widthMm: bounds.w * cadMmPerPixel(settings),
    heightMm: bounds.h * cadMmPerPixel(settings),
    shapes,
    omitted,
    sourceUnit,
    requiresUnit,
    blocked: requiresUnit || !contours.length,
  };
}
