export interface CanvasDxfRelease {
  reviewId: string;
  revision: string;
  pageId: string;
  pageName: string;
  scope: 'selected' | 'all' | 'preflight';
  curves: 'spline' | 'polyline';
  toleranceMm: number | null;
  colorLayers: boolean;
  productionLayers?: { layerName: string | null; filtered: number; preserveColors?: boolean };
  commonLines: boolean;
  omitted: number;
}

export function readCanvasDxfRelease(value: unknown): CanvasDxfRelease | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { reviewId, revision, pageId, pageName, scope, curves, toleranceMm, colorLayers, commonLines, omitted, productionLayers } =
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
  if (productionLayers !== undefined && (!productionLayers || typeof productionLayers !== 'object' || Array.isArray(productionLayers) ||
      (productionLayers.layerName !== null && (typeof productionLayers.layerName !== 'string' ||
        !productionLayers.layerName.trim() || productionLayers.layerName.length > 40)) ||
      !Number.isSafeInteger(productionLayers.filtered) || productionLayers.filtered < 0 || productionLayers.filtered > 8000 ||
      (productionLayers.preserveColors !== undefined && typeof productionLayers.preserveColors !== 'boolean') || colorLayers)) return null;
  return { reviewId, revision, pageId, pageName, scope, curves, toleranceMm: toleranceMm ?? null, colorLayers, commonLines, omitted,
    ...(productionLayers ? { productionLayers: {
      layerName: productionLayers.layerName, filtered: productionLayers.filtered,
      ...(productionLayers.preserveColors === true ? { preserveColors: true } : {}),
    } } : {}) };
}
