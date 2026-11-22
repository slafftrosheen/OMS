import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { buildDxfCommonLines } from '../../src/lib/components/canvas/cad-dxf-common-lines';
import { serializeCadDxf, type DxfEntity } from '../../src/lib/components/canvas/cad-dxf';

function box(x: number, y: number, w: number, h: number, rgb = '#112233'): DxfEntity {
  return { type: 'polyline', closed: true, rgb,
    points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

describe('DXF cut preview', () => {
  it('uses the emitted layers and lengths for a partially shared section without changing DXF bytes', () => {
    const parts = [box(0, 0, 30, 40), box(30, 4, 20, 10)];
    const output = buildDxfCommonLines(parts);
    const normal = serializeCadDxf(output.entities, { colorLayers: true });
    const reviewed = serializeCadDxf(output.entities, { colorLayers: true, includePreview: true });
    assert.equal(reviewed.text, normal.text);
    assert.equal(normal.preview, undefined);
    assert.equal(normal.cutLengths, undefined);
    assert.deepEqual(reviewed.layers, normal.layers);
    assert.deepEqual(reviewed.cutLengths, { totalMm: 190, byLayer: { OMS_OPEN_112233: 180, OMS_SHARED_112233: 10 } });
    const preview = reviewed.preview!;
    assert.deepEqual(preview.layers.map(layer => layer.name), reviewed.layers.map(layer => layer.name));
    assert.deepEqual(preview.layers.find(layer => layer.name === 'OMS_SHARED_112233'),
      { name: 'OMS_SHARED_112233', rgb: '#112233', path: 'M30,36 L30,26' });
    assert.ok(preview.layers.find(layer => layer.name === 'OMS_OPEN_112233')?.path.includes('M30,26'));
  });

  it('preserves recorded cubic controls in the preview without flattening the spline', () => {
    const nodes = [nodeAt({ x: 10, y: 20 }), nodeAt({ x: 30, y: 20 })];
    nodes[0].outX = 5; nodes[0].outY = 20;
    nodes[1].inX = -5; nodes[1].inY = 20;
    const { preview, widthMm, heightMm } = serializeCadDxf([
      { type: 'spline', contour: { nodes, closed: false } },
    ], { includePreview: true });
    assert.deepEqual([widthMm, heightMm], [20, 15]);
    assert.equal(preview?.layers[0].path, 'M0,15 C5,-5 15,-5 20,15');
  });

  it('previews circles and rotated ellipses analytically and uses the arc sweep written to DXF', () => {
    const shapes: DxfEntity[] = [
      { type: 'circle', center: { x: 0, y: 0 }, radius: 5, rgb: '#010101' },
      { type: 'ellipse', center: { x: 20, y: 0 }, major: { x: 6, y: 8 }, ratio: 0.5, rgb: '#020202' },
      { type: 'arc', center: { x: 50, y: 0 }, radius: 10, start: 360, end: -90, rgb: '#030303' },
    ];
    const result = serializeCadDxf(shapes, { colorLayers: true, includePreview: true });
    const paths = result.preview!.layers.map(layer => layer.path);
    assert.equal((paths[0].match(/A5,5 /g) ?? []).length, 2);
    assert.match(paths[1], /A10,5 -53\.13/);
    assert.match(paths[2], / A10,10 0 1 0 /);
    assert.doesNotMatch(paths[2], /Z/);
    assert.match(result.text, /\r\n50\r\n0\r\n51\r\n270\r\n/);
    const lengths = result.cutLengths!;
    assert.equal(lengths.byLayer.OMS_CLOSED_010101, 10 * Math.PI);
    assert.ok(Math.abs(lengths.byLayer.OMS_CLOSED_020202! - 48.4422411027) < 0.001);
    assert.ok(Math.abs(lengths.byLayer.OMS_OPEN_030303! - 15 * Math.PI) < 1e-9);
  });

  it('includes the closing segments of splines and polylines exactly once', () => {
    const nodes = [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 10, y: 0 })];
    nodes[0].outY = 10;
    nodes[1].inY = 10;
    nodes.push(nodeAt({ x: 10, y: -4 }), nodeAt({ x: 0, y: -4 }));
    const rectangle = box(0, 0, 3, 4);
    if (rectangle.type !== 'polyline') throw new Error('Expected polyline');
    rectangle.points.push(rectangle.points[0]);
    const { cutLengths } = serializeCadDxf([
      { type: 'spline', contour: { nodes, closed: true } }, rectangle,
    ], { includePreview: true });
    // The cubic is 20 mm, its three straight sides total 18 mm, and the rectangle is 14 mm.
    assert.ok(Math.abs(cutLengths!.totalMm! - 52) < 0.001);
    assert.equal(cutLengths!.byLayer.OMS_CLOSED, cutLengths!.totalMm);
  });

  it('retains the DXF and measurable layers if the curve calculation budget is exhausted', () => {
    const nodes = [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 1_000_000, y: 0 })];
    nodes[0].outY = 1_000_000;
    nodes[1].inY = 1_000_000;
    const curve: DxfEntity = { type: 'spline', contour: { nodes, closed: false } };
    const result = serializeCadDxf([...Array<DxfEntity>(400).fill(curve), box(0, 0, 3, 4)], { includePreview: true });
    assert.deepEqual(result.cutLengths, { totalMm: null, byLayer: { OMS_OPEN: null, OMS_CLOSED: 14 } });
    assert.equal(result.preview?.layers.length, 2);
    assert.match(result.text, /\r\nEOF\r\n$/);
  });

  it('keeps an open single-axis drawing visible and translates distant coordinates to the local preview origin', () => {
    const { preview, widthMm, heightMm } = serializeCadDxf([
      { type: 'polyline', closed: false, points: [{ x: 80_000_000, y: 70_000_000 }, { x: 80_000_000, y: 70_000_001 }] },
    ], { includePreview: true });
    assert.equal(widthMm, 0);
    assert.equal(heightMm, 1);
    assert.equal(preview?.layers[0].path, 'M0,1 L0,0');
    assert.ok(Number(preview?.viewBox.split(' ')[2]) > 0);
  });
});
