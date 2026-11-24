import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { productionPresets, productionPresetGeometry } from '../../src/lib/components/canvas/cad-production-geometry';
import { curveBounds, validContours, arcContour, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { readCadDxf } from '../../src/lib/components/canvas/cad-import';
import { serializeCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';

const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} != ${b}`);

describe('Production clipart geometry', () => {
  it('keeps every template inside its requested envelope with real exportable contours', () => {
    for (const preset of productionPresets) {
      const width = preset.width * 1.7, height = 'square' in preset ? width : preset.height * 1.3;
      const entities = productionPresetGeometry(preset.id, { width, height });
      assert.ok(entities.length, preset.id);
      const contours = entities.map(entity => entity.type === 'circle'
        ? arcContour(entity.center.x, entity.center.y, entity.radius, entity.radius, 0, Math.PI * 2)
        : entity.type === 'spline' ? entity.contour : { closed: entity.closed, nodes: entity.points.map(nodeAt) });
      assert.ok(validContours(contours), preset.id);
      const bounds = curveBounds(contours);
      near(bounds.w, width, `${preset.id} width`);
      near(bounds.h, height, `${preset.id} height`);
      near(bounds.x, -width / 2, `${preset.id} x`);
      near(bounds.y, -height / 2, `${preset.id} y`);
      const exported = serializeCadDxf(entities);
      for (const unit of ['mm', 'in'] as const) {
        const imported = readCadDxf({ ...DEFAULT_CAD_SETTINGS, unit, scale: 10 }, exported.text, { keepCoordinates: true });
        assert.deepEqual(imported.omitted, [], `${preset.id} ${unit}`);
        near(imported.widthMm, width, `${preset.id} round-trip width ${unit}`);
        near(imported.heightMm, height, `${preset.id} round-trip height ${unit}`);
        assert.equal(imported.contours.length, contours.length, preset.id);
        assert.equal(imported.contours.filter(c => c.closed).length, contours.filter(c => c.closed).length, preset.id);
      }
    }
  });

  it('retains editable curves and separate closed cutouts without flattened preview geometry', () => {
    for (const id of ['heart', 'leaf', 'shieldSign', 'ovalSign', 'archSign', 'locationPin'] as const) {
      const entities = productionPresetGeometry(id);
      assert.ok(entities.some(entity => entity.type === 'spline' && entity.contour.nodes.some(node => node.inX || node.inY || node.outX || node.outY)), id);
      const imported = readCadDxf(DEFAULT_CAD_SETTINGS, serializeCadDxf(entities).text, { keepCoordinates: true });
      assert.ok(imported.contours.some(contour => contour.nodes.some(node => node.inX || node.inY || node.outX || node.outY)), id);
      assert.ok(imported.contours.every(contour => contour.closed), id);
    }
    const washer = productionPresetGeometry('washer', { width: 50, height: 50 });
    assert.deepEqual(washer.map(entity => entity.type === 'circle' ? entity.radius : NaN), [25, 10]);
    assert.equal(productionPresetGeometry('locationPin').length, 2);
    assert.equal(productionPresetGeometry('cornerBracket').length, 3);
    assert.deepEqual(productionPresetGeometry('capsuleSign', { width: 30, height: 60 }), []);
    assert.deepEqual(productionPresetGeometry('roundSign', { width: 30, height: 60 }), []);
    for (const width of [0, -1, NaN, Infinity]) assert.deepEqual(productionPresetGeometry('heart', { width, height: 100 }), []);
  });
});
