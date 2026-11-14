const ROUNDING = 64 * Number.EPSILON;

function at(coefficients: number[], t: number): number {
  const values = [...coefficients];
  for (let n = values.length - 1; n > 0; n--)
    for (let i = 0; i < n; i++) values[i] += (values[i + 1] - values[i]) * t;
  return values[0];
}

/** Isolated real roots of a Bernstein polynomial on [0,1], degree at most 6.
 * Derivative roots partition monotone spans; explicit critical-point checks
 * retain even-multiplicity contacts. Constant/zero polynomials have no isolated
 * roots. Each span uses at most 64 bisections; recursion strictly reduces degree.
 * Tolerance is an absolute coefficient error bound, not the pointer snap radius. */
export function bernsteinRoots(coefficients: number[], tolerance = 0): number[] {
  if (coefficients.length < 2 || coefficients.length > 7 || !coefficients.every(Number.isFinite)
    || !Number.isFinite(tolerance) || tolerance < 0) return [];
  const scale = Math.max(...coefficients.map(Math.abs));
  if (scale <= tolerance) return [];
  const d = coefficients.map(value => value / scale), zero = Math.max(ROUNDING, tolerance / scale);
  const degree = d.length - 1;
  const derivative = d.slice(1).map((value, i) => degree * (value - d[i]));
  const cuts = [0, ...bernsteinRoots(derivative).filter(t => t > 0 && t < 1), 1];
  const roots: number[] = [];
  const add = (t: number) => { if (!roots.some(root => Math.abs(root - t) <= ROUNDING)) roots.push(t); };
  for (const t of cuts) if (Math.abs(at(d, t)) <= zero) add(t);
  for (let i = 1; i < cuts.length; i++) {
    let lo = cuts[i - 1], hi = cuts[i], left = at(d, lo);
    const right = at(d, hi);
    if (Math.abs(left) <= zero || Math.abs(right) <= zero || (left < 0) === (right < 0)) continue;
    for (let step = 0; step < 64; step++) {
      const mid = (lo + hi) / 2, value = at(d, mid);
      if (value === 0 || mid === lo || mid === hi) { lo = hi = mid; break; }
      if ((value < 0) === (left < 0)) { lo = mid; left = value; } else hi = mid;
    }
    add((lo + hi) / 2);
  }
  return roots.sort((a, b) => a - b);
}
