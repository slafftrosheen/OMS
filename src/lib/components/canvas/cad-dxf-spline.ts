import type { DxfPair } from "./cad-dxf-decode";
import type { CadPoint } from "./cad-settings";
import { CadOperationError } from "./cad-plans";
import { splineContours } from "./cad-nurbs";

/**
 * SPLINE group schema: Autodesk DXF reference, AcDbSpline.
 * https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm
 * Control points (10/20) and fit points (11/21) are separate representations.
 * Fit points alone do not encode the original knot parameterization.
 */
export function readDxfSpline(pairs: DxfPair[]) {
  const values = (code: number, reason: string): number[] =>
    pairs.filter(([key]) => key === code).map(([, value]) => {
      const number = Number(value);
      if (!value.trim() || !Number.isFinite(number))
        throw new CadOperationError(reason);
      return number;
    });
  const scalar = (code: number, fallback: number, reason: string) => {
    const found = values(code, reason);
    if (found.length > 1) throw new CadOperationError(reason);
    return found[0] ?? fallback;
  };
  const points = (code: number, reason: string): CadPoint[] => {
    const xs = values(code, reason), ys = values(code + 10, reason);
    if (xs.length !== ys.length) throw new CadOperationError(reason);
    return xs.map((x, i) => ({ x, y: ys[i] }));
  };
  const controls = points(10, "spline-control-points");
  const fitPoints = points(11, "spline-fit-points");
  const knots = values(40, "spline-knots");
  const weights = values(41, "spline-weights");
  for (const [code, count] of [[72, knots.length], [73, controls.length], [74, fitPoints.length]]) {
    const declared = scalar(code, count, "spline-count");
    if (!Number.isSafeInteger(declared) || declared < 0 || declared !== count)
      throw new CadOperationError("spline-count");
  }
  if (controls.length > 4096 || fitPoints.length > 4096 || knots.length > 8192)
    throw new CadOperationError("spline-limit");
  if (!controls.length && fitPoints.length >= 2)
    throw new CadOperationError("spline-fit-only");
  if (!controls.length) throw new CadOperationError("spline-control-points");
  if (weights.length && weights.length !== controls.length)
    throw new CadOperationError("spline-weights");
  const degree = scalar(71, NaN, "spline-degree");
  if (!Number.isSafeInteger(degree) || degree < 1)
    throw new CadOperationError("spline-degree");
  // Known lower bits determine geometry; exporters also use additional metadata bits.
  const flags = scalar(70, 0, "geometry");
  if (!Number.isSafeInteger(flags) || flags < 0) throw new CadOperationError("geometry");
  return { controls, knots, weights: weights.length ? weights : undefined, degree, closed: !!(flags & 3) };
}

export function dxfSplineContours(pairs: DxfPair[], tolerance: number) {
  const data = readDxfSpline(pairs);
  try {
    return splineContours(data.controls, data.weights, data.knots, data.degree, data.closed, tolerance, {
      joinCoincidentClosedSpans: true,
    });
  } catch (error) {
    // Per-entity complexity is reviewable; the document-wide budget remains fatal.
    if ((error as CadOperationError).code === "limit")
      throw new CadOperationError("spline-limit");
    throw error;
  }
}
