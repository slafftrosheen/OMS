import assert from 'node:assert/strict';
import { it } from 'vitest';
import { readCanvasDxfRelease } from '../../src/lib/order/canvas-dxf-release';

it('round-trips the production RGB export option and accepts older review metadata', () => {
  const base = {
    reviewId: '12345678-1234-4abc-8def-1234567890ab', revision: 'a'.repeat(64),
    pageId: 'page:sheet', pageName: 'Sheet', scope: 'all', curves: 'spline', toleranceMm: null,
    colorLayers: false, commonLines: false, omitted: 0,
  };
  const standard = { ...base, productionLayers: { layerName: 'Cut', filtered: 2 } };
  const exact = { ...base, productionLayers: { ...standard.productionLayers, preserveColors: true } };
  assert.deepEqual(readCanvasDxfRelease(standard), standard);
  assert.deepEqual(readCanvasDxfRelease(exact), exact);
  assert.equal(readCanvasDxfRelease({ ...exact, colorLayers: true }), null);
  assert.equal(readCanvasDxfRelease({ ...exact, productionLayers: { ...exact.productionLayers, preserveColors: 'yes' } }), null);
});
