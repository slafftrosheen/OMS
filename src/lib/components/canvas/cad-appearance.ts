import { mapContours, validContours, type CadContour } from "./cad-curves";
export type VectorMatrix = [number, number, number, number, number, number];
export type VectorClip = {
  contours: CadContour[];
  fillRule: "evenodd" | "nonzero";
};
export type VectorGradient = {
  type: "linear" | "radial";
  matrix: VectorMatrix;
  start: [number, number];
  end: [number, number];
  r0: number;
  r1: number;
  stops: Array<{ offset: number; color: string }>;
  bounds?: [number, number, number, number];
};
export type VectorRaster = {
  /** Material fills decorate real curves; PDF page bitmaps remain non-cutting. */
  usage?: "material";
  width: number;
  height: number;
  png: string;
  rgb?: string;
  external?: boolean;
  fileId?: string;
  hasAlpha?: boolean;
  alpha?: string;
  matrix: VectorMatrix;
};
export type VectorAppearance = {
  clips?: VectorClip[];
  gradient?: VectorGradient;
  raster?: VectorRaster;
};
export const multiplyMatrix = (a: number[], b: number[]): VectorMatrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const finite = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e6;
const matrix = (m: unknown) =>
  Array.isArray(m) &&
  m.length === 6 &&
  m.every(finite) &&
  Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-15;
const pair = (p: unknown) =>
  Array.isArray(p) && p.length === 2 && p.every(finite);
const base64 = (s: unknown) =>
  typeof s === "string" &&
  s.length > 0 &&
  s.length <= 48 * 1024 * 1024 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(s);
export function validRasterReference(url: unknown, id: unknown): boolean {
  if (
    typeof url !== "string" ||
    typeof id !== "string" ||
    !id.length ||
    id.length > 100
  )
    return false;
  if (/^blob:https?:\/\/[a-z0-9:._/-]+$/i.test(url)) return true;
  const match =
    /^(?:\/[a-z0-9_-]+)*\/api\/(?:files\/([0-9a-f-]{36})\/download|toolkit\/assets\/[0-9a-f-]{36}\/([0-9a-f-]{36}))$/i.exec(
      url,
    );
  return !!match && (match[1] ?? match[2]) === id;
}
export function validAppearance(p: VectorAppearance) {
  if (
    p.clips !== undefined &&
    (!Array.isArray(p.clips) ||
      p.clips.length > 32 ||
      p.clips.some(
        (c) =>
          !c ||
          !["evenodd", "nonzero"].includes(c.fillRule) ||
          !validContours(c.contours),
      ) ||
      p.clips
        .flatMap((c) => c.contours)
        .reduce((n, c) => n + c.nodes.length, 0) > 4096)
  )
    return false;
  const g = p.gradient;
  if (
    g?.bounds &&
    (!Array.isArray(g.bounds) ||
      g.bounds.length !== 4 ||
      !g.bounds.every(finite) ||
      g.bounds[0] >= g.bounds[2] ||
      g.bounds[1] >= g.bounds[3])
  )
    return false;
  if (
    g &&
    (!["linear", "radial"].includes(g.type) ||
      !matrix(g.matrix) ||
      !pair(g.start) ||
      !pair(g.end) ||
      ![g.r0, g.r1].every((n) => finite(n) && n >= 0) ||
      (g.type === "radial" && !(g.r1 > g.r0)) ||
      !Array.isArray(g.stops) ||
      g.stops.length < 2 ||
      g.stops.length > 256 ||
      g.stops.some(
        (s, i) =>
          !finite(s.offset) ||
          s.offset < 0 ||
          s.offset > 1 ||
          (i > 0 && s.offset <= g.stops[i - 1].offset) ||
          !/^#[0-9a-f]{6}$/i.test(s.color),
      ) ||
      g.stops[0].offset !== 0 ||
      g.stops.at(-1)!.offset !== 1)
  )
    return false;
  const r = p.raster;
  if (
    r &&
    (r.usage !== undefined && r.usage !== "material" || ![r.width, r.height].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 16384,
    ) ||
      r.width * r.height > 32 * 1024 * 1024 ||
      !matrix(r.matrix) ||
      (r.external
        ? !validRasterReference(r.png, r.fileId) ||
          r.rgb !== undefined ||
          r.alpha !== undefined ||
          typeof r.hasAlpha !== "boolean"
        : typeof r.png !== "string" ||
          !r.png.startsWith("data:image/png;base64,iVBORw0KGgo") ||
          !base64(r.png.slice(22)) ||
          !base64(r.rgb) ||
          (r.alpha !== undefined && !base64(r.alpha))))
  )
    return false;
  return !(g && r);
}
/** Appearance coordinates live in the same local space as the editable nodes. */
export function transformAppearance<T extends VectorAppearance>(
  p: T,
  m: VectorMatrix,
): T {
  return {
    ...p,
    ...(p.clips
      ? {
          clips: p.clips.map((c) => ({
            ...c,
            contours: mapContours(c.contours, (q) => ({
              x: m[0] * q.x + m[2] * q.y + m[4],
              y: m[1] * q.x + m[3] * q.y + m[5],
            })),
          })),
        }
      : {}),
    ...(p.gradient
      ? {
          gradient: {
            ...p.gradient,
            matrix: multiplyMatrix(m, p.gradient.matrix),
          },
        }
      : {}),
    ...(p.raster
      ? { raster: { ...p.raster, matrix: multiplyMatrix(m, p.raster.matrix) } }
      : {}),
  };
}
