import type { Editor } from '@tldraw/tldraw';
import {
  cadMmPerPixel,
  unitMm,
  validateCadSettings,
  type CadPoint,
  type CadSettings,
  type CadUnit
} from './cad-settings';
import { arcContour, curveBounds, mapContours, mix, nodeAt, validContours, type CadContour } from './cad-curves';
import { assertCadEditable, cadRevision, CadOperationError, type CadPlan, type CadPlannedShape } from './cad-plans';

export interface CadImportPlan extends CadPlan {
  omitted: { type: string; reason: string }[];
  sourceUnit: string;
  requiresUnit: boolean;
}
type Pair = [number, string];
type Record = { type: string; pairs: Pair[] };
type Matrix = [number, number, number, number, number, number];
const TAU = Math.PI * 2;
const get = (r: Record, code: number, fallback = 0) => {
  const value = r.pairs.find((p) => p[0] === code);
  const n = value ? Number(value[1]) : fallback;
  if (!Number.isFinite(n)) throw new CadOperationError('geometry');
  return n;
};
const word = (r: Record, code: number) => r.pairs.find((p) => p[0] === code)?.[1] ?? '';
const point = (r: Record, code = 10): CadPoint => ({ x: get(r, code), y: get(r, code + 10) });
const transform = (m: Matrix, p: CadPoint): CadPoint => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5]
});
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5]
];
const angle = (a: number) => ((a % TAU) + TAU) % TAU;
function vertices(r: Record, code = 10) {
  const list: Array<CadPoint & { bulge: number }> = [];
  for (const [key, value] of r.pairs) {
    if (key === code) list.push({ x: Number(value), y: NaN, bulge: 0 });
    else if (key === code + 10 && list.length) list.at(-1)!.y = Number(value);
    else if (key === 42 && list.length) list.at(-1)!.bulge = Number(value);
  }
  if (list.some((p) => ![p.x, p.y, p.bulge].every(Number.isFinite))) throw new CadOperationError('geometry');
  return list;
}
function require2d(r: Record) {
  if (
    r.pairs.some(
      ([code, value]) =>
        ([30, 31, 32, 33, 38, 39, 210, 220].includes(code) &&
          (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e-9)) ||
        (code === 230 && Number(value) !== 1)
    )
  )
    throw new CadOperationError('unsupported');
  if (get(r, 67) || get(r, 60)) throw new CadOperationError('unsupported');
}
/** Exact conversion of clamped, non-rational degree 1–3 B-splines by knot insertion. */
export function splineContour(controls: CadPoint[], knots: number[], degree: number, closed: boolean): CadContour {
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
    throw new CadOperationError('unsupported');
  const low = u[degree],
    high = u[p.length];
  if (!(high > low) || u.slice(0, degree + 1).some((v) => v !== low) || u.slice(-degree - 1).some((v) => v !== high))
    throw new CadOperationError('unsupported');
  const inner = [...new Set(u.filter((v) => v > low && v < high))];
  for (const value of inner) {
    let multiplicity = u.filter((v) => v === value).length;
    if (multiplicity > degree) throw new CadOperationError('unsupported');
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
      if (p.length > 12000) throw new CadOperationError('limit');
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
    if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-8) throw new CadOperationError('unsupported');
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
    if (shape.type === 'cad-ellipse') {
      const rx = p.w / 2,
        ry = p.h / 2,
        x = shape.x + c * rx - s * ry,
        y = shape.y + s * rx + c * ry;
      const dx = Math.hypot(rx * c, ry * s),
        dy = Math.hypot(rx * s, ry * c);
      points.push({ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy });
    } else if (shape.type === 'cad-arc') {
      const start = (p.startAngle * Math.PI) / 180,
        sweep = ((p.endAngle - p.startAngle) * Math.PI) / 180;
      for (const a of [
        start,
        start + sweep,
        ...[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].filter((a) => angle(a - start) <= sweep)
      ])
        points.push({ x: shape.x + p.radius * Math.cos(a), y: shape.y - p.radius * Math.sin(a) });
    } else {
      const b = curveBounds(p.contours);
      points.push({ x: shape.x + b.x, y: shape.y + b.y }, { x: shape.x + b.x + b.w, y: shape.y + b.y + b.h });
    }
  }
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return { x, y, w: Math.max(...points.map((p) => p.x)) - x, h: Math.max(...points.map((p) => p.y)) - y };
}
function parse(text: string) {
  if (text.length > 8 * 1024 * 1024) throw new CadOperationError('limit');
  if (/AutoCAD Binary DXF|\0/.test(text)) throw new CadOperationError('format');
  const lines = text
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split(/\r?\n/);
  if (lines.length % 2 || lines.length > 500000) throw new CadOperationError('format');
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!lines[i].trim() || !Number.isInteger(code) || code < 0 || code > 1071) throw new CadOperationError('format');
    pairs.push([code, lines[i + 1].trim()]);
  }
  if (pairs.at(-1)?.[0] !== 0 || pairs.at(-1)?.[1] !== 'EOF') throw new CadOperationError('format');
  const records: Record[] = [];
  for (const pair of pairs) {
    if (pair[0] === 0) records.push({ type: pair[1], pairs: [] });
    else if (records.length) records.at(-1)!.pairs.push(pair);
    else throw new CadOperationError('format');
  }
  if (records.length > 20000) throw new CadOperationError('limit');
  const hiddenLayers = new Set<string>();
  const entities: Record[] = [],
    blocks = new Map<string, { base: CadPoint; records: Record[] }>();
  let section = '',
    block: { base: CadPoint; records: Record[] } | null = null,
    units = 0;
  for (const r of records) {
    if (r.type === 'SECTION') {
      if (section) throw new CadOperationError('format');
      section = word(r, 2);
      if (section === 'HEADER') {
        const index = r.pairs.findIndex((p) => p[0] === 9 && p[1] === '$INSUNITS');
        if (index >= 0) units = Number(r.pairs[index + 1]?.[1]);
      }
      continue;
    }
    if (r.type === 'ENDSEC') {
      section = '';
      block = null;
      continue;
    }
    if (section === 'TABLES' && r.type === 'LAYER' && (get(r, 70) & 1 || get(r, 62, 7) < 0))
      hiddenLayers.add(word(r, 2));
    if (section === 'ENTITIES') entities.push(r);
    else if (section === 'BLOCKS') {
      if (r.type === 'BLOCK') {
        require2d(r);
        block = { base: point(r), records: [] };
        blocks.set(word(r, 2), block);
      } else if (r.type === 'ENDBLK') block = null;
      else block?.records.push(r);
    }
  }
  if (section || !pairs.some((p) => p[0] === 2 && p[1] === 'ENTITIES')) throw new CadOperationError('format');
  return { entities, blocks, units, hiddenLayers };
}
/** Bounded ASCII DXF intake. Unsupported entities remain visible in the review report. */
export function prepareCadImport(
  editor: Editor,
  settings: CadSettings,
  text: string,
  options: { unit?: CadUnit; keepCoordinates: boolean }
): CadImportPlan {
  assertCadEditable(editor);
  if (!validateCadSettings(settings)) throw new CadOperationError('geometry');
  const parsed = parse(text),
    known: { [key: number]: [string, number] } = {
      1: ['in', 25.4],
      2: ['ft', 304.8],
      4: ['mm', 1],
      5: ['cm', 10],
      6: ['m', 1000],
      7: ['km', 1e6],
      9: ['mil', 0.0254],
      10: ['yd', 914.4],
      13: ['µm', 0.001]
    };
  if (options.unit && !['mm', 'cm', 'm', 'in'].includes(options.unit)) throw new CadOperationError('unit');
  const sourceUnit = options.unit ?? known[parsed.units]?.[0] ?? '',
    requiresUnit = !sourceUnit;
  const factor = (options.unit ? unitMm(options.unit) : (known[parsed.units]?.[1] ?? 1)) / cadMmPerPixel(settings);
  const root: Matrix = [factor, 0, 0, -factor, settings.originX, settings.originY];
  const contours: CadContour[] = [],
    shapes: CadPlannedShape[] = [],
    omitted: CadImportPlan['omitted'] = [];
  let seen = 0,
    approximated = false;
  const appendCurve = (curve: CadContour, m: Matrix, r: Record) => {
    const mapped = mapContours([curve], (p) => transform(m, p));
    if (!validContours(mapped)) throw new CadOperationError('geometry');
    contours.push(...mapped);
    shapes.push({
      type: 'cad-bezier',
      x: 0,
      y: 0,
      props: { contours: mapped },
      meta: { omsObjectName: word(r, 8) || r.type }
    });
  };
  const walk = (records: Record[], m: Matrix, ancestors: string[]) => {
    for (let index = 0; index < records.length; index++) {
      const r = records[index];
      if (++seen > 4000) throw new CadOperationError('limit');
      try {
        require2d(r);
        if (parsed.hiddenLayers.has(word(r, 8))) throw new CadOperationError('unsupported');
        if (r.type === 'INSERT') {
          const name = word(r, 2),
            block = parsed.blocks.get(name),
            sx = get(r, 41, 1),
            sy = get(r, 42, 1),
            rotation = (get(r, 50) * Math.PI) / 180,
            c = Math.cos(rotation),
            s = Math.sin(rotation),
            location = point(r);
          if (
            !block ||
            ancestors.includes(name) ||
            ancestors.length >= 8 ||
            !sx ||
            !sy ||
            Math.abs(Math.abs(sx) - Math.abs(sy)) > 1e-9 ||
            get(r, 70, 1) !== 1 ||
            get(r, 71, 1) !== 1
          )
            throw new CadOperationError('unsupported');
          const local: Matrix = [
            c * sx,
            s * sx,
            -s * sy,
            c * sy,
            location.x - c * sx * block.base.x + s * sy * block.base.y,
            location.y - s * sx * block.base.x - c * sy * block.base.y
          ];
          walk(block.records, multiply(m, local), [...ancestors, name]);
          continue;
        }
        if (r.type === 'LINE') {
          appendCurve({ closed: false, nodes: [nodeAt(point(r)), nodeAt(point(r, 11))] }, m, r);
          continue;
        }
        if (r.type === 'LWPOLYLINE' || r.type === 'POLYLINE') {
          if (get(r, 70) & ~129 || r.pairs.some(([code, value]) => [40, 41, 43].includes(code) && Number(value) !== 0))
            throw new CadOperationError('unsupported');
          const closed = !!(get(r, 70) & 1);
          let points = vertices(r);
          if (r.type === 'POLYLINE') {
            points = [];
            while (records[index + 1]?.type === 'VERTEX') {
              const vertex = records[++index];
              require2d(vertex);
              if (get(vertex, 70) || get(vertex, 40) || get(vertex, 41)) throw new CadOperationError('unsupported');
              points.push({ ...point(vertex), bulge: get(vertex, 42) });
            }
            if (records[index + 1]?.type !== 'SEQEND') throw new CadOperationError('geometry');
            index++;
          }
          if (
            points.length < 2 ||
            points.length > 4096 ||
            (r.type === 'LWPOLYLINE' && get(r, 90, points.length) !== points.length)
          )
            throw new CadOperationError('geometry');
          if (closed && Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) < 1e-9) points.pop();
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
              if (!length) throw new CadOperationError('geometry');
              const k = (1 - bulge * bulge) / (4 * bulge),
                cx = (a.x + b.x) / 2 - dy * k,
                cy = (a.y + b.y) / 2 + dx * k,
                radius = (length * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
              const step = Math.min(
                Math.PI / 2,
                Math.pow((0.002 / cadMmPerPixel(settings) / (radius * Math.hypot(m[0], m[1]))) * 10000, 1 / 6)
              );
              const arc = arcContour(
                cx,
                cy,
                radius,
                radius,
                Math.atan2(a.y - cy, a.x - cx),
                4 * Math.atan(bulge),
                step
              );
              nodes.at(-1)!.outX = arc.nodes[0].outX;
              nodes.at(-1)!.outY = arc.nodes[0].outY;
              nodes.push(...arc.nodes.slice(1));
              approximated = true;
            }
          }
          if (closed) {
            const last = nodes.pop()!;
            nodes[0].inX = last.inX;
            nodes[0].inY = last.inY;
          }
          appendCurve({ closed, nodes }, m, r);
          continue;
        }
        if (r.type === 'SPLINE') {
          if (get(r, 70) & 2 || r.pairs.some(([code, v]) => code === 41 && Number(v) !== 1))
            throw new CadOperationError('unsupported');
          const controls = vertices(r),
            knots = r.pairs.filter((p) => p[0] === 40).map((p) => Number(p[1]));
          if (get(r, 72, knots.length) !== knots.length || get(r, 73, controls.length) !== controls.length)
            throw new CadOperationError('geometry');
          appendCurve(splineContour(controls, knots, get(r, 71), !!(get(r, 70) & 1)), m, r);
          continue;
        }
        if (['CIRCLE', 'ARC', 'ELLIPSE'].includes(r.type)) {
          const center = point(r),
            origin = transform(m, center),
            isEllipse = r.type === 'ELLIPSE',
            major = isEllipse ? point(r, 11) : { x: get(r, 40), y: 0 },
            radius = Math.hypot(major.x, major.y),
            ratio = isEllipse ? get(r, 40) : 1;
          if (!(radius > 0) || !(ratio > 0) || ratio > 1) throw new CadOperationError('geometry');
          const vector = { x: m[0] * major.x + m[2] * major.y, y: m[1] * major.x + m[3] * major.y },
            a = Math.atan2(vector.y, vector.x),
            rx = Math.hypot(vector.x, vector.y),
            ry = rx * ratio;
          const start = isEllipse ? get(r, 41) : (get(r, 50) * Math.PI) / 180,
            rawEnd = isEllipse ? get(r, 42, TAU) : (get(r, 51) * Math.PI) / 180,
            full = r.type === 'CIRCLE' || (isEllipse && Math.abs(rawEnd - start) >= TAU - 1e-9);
          const sweep = full ? TAU : angle(rawEnd - start);
          if (!sweep) throw new CadOperationError('geometry');
          const rotation = Math.atan2(major.y, major.x),
            c = Math.cos(rotation),
            s = Math.sin(rotation);
          const step = Math.min(Math.PI / 2, Math.pow((0.002 / cadMmPerPixel(settings) / rx) * 10000, 1 / 6));
          const curve = arcContour(0, 0, radius, radius * ratio, start, sweep, step),
            mapped = mapContours([curve], (p) =>
              transform(m, { x: center.x + c * p.x - s * p.y, y: center.y + s * p.x + c * p.y })
            );
          if (!validContours(mapped)) throw new CadOperationError('geometry');
          if (full) {
            contours.push(...mapped);
            shapes.push({
              type: 'cad-ellipse',
              x: origin.x - rx * Math.cos(a) + ry * Math.sin(a),
              y: origin.y - rx * Math.sin(a) - ry * Math.cos(a),
              rotation: a,
              props: { w: 2 * rx, h: 2 * ry }
            });
          } else if (!isEllipse) {
            const mirrored = m[0] * m[3] - m[1] * m[2] > 0,
              endpoint = transform(m, {
                x: center.x + radius * Math.cos(mirrored ? rawEnd : start),
                y: center.y + radius * Math.sin(mirrored ? rawEnd : start)
              });
            const startAngle = (angle(Math.atan2(-(endpoint.y - origin.y), endpoint.x - origin.x)) * 180) / Math.PI;
            contours.push(...mapped);
            shapes.push({
              type: 'cad-arc',
              x: origin.x,
              y: origin.y,
              props: { radius: rx, startAngle, endAngle: startAngle + (sweep * 180) / Math.PI }
            });
          } else {
            appendCurve(curve, multiply(m, [c, s, -s, c, center.x, center.y]), r);
            approximated = true;
          }
          continue;
        }
        throw new CadOperationError('unsupported');
      } catch (error) {
        if ((error as CadOperationError).code === 'limit' || (error as Error).message === 'limit')
          throw new CadOperationError('limit');
        omitted.push({ type: r.type, reason: (error as CadOperationError).code ?? 'geometry' });
        // Discard remaining children of a rejected legacy POLYLINE as one omitted entity.
        if (r.type === 'POLYLINE') {
          while (['VERTEX', 'SEQEND'].includes(records[index + 1]?.type)) index++;
        }
      }
    }
  };
  walk(parsed.entities, root, []);
  if (shapes.length > 2000 || (contours.length && !validContours(contours))) throw new CadOperationError('limit');
  let finalContours = contours;
  const bounds = plannedBounds(shapes);
  if (!options.keepCoordinates && contours.length) {
    const dx = settings.originX - bounds.x,
      dy = settings.originY - bounds.y - bounds.h;
    finalContours = mapContours(contours, (p) => ({ x: p.x + dx, y: p.y + dy }));
    for (const shape of shapes) {
      shape.x += dx;
      shape.y += dy;
    }
  }
  if (finalContours.length && !validContours(finalContours)) throw new CadOperationError('geometry');
  return {
    revision: cadRevision(editor),
    contours: finalContours,
    sourceIds: [],
    removeIds: [],
    name: 'DXF import',
    warnings: approximated ? ['import-curves-approximated'] : [],
    widthMm: bounds.w * cadMmPerPixel(settings),
    heightMm: bounds.h * cadMmPerPixel(settings),
    shapes,
    omitted,
    sourceUnit,
    requiresUnit,
    blocked: requiresUnit || !contours.length
  };
}
