import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createTLStore, defaultShapeUtils, getIndices, PageRecordType } from '@tldraw/tldraw';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { pdfOperatorsToVectors } from '../../src/lib/components/canvas/cad-pdf';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { prepareVectorImport, VECTOR_DEFAULT_PAINT, type VectorDocument } from '../../src/lib/components/canvas/cad-vector';
import { fixture } from '../helpers/cad-editor';

function persistImport(document: VectorDocument) {
  const f = fixture();
  const plan = prepareVectorImport(f.editor, DEFAULT_CAD_SETTINGS, document, 100, { x: 10, y: 20 }, 'Imported artwork');
  assert.equal(applyCadPlan(f.editor, plan), true);
  const shapeUtils = [...defaultShapeUtils, CadBezierShapeUtil];
  const store = createTLStore({ shapeUtils });
  const shape = store.schema.types.shape.create({ ...f.only(), index: getIndices(1)[0] });
  assert.ok(shape.typeName === 'shape');
  store.put([
    PageRecordType.create({ id: PageRecordType.createId('one'), name: 'Imported artwork', index: getIndices(1)[0] }),
    shape,
  ]);
  const restored = createTLStore({ shapeUtils });
  restored.loadStoreSnapshot(JSON.parse(JSON.stringify(store.getStoreSnapshot('document'))));
  assert.deepEqual(restored.get(shape.id), shape);
  return shape;
}

function pdfOutline() {
  return pdfOperatorsToVectors(
    { fnArray: [1, 3], argsArray: [[[2], [20, 20, 40, 30]], []] },
    { constructPath: 1, rectangle: 2, stroke: 3 },
    { width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] },
  );
}

describe('imported Bézier metadata persistence', () => {
  it('stores and restores a real PDF outline without absent gradient values crashing validation', () => {
    const document = pdfOutline();
    assert.equal(document.paths.length, 1);
    assert.equal(document.paths[0].paint.stroke, '#000000');
    const shape = persistImport(document);
    const paint = shape.meta.omsVectorPaint as Record<string, unknown>;
    assert.equal(shape.type, 'cad-bezier');
    assert.equal(paint.stroke, '#000000');
    assert.equal(paint.fill, 'none');
    assert.equal(Object.hasOwn(paint, 'gradient'), false);
  });

  it('preserves gradients while removing absent nested optional metadata', () => {
    const document = pdfOutline();
    document.paths[0].paint = {
      ...VECTOR_DEFAULT_PAINT,
      fill: '#123456',
      gradient: {
        type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [40, 0], r0: 0, r1: 0,
        stops: [{ offset: 0, color: '#123456' }, { offset: 1, color: '#FFFFFF' }], bounds: undefined,
      },
      raster: undefined,
    };
    const shape = persistImport(document);
    const paint = shape.meta.omsVectorPaint as Record<string, unknown>;
    const gradient = paint.gradient as Record<string, unknown>;
    assert.equal(gradient.type, 'linear');
    assert.deepEqual(gradient.stops, [{ offset: 0, color: '#123456' }, { offset: 1, color: '#FFFFFF' }]);
    assert.equal(Object.hasOwn(gradient, 'bounds'), false);
    assert.equal(Object.hasOwn(paint, 'raster'), false);
    assert.equal(Object.hasOwn(document.paths[0].paint.gradient!, 'bounds'), true);
  });
});
