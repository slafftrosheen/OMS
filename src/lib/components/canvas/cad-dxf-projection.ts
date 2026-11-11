import { arcContour, mapContours, nodeAt, type CadContour } from "./cad-curves";
import type { DxfPair } from "./cad-dxf-decode";
import type { VectorMatrix } from "./cad-appearance";
type V = [number, number, number];
type M = number[];
export type ProjectableDxfRecord = {
  type: string;
  pairs: DxfPair[];
  projectedMatrix?: VectorMatrix;
  projectedContours?: CadContour[];
};
const get = (r: ProjectableDxfRecord, c: number, f = 0) => {
  const value = r.pairs.find(([k]) => k === c)?.[1],
    n = value === undefined ? f : Number(value);
  if (!Number.isFinite(n)) throw new Error("geometry");
  return n;
};
const str = (r: ProjectableDxfRecord, c: number) =>
  r.pairs.find(([k]) => k === c)?.[1] ?? "";
const v = (r: ProjectableDxfRecord, c = 10): V => [
  get(r, c),
  get(r, c + 10),
  get(r, c + 20),
];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V): V => {
  const n = Math.hypot(...a);
  if (!n) throw new Error("geometry");
  return a.map((x) => x / n) as V;
};
const identity: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const point = (m: M, p: V): V => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
const mul = (a: M, b: M): M => {
  const m: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++)
      m.push(
        a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j],
      );
    m.push(
      a[i * 4] * b[3] +
        a[i * 4 + 1] * b[7] +
        a[i * 4 + 2] * b[11] +
        a[i * 4 + 3],
    );
  }
  return m;
};
/** Autodesk arbitrary axis algorithm, including the near-pole 1/64 threshold. */
export function dxfOcs(normal: V): M {
  const n = norm(normal),
    x = norm(
      cross(
        Math.abs(n[0]) < 1 / 64 && Math.abs(n[1]) < 1 / 64
          ? [0, 1, 0]
          : [0, 0, 1],
        n,
      ),
    ),
    y = cross(n, x);
  return [x[0], y[0], n[0], 0, x[1], y[1], n[1], 0, x[2], y[2], n[2], 0];
}
export function projectDxfRecords(
  records: ProjectableDxfRecord[],
  blocks: Map<
    string,
    {
      base: { x: number; y: number; z?: number };
      records: ProjectableDxfRecord[];
    }
  >,
  plane: "xy" | "xz" | "yz",
  tolerance: number,
  hiddenLayers = new Set<string>(),
  layers = new Map<string, ProjectableDxfRecord>(),
) {
  const output: ProjectableDxfRecord[] = [],
    omitted: Array<{ type: string; reason: string }> = [];
  let seen = 0;
  const project = (p: V) =>
    plane === "xy"
      ? { x: p[0], y: p[1] }
      : plane === "xz"
        ? { x: p[0], y: p[2] }
        : { x: p[1], y: p[2] };
  const affine = (m: M, z: number): VectorMatrix => {
    const o = project(point(m, [0, 0, z])),
      x = project(point(m, [1, 0, z])),
      y = project(point(m, [0, 1, z]));
    return [x.x - o.x, x.y - o.y, y.x - o.x, y.y - o.y, o.x, o.y];
  };
  const inherit = (
    r: ProjectableDxfRecord,
    parent?: ProjectableDxfRecord,
  ): ProjectableDxfRecord => {
    const layer =
      (str(r, 8) || "0") === "0"
        ? parent
          ? str(parent, 8) || "0"
          : "0"
        : str(r, 8);
    const style =
      get(r, 62, 256) === 0
        ? parent
        : get(r, 62, 256) === 256
          ? layers.get(layer)
          : r;
    const color = get(style ?? r, 62, 7),
      trueColor = str(r, 420) || str(style ?? r, 420);
    return {
      ...r,
      pairs: r.pairs
        .filter(([c]) => ![8, 62, 420].includes(c))
        .concat(
          [
            [8, layer],
            [62, String(color)],
          ],
          trueColor ? [[420, trueColor]] : [],
        ),
    };
  };
  const emitCurve = (r: ProjectableDxfRecord, cs: CadContour[]) => {
    if (output.length >= 4000) throw new Error("limit");
    output.push({
      ...r,
      projectedMatrix: [1, 0, 0, 1, 0, 0],
      projectedContours: cs,
    });
  };
  const walk = (
    list: ProjectableDxfRecord[],
    parent: M,
    ancestors: string[],
    inherited?: ProjectableDxfRecord,
  ) => {
    for (let i = 0; i < list.length; i++) {
      const r = inherit(list[i], inherited);
      if (++seen > 4000) throw new Error("limit");
      try {
        if (
          get(r, 67) ||
          get(r, 60) ||
          get(r, 39) ||
          hiddenLayers.has(str(r, 8))
        )
          throw new Error("unsupported");
        const normal: V = [get(r, 210), get(r, 220), get(r, 230, 1)],
          ocs = mul(parent, dxfOcs(normal));
        if (r.type === "INSERT" || r.type === "DIMENSION") {
          const name = str(r, 2),
            block = blocks.get(name);
          if (!block || ancestors.includes(name) || ancestors.length >= 8)
            throw new Error("unsupported");
          if (r.type === "DIMENSION") {
            walk(block.records, parent, [...ancestors, name], r);
            continue;
          }
          const sx = get(r, 41, 1),
            sy = get(r, 42, 1),
            sz = get(r, 43, 1),
            a = (get(r, 50) * Math.PI) / 180,
            c = Math.cos(a),
            s = Math.sin(a),
            location = v(r),
            cols = get(r, 70, 1),
            rows = get(r, 71, 1);
          if (
            !sx ||
            !sy ||
            !sz ||
            !Number.isInteger(cols) ||
            !Number.isInteger(rows) ||
            cols < 1 ||
            rows < 1 ||
            cols * rows > 2000
          )
            throw new Error("limit");
          for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
              const dx = col * get(r, 44),
                dy = row * get(r, 45),
                base = block.base;
              const local = [
                c * sx,
                -s * sy,
                0,
                location[0] -
                  c * sx * base.x +
                  s * sy * base.y +
                  c * dx -
                  s * dy,
                s * sx,
                c * sy,
                0,
                location[1] -
                  s * sx * base.x -
                  c * sy * base.y +
                  s * dx +
                  c * dy,
                0,
                0,
                sz,
                location[2] - sz * (base.z ?? 0),
              ];
              walk(block.records, mul(ocs, local), [...ancestors, name], r);
            }
          continue;
        }
        if (r.type === "LINE") {
          emitCurve(r, [
            {
              closed: false,
              nodes: [
                nodeAt(project(point(parent, v(r)))),
                nodeAt(project(point(parent, v(r, 11)))),
              ],
            },
          ]);
          continue;
        }
        if (r.type === "3DFACE") {
          const ps = [10, 11, 12, 13].map((c) =>
            project(point(parent, v(r, c))),
          );
          for (let j = 0; j < 4; j++)
            if (
              !(get(r, 70) & (1 << j)) &&
              Math.hypot(
                ps[j].x - ps[(j + 1) % 4].x,
                ps[j].y - ps[(j + 1) % 4].y,
              ) > 1e-10
            )
              emitCurve({ ...r, type: "LINE" }, [
                {
                  closed: false,
                  nodes: [nodeAt(ps[j]), nodeAt(ps[(j + 1) % 4])],
                },
              ]);
          continue;
        }
        if (r.type === "POLYLINE" && get(r, 70) & (8 | 16 | 64)) {
          const vertices: ProjectableDxfRecord[] = [];
          while (list[i + 1]?.type === "VERTEX") vertices.push(list[++i]);
          if (list[i + 1]?.type !== "SEQEND") throw new Error("geometry");
          i++;
          const flags = get(r, 70),
            points = vertices
              .filter((p) => !(get(p, 70) & 128) || !!(get(p, 70) & 64))
              .map((p) => project(point(parent, v(p))));
          const edge = (a: number, b: number) => {
            if (!points[a] || !points[b]) throw new Error("geometry");
            if (
              Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) >
              1e-10
            )
              emitCurve({ ...r, type: "LINE" }, [
                {
                  closed: false,
                  nodes: [nodeAt(points[a]), nodeAt(points[b])],
                },
              ]);
          };
          if (flags & 64) {
            for (const face of vertices.filter(
              (p) => get(p, 70) & 128 && !(get(p, 70) & 64),
            )) {
              const ids = [71, 72, 73, 74]
                .map((c) => get(face, c))
                .filter(Boolean);
              for (let j = 0; j < ids.length; j++)
                if (ids[j] > 0)
                  edge(
                    Math.abs(ids[j]) - 1,
                    Math.abs(ids[(j + 1) % ids.length]) - 1,
                  );
            }
          } else if (flags & 16) {
            const m = get(r, 71),
              n = get(r, 72);
            if (
              !Number.isInteger(m) ||
              !Number.isInteger(n) ||
              m * n !== points.length
            )
              throw new Error("geometry");
            for (let row = 0; row < m; row++)
              for (let col = 0; col < n; col++) {
                if (col + 1 < n) edge(row * n + col, row * n + col + 1);
                else if (flags & 32) edge(row * n + col, row * n);
                if (row + 1 < m) edge(row * n + col, (row + 1) * n + col);
                else if (flags & 1) edge(row * n + col, col);
              }
          } else {
            for (let j = 1; j < points.length; j++) edge(j - 1, j);
            if (flags & 1) edge(points.length - 1, 0);
          }
          continue;
        }
        if (r.type === "SPLINE") {
          if (r.pairs.filter(([c]) => c === 10).length > 4096)
            throw new Error("limit");
          const pairs: DxfPair[] = [];
          for (let j = 0; j < r.pairs.length; j++) {
            const [code, value] = r.pairs[j];
            if ([10, 11, 12, 13].includes(code)) {
              let y = 0,
                z = 0;
              const yi = r.pairs
                .slice(j + 1)
                .findIndex(([c]) => c === code + 10);
              if (yi >= 0) y = Number(r.pairs[j + 1 + yi][1]);
              const zi = r.pairs
                .slice(j + 1)
                .findIndex(([c]) => c === code + 20);
              if (zi >= 0) z = Number(r.pairs[j + 1 + zi][1]);
              const q = project(point(parent, [Number(value), y, z]));
              pairs.push([code, String(q.x)], [code + 10, String(q.y)]);
            } else if (
              ![20, 21, 22, 23, 30, 31, 32, 33, 210, 220, 230].includes(code)
            )
              pairs.push([code, value]);
          }
          output.push({ ...r, pairs, projectedMatrix: [1, 0, 0, 1, 0, 0] });
          continue;
        }
        if (r.type === "ELLIPSE") {
          const center = v(r),
            major = v(r, 11),
            radius = Math.hypot(...major),
            minor = norm(cross(norm(normal), major)).map(
              (n) => n * radius * get(r, 40),
            ) as V,
            start = get(r, 41),
            end = get(r, 42, Math.PI * 2);
          const sweep =
            Math.abs(end - start) >= Math.PI * 2 - 1e-8
              ? Math.PI * 2
              : (end - start + Math.PI * 2) % (Math.PI * 2);
          // Frobenius norm bounds stretch even after nested nonuniform transforms.
          const scale = Math.hypot(...parent.filter((_, i) => i % 4 !== 3));
          const curve = arcContour(
            0,
            0,
            1,
            1,
            start,
            sweep,
            Math.min(
              Math.PI / 2,
              Math.pow((tolerance / (radius * scale)) * 10000, 1 / 6),
            ),
          );
          emitCurve(
            r,
            mapContours([curve], (p) =>
              project(
                point(
                  parent,
                  center.map(
                    (n, i) => n + major[i] * p.x + minor[i] * p.y,
                  ) as V,
                ),
              ),
            ),
          );
          continue;
        }
        if (r.type === "MTEXT") {
          const origin = v(r),
            angle = (get(r, 50) * Math.PI) / 180;
          const basisOcs = dxfOcs(normal),
            useDirection =
              r.pairs.findLastIndex(([c]) => c === 11) >
              r.pairs.findLastIndex(([c]) => c === 50);
          const x = norm(
              useDirection
                ? v(r, 11)
                : point(basisOcs, [Math.cos(angle), Math.sin(angle), 0]),
            ),
            z = norm(normal),
            y = norm(cross(z, x));
          const basis = mul(parent, [
            x[0],
            y[0],
            z[0],
            origin[0],
            x[1],
            y[1],
            z[1],
            origin[1],
            x[2],
            y[2],
            z[2],
            origin[2],
          ]);
          output.push({
            ...r,
            pairs: r.pairs.filter(
              ([c]) => ![10, 20, 30, 11, 21, 31, 50].includes(c),
            ),
            projectedMatrix: affine(basis, 0),
          });
          continue;
        }
        const planar = [
            "CIRCLE",
            "ARC",
            "LWPOLYLINE",
            "HATCH",
            "SOLID",
            "TRACE",
            "TEXT",
            "ATTRIB",
            "ATTDEF",
            "POLYLINE",
          ].includes(r.type),
          z = get(r, r.type === "LWPOLYLINE" ? 38 : 30);
        if (r.type === "POLYLINE") {
          output.push({ ...r, projectedMatrix: affine(ocs, z) });
          while (list[i + 1]?.type === "VERTEX")
            output.push({ ...list[++i], projectedMatrix: [1, 0, 0, 1, 0, 0] });
          if (list[i + 1]?.type === "SEQEND") output.push(list[++i]);
          continue;
        }
        output.push({
          ...r,
          projectedMatrix: affine(planar ? ocs : parent, z),
        });
      } catch (error) {
        if ((error as Error).message === "limit") throw error;
        omitted.push({ type: r.type, reason: "unsupported" });
        if (r.type === "POLYLINE")
          while (["VERTEX", "SEQEND"].includes(list[i + 1]?.type)) i++;
      }
    }
  };
  walk(records, identity, []);
  if (output.length > 4000) throw new Error("limit");
  return { records: output, omitted };
}
