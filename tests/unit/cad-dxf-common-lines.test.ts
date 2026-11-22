import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { contourSegments, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { buildDxfCommonLines } from '../../src/lib/components/canvas/cad-dxf-common-lines';
import { serializeCadDxf, type DxfEntity } from '../../src/lib/components/canvas/cad-dxf';

type Polyline = Extract<DxfEntity, { type: 'polyline' }>;
const box = (x: number, y: number, w: number, h: number, rgb?: string): Polyline => ({
  type: 'polyline', closed: true, rgb,
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});

describe('DXF common-line export', () => {
  it('writes the shared edge once and keeps both exterior runs at their original size', () => {
    const left = box(0, 0, 50, 30), right = box(50, 0, 40, 30);
    const output = buildDxfCommonLines([left, right]);
    assert.deepEqual([output.sharedEdges, output.passesRemoved], [1, 1]);
    assert.equal(output.entities.length, 3);
    assert.deepEqual(output.entities[0], {
      type: 'polyline', closed: false, commonLine: true, rgb: undefined,
      points: [{ x: 50, y: 0 }, { x: 50, y: 30 }],
    });
    assert.ok(output.entities.slice(1).every(e => e.type === 'polyline' && !e.closed && e.points.length === 4));
    const base = serializeCadDxf([left, right]), cutting = serializeCadDxf(output.entities);
    assert.deepEqual([cutting.widthMm, cutting.heightMm], [base.widthMm, base.heightMm]);
    assert.deepEqual(cutting.layers.map(layer => [layer.name, layer.entities]), [['OMS_OPEN', 2], ['OMS_SHARED', 1]]);
    assert.match(cutting.text, /\r\nLINE\r\n[\s\S]*?\r\n8\r\nOMS_SHARED\r\n100\r\nAcDbLine\r\n/);
    assert.doesNotMatch(base.text, /OMS_SHARED/);
    assert.ok(left.closed && right.closed);
  });

  it('uses same-color lines in colored export and keeps DXF layer handles unique', () => {
    const first = box(0, 0, 20, 20, '#102030'), second = box(20, 0, 20, 20, '#102030');
    const different = box(40, 0, 20, 20, '#405060');
    const output = buildDxfCommonLines([first, second, different]);
    assert.equal(output.sharedEdges, 1);
    assert.equal(output.entities.at(-1), different);
    const dxf = serializeCadDxf(output.entities, { colorLayers: true });
    assert.deepEqual(dxf.layers.map(layer => layer.name), ['OMS_SHARED_102030', 'OMS_OPEN_102030', 'OMS_CLOSED_405060']);
    assert.equal(dxf.layers[0].rgb, '#102030');
    const tags = dxf.text.split('\r\n');
    const handles = tags.flatMap((tag, i) => i % 2 === 0 && tag === '5' ? [tags[i + 1]] : []);
    assert.equal(new Set(handles).size, handles.length);
  });

  it('preserves spline controls on perimeter runs and supports roundoff across buckets', () => {
    const nodes = box(0, 0, 30, 20).points.map(nodeAt);
    nodes[0].outY = -12;
    nodes[1].inY = -12;
    const contour = { nodes, closed: true };
    const right = box(30 + 0.0000003, 0, 20, 20);
    const output = buildDxfCommonLines([{ type: 'spline', contour }, right]);
    assert.equal(output.sharedEdges, 1);
    const spline = output.entities.find(e => e.type === 'spline');
    assert.ok(spline && !spline.contour.closed);
    const segment = (points: { x: number; y: number }[]) => points.map(({ x, y }) => [x, y]);
    assert.deepEqual(segment([...contourSegments(spline.contour)].at(-1)!), segment([...contourSegments(contour)][0]));
    assert.match(serializeCadDxf(output.entities).text, /\r\nSPLINE\r\n/);
  });

  it('leaves open, partial, differently segmented, curved and nearby geometry intact', () => {
    const original = box(0, 0, 30, 20), partial = box(30, 5, 20, 10), nearby = box(30.0001, 0, 20, 20);
    const open: Polyline = { type: 'polyline', closed: false, points: [{ x: 30, y: 0 }, { x: 30, y: 20 }] };
    const split = box(30, 0, 20, 20);
    split.points.push({ x: 30, y: 10 });
    const curvedNodes = box(30, 0, 20, 20).points.map(nodeAt);
    curvedNodes[3].outX = curvedNodes[0].inX = 4;
    const curved: DxfEntity = { type: 'spline', contour: { nodes: curvedNodes, closed: true } };
    for (const unrelated of [partial, nearby, open, split, curved]) {
      const input = [original, unrelated];
      const output = buildDxfCommonLines(input);
      assert.equal(output.entities, input);
      assert.equal(output.passesRemoved, 0);
    }
  });

  it('uses one line per coincident edge even when no perimeter run remains', () => {
    const panel = box(0, 0, 30, 20), reversed = { ...panel, points: panel.points.slice().reverse() };
    const output = buildDxfCommonLines([panel, reversed, panel]);
    assert.deepEqual([output.sharedEdges, output.passesRemoved, output.entities.length], [4, 8, 4]);
    assert.ok(output.entities.every(e => e.commonLine));
    assert.deepEqual(serializeCadDxf(output.entities).layers.map(layer => [layer.name, layer.entities]), [['OMS_SHARED', 4]]);
  });

  it('assigns every interior edge of a nested grid to one pass', () => {
    const columns = 40, rows = 20;
    const input = Array.from({ length: columns * rows }, (_, i) => box((i % columns) * 6, Math.floor(i / columns) * 3, 6, 3));
    const output = buildDxfCommonLines(input);
    const interiorEdges = (columns - 1) * rows + (rows - 1) * columns;
    assert.deepEqual([output.sharedEdges, output.passesRemoved], [interiorEdges, interiorEdges]);
    const exportFile = serializeCadDxf(output.entities);
    assert.deepEqual([exportFile.widthMm, exportFile.heightMm], [columns * 6, rows * 3]);
    assert.equal(exportFile.layers.find(layer => layer.name === 'OMS_SHARED')?.entities, interiorEdges);
  });
});
