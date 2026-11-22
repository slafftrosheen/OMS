import { splitCubic } from './cad-curves';
import type { CadPoint } from './cad-settings';

const distance = (a: CadPoint, b: CadPoint) => Math.hypot(b.x - a.x, b.y - a.y);
export interface CurveLengthBudget { remaining: number }
function spend(budget: CurveLengthBudget) { if (--budget.remaining < 0) throw new Error('measurement-limit'); }

/** Chord and control-polygon lengths bound a Bézier's true length. */
export function cubicLength(points: CadPoint[], tolerance: number, budget: CurveLengthBudget = { remaining: 100000 }, depth = 0): number {
  spend(budget);
  const lower = distance(points[0], points[3]);
  const upper = distance(points[0], points[1]) + distance(points[1], points[2]) + distance(points[2], points[3]);
  if (!Number.isFinite(upper) || !Number.isFinite(tolerance) || tolerance <= 0) throw new Error('measurement-invalid');
  if (upper - lower <= tolerance * 2) return (upper + lower) / 2;
  if (depth >= 24) throw new Error('measurement-limit');
  const [a, b] = splitCubic(points);
  return cubicLength(a, tolerance / 2, budget, depth + 1) + cubicLength(b, tolerance / 2, budget, depth + 1);
}

/** Adaptive integration of the analytic ellipse, without converting it to curves. */
export function ellipseLength(rx: number, ry: number, tolerance: number, budget: CurveLengthBudget) {
  const speed = (t: number) => Math.hypot(rx * Math.sin(t), ry * Math.cos(t));
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => (b - a) / 6 * (fa + 4 * fm + fb);
  const visit = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tolerance: number, depth: number): number => {
    spend(budget);
    const m = (a + b) / 2, fl = speed((a + m) / 2), fr = speed((m + b) / 2);
    const left = simpson(a, m, fa, fl, fm), right = simpson(m, b, fm, fr, fb), error = left + right - whole;
    if (Math.abs(error) <= 15 * tolerance) return left + right + error / 15;
    if (depth >= 24) throw new Error('measurement-limit');
    return visit(a, m, fa, fl, fm, left, tolerance / 2, depth + 1) + visit(m, b, fm, fr, fb, right, tolerance / 2, depth + 1);
  };
  const a = 0, b = Math.PI / 2, fa = speed(a), fm = speed((a + b) / 2), fb = speed(b);
  return 4 * visit(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), tolerance / 4, 0);
}
