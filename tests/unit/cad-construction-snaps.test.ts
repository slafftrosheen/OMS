import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { ellipseTangentPoints, perpendicularSegmentPoint } from '../../src/lib/components/canvas/cad-construction-snaps';
import { findCadSnap, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { DEFAULT_CAD_SNAP_SETTINGS, readCadSnapSettings, writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadCircleTool, CadDimensionTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { polylineSession } from '../../src/lib/components/canvas/cad-polyline-draft';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

const close = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function pointClose(a: CadPoint | null | undefined, b: CadPoint) { assert.ok(a); close(a.x, b.x); close(a.y, b.y); }
function setup() {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { omsCadSnap: { ...DEFAULT_CAD_SNAP_SETTINGS, endpoints: false, centers: false, quadrants: false, perpendicular: true, tangent: true } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (next: any[]) => indicators = next, clearIndicators: () => indicators = [] };
  return f;
}
function line(f: ReturnType<typeof setup>) { f.editor.createShape({ id: 'shape:reference', type: 'cad-path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false } }); }
function circle(f: ReturnType<typeof setup>) { f.editor.createShape({ id: 'shape:reference', type: 'cad-ellipse', x: -100, y: -100, props: { w: 200, h: 200 } }); }
function click(tool: CadPolylineTool | CadDimensionTool | CadCircleTool, f: ReturnType<typeof setup>, p: CadPoint) {
  f.editor.inputs.currentPagePoint = p; tool.onPointerDown({ button: 0 } as any);
}

describe('perpendicular construction', () => {
  it('returns the perpendicular foot, including finite endpoints, without clamping or zero-length connections', () => {
    pointClose(perpendicularSegmentPoint({ x: 40, y: 80 }, { x: 0, y: 0 }, { x: 100, y: 0 }), { x: 40, y: 0 });
    pointClose(perpendicularSegmentPoint({ x: 0, y: 80 }, { x: 0, y: 0 }, { x: 100, y: 0 }), { x: 0, y: 0 });
    assert.equal(perpendicularSegmentPoint({ x: 101, y: 80 }, { x: 0, y: 0 }, { x: 100, y: 0 }), null);
    assert.equal(perpendicularSegmentPoint({ x: 40, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }), null);
    assert.equal(perpendicularSegmentPoint({ x: 40, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 }), null);
  });
  it('preserves the 90-degree constraint under translated and rotated reference groups', () => {
    const f = setup(); line(f);
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 140, y: 210, rotation: 0.41 });
    f.editor.updateShape({ id: 'shape:reference', parentId: 'shape:group' });
    const matrix = f.editor.getShapePageTransform(f.editor.getShape('shape:reference'));
    const anchor = matrix.applyToPoint({ x: 40, y: 60 }), foot = matrix.applyToPoint({ x: 40, y: 0 });
    const result = findCadSnap(f.editor, { x: foot.x + 2, y: foot.y + 1 }, null, anchor);
    assert.equal(result?.kind, 'perpendicular'); pointClose(result?.point, foot);
    const a = matrix.applyToPoint({ x: 0, y: 0 }), b = matrix.applyToPoint({ x: 100, y: 0 });
    close((anchor.x - foot.x) * (b.x - a.x) + (anchor.y - foot.y) * (b.y - a.y), 0);
    assert.equal(findCadSnap(f.editor, foot, null), null);
  });
});

describe('analytic ellipse tangents', () => {
  it('finds both circle tangents and verifies their radius/connection dot products independently', () => {
    const anchor = { x: 200, y: 0 }, points = ellipseTangentPoints(anchor, { x: 0, y: 0 }, 100, 100);
    assert.equal(points.length, 2);
    for (const p of points) { close(p.x, 50); close(Math.abs(p.y), Math.sqrt(7500)); close(p.x * p.x + p.y * p.y, 10000); close(p.x * (anchor.x - p.x) + p.y * (anchor.y - p.y), 0); }
  });
  it('satisfies the ellipse equation and normal constraint for eccentric ellipses at multiple scales and directions', () => {
    for (const scale of [0.001, 1, 100]) for (const ratio of [0.02, 0.5, 1, 15]) for (const angle of [-2.1, -0.5, 0, 1.3]) {
      const rx = 25 * scale, ry = rx * ratio, center = { x: 20, y: -30 };
      const anchor = { x: center.x + 3 * rx * Math.cos(angle), y: center.y + 3 * ry * Math.sin(angle) };
      const points = ellipseTangentPoints(anchor, center, rx, ry); assert.equal(points.length, 2);
      for (const p of points) {
        const nx = (p.x - center.x) / rx, ny = (p.y - center.y) / ry;
        close(nx * nx + ny * ny, 1, 1e-7);
        close(nx * ((anchor.x - p.x) / rx) + ny * ((anchor.y - p.y) / ry), 0, 1e-7);
      }
    }
  });
  it('rejects interior, on-curve, degenerate and nonfinite constructions', () => {
    for (const anchor of [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 100, y: 0 }, { x: Infinity, y: 0 }]) assert.deepEqual(ellipseTangentPoints(anchor, { x: 0, y: 0 }, 100, 50), []);
    for (const radius of [0, -1, NaN, Infinity]) assert.deepEqual(ellipseTangentPoints({ x: 200, y: 0 }, { x: 0, y: 0 }, radius, 50), []);
  });
  it('keeps only visible arc tangencies, including wrapped angles and seam endpoints', () => {
    const anchor = { x: 200, y: 0 }, center = { x: 0, y: 0 };
    const upper = ellipseTangentPoints(anchor, center, 100, 100, 10, 100); assert.equal(upper.length, 1); assert.ok(upper[0].y < 0);
    assert.equal(ellipseTangentPoints(anchor, center, 100, 100, 300, 420).length, 2);
    assert.equal(ellipseTangentPoints(anchor, center, 100, 100, 350, 370).length, 0);
    assert.equal(ellipseTangentPoints(anchor, center, 100, 100, -60, 60).length, 2);
    assert.deepEqual(ellipseTangentPoints(anchor, center, 100, 100, 10, 10), []);
  });
  it('selects the nearby ellipse tangent in world coordinates and respects snap distance, Ctrl and clipping', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:group', type: 'group', x: 220, y: 85, rotation: 0.71 });
    f.editor.createShape({ id: 'shape:reference', type: 'cad-ellipse', parentId: 'shape:group', x: -100, y: -50, props: { w: 200, h: 100 } });
    const shape = f.editor.getShape('shape:reference'), matrix = f.editor.getShapePageTransform(shape);
    const anchor = matrix.applyToPoint({ x: 300, y: 50 });
    const expected = matrix.applyToPoint({ x: 150, y: 50 - Math.sqrt(1875) });
    const query = { x: expected.x + 1, y: expected.y - 1 };
    assert.equal(findCadSnap(f.editor, query, null, anchor)?.kind, 'tangent'); pointClose(findCadSnap(f.editor, query, null, anchor)?.point, expected);
    assert.equal(findCadSnap(f.editor, query, null), null);
    f.state.zoom = 20; assert.equal(findCadSnap(f.editor, query, null, anchor), null); f.state.zoom = 1;
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, query, null, anchor), null); f.editor.inputs.ctrlKey = false;
    f.editor.updateShape({ id: shape.id, mask: [{ x: 0, y: 0 }] }); assert.equal(findCadSnap(f.editor, query, null, anchor), null);
  });
});

describe('construction snaps in CAD tools', () => {
  it('uses the last polyline vertex, clears a backtracked marker, and preserves exact numeric entry', () => {
    const f = setup(); line(f); const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    click(tool, f, { x: 40, y: 60 }); click(tool, f, { x: 42, y: 2 });
    pointClose(polylineSession(f.editor).state.get()!.points[1], { x: 40, y: 0 });
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'perpendicular');
    polylineSession(f.editor).controller!.back(); assert.equal(cadSnapIndicator(f.editor).get(), null);
    polylineSession(f.editor).controller!.add({ x: 42, y: 2 });
    pointClose(polylineSession(f.editor).state.get()!.points[1], { x: 42, y: 2 });
    tool.onCancel(); assert.equal(f.shapes.size, 1);
  });
  it('creates tangent dimensions from their first point without imposing tangent construction on circle radii', () => {
    for (const Tool of [CadDimensionTool, CadCircleTool]) {
      const f = setup(); circle(f); const tool = new Tool(f.editor, undefined as any); tool.onEnter();
      const query = { x: 52, y: -85 }; click(tool, f, { x: 200, y: 0 }); click(tool, f, query);
      const result = [...f.shapes.values()].find(s => s.id !== 'shape:reference'); assert.ok(result);
      if (Tool === CadDimensionTool) pointClose({ x: result.x + result.props.endX, y: result.y + result.props.endY }, { x: 50, y: -Math.sqrt(7500) });
      else close(result.props.w / 2, Math.hypot(query.x - 200, query.y));
    }
  });
  it('retains Shift priority, handles readonly interruption, and leaves old drawings opted out', () => {
    assert.equal(readCadSnapSettings(fixture().editor).tangent, false); assert.equal(readCadSnapSettings(fixture().editor).perpendicular, false);
    const f = setup(); line(f); const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    click(tool, f, { x: 40, y: 60 }); f.editor.inputs.shiftKey = true; click(tool, f, { x: 42, y: 2 });
    const end = polylineSession(f.editor).state.get()!.points[1]; close(end.x, 40); assert.ok(Math.abs(end.y) > 0.01);
    f.state.isReadonly = true; tool.onPointerMove(); assert.equal(f.shapes.size, 1); assert.equal(cadSnapIndicator(f.editor).get(), null);
    assert.equal(writeCadSnapSettings(f.editor, { tangent: false }), false);
  });
  for (const scale of [1, 10]) it(`exports exact tangent endpoints and analytic circles through independent DXF parsing at 1:${scale}`, () => {
    const f = setup(); circle(f); const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    click(tool, f, { x: 200, y: 0 }); click(tool, f, { x: 52, y: -85 }); tool.onComplete();
    const output = buildCadDxf(f.editor, 'all', { ...DEFAULT_CAD_SETTINGS, scale }); assert.deepEqual(output.omitted, []);
    const dxf = new DxfParser().parseSync(output.text)!;
    const circleEntity = dxf.entities.find((e: any) => e.type === 'CIRCLE') as any;
    const contour = dxf.entities.find((e: any) => e.type === 'LINE') as any;
    assert.ok(circleEntity && contour); assert.equal(contour.vertices.length, 2);
    const [a, b] = contour.vertices, c = circleEntity.center, radius = circleEntity.radius;
    close(Math.hypot(b.x - c.x, b.y - c.y), radius, 1e-6);
    close(((a.x - b.x) * (b.x - c.x) + (a.y - b.y) * (b.y - c.y)) / radius ** 2, 0, 1e-7);
  });
});
