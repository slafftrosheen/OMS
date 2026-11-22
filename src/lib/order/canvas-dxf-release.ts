export interface CanvasDxfRelease {
  reviewId: string;
  revision: string;
  pageId: string;
  pageName: string;
  scope: 'selected' | 'all' | 'preflight';
  curves: 'spline' | 'polyline';
  toleranceMm: number | null;
  colorLayers: boolean;
  commonLines: boolean;
  omitted: number;
}

export function readCanvasDxfRelease(value: unknown): CanvasDxfRelease | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { reviewId, revision, pageId, pageName, scope, curves, toleranceMm, colorLayers, commonLines, omitted } =
    value as Partial<CanvasDxfRelease>;
  if (typeof reviewId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reviewId) ||
      typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision) ||
      typeof pageId !== 'string' || !/^page:[A-Za-z0-9_:.-]{1,120}$/.test(pageId) ||
      typeof pageName !== 'string' || !pageName.trim() || pageName.length > 80 ||
      (scope !== 'selected' && scope !== 'all' && scope !== 'preflight') ||
      (curves !== 'spline' && curves !== 'polyline') ||
      (curves === 'spline' ? toleranceMm !== null : typeof toleranceMm !== 'number' || !Number.isFinite(toleranceMm) || toleranceMm < 0.001 || toleranceMm > 1) ||
      typeof colorLayers !== 'boolean' || typeof commonLines !== 'boolean' ||
      typeof omitted !== 'number' || !Number.isSafeInteger(omitted) || omitted < 0 || omitted > 8000) return null;
  return { reviewId, revision, pageId, pageName, scope, curves, toleranceMm: toleranceMm ?? null, colorLayers, commonLines, omitted };
}
