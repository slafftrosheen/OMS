import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/cad-editor';
import { drawingGuidesFromSelection, middleDrawingGuide } from '../../src/lib/components/canvas/drawing-guide-construction';
import { snapDrawingGuideToObjects } from '../../src/lib/components/canvas/drawing-guide-object-snap';
import { drawingGuideLine, projectToDrawingGuide, type DrawingGuideGeometry } from '../../src/lib/components/canvas/drawing-guides';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const signedDistance = (guide: DrawingGuideGeometry, point: { x: number; y: number }) => {
  const line = drawingGuideLine(guide);
  return (point.x - line.point.x) * line.normal.x + (point.y - line.point.y) * line.normal.y;
};

describe('Guideline construction from existing geometry', () => {
  it('constructs the exact middle of oppositely directed angled guides without averaging their angles', () => {
    const first: DrawingGuideGeometry = { axis: 'angle', pivot: { x: 120, y: 80 }, angle: 30 };
    const second: DrawingGuideGeometry = { axis: 'angle', pivot: { x: 240, y: 40 }, angle: 210 };
    const middle = middleDrawingGuide(first, second)!;
    assert.equal(middle.axis, 'angle');
    near(middle.angle!, 30);
    const line = drawingGuideLine(middle), separation = signedDistance(first, drawingGuideLine(second).point);
    for (const t of [-500, 0, 270]) {
      const point = { x: line.point.x + t * line.along.x, y: line.point.y + t * line.along.y };
      near(signedDistance(first, point), separation / 2);
      near(Math.abs(signedDistance(second, point)), Math.abs(separation) / 2);
    }
    assert.deepEqual(middleDrawingGuide({ axis: 'x', position: 20 }, { axis: 'x', position: 100 }), { axis: 'x', position: 60 });
    assert.equal(middleDrawingGuide(first, { ...second, angle: 200 }), null, 'crossing lines do not have a unique middle');
    assert.equal(middleDrawingGuide({ axis: 'y', position: 20 }, { axis: 'y', position: 20 }), null);
  });

  it('distinguishes the selection center from the gap between objects of different sizes', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:left', type: 'cad-ellipse', x: 0, y: 10, props: { w: 100, h: 40 } });
    f.editor.createShape({ id: 'shape:right', type: 'cad-ellipse', x: 200, y: 20, props: { w: 40, h: 40 } });
    f.editor.setSelectedShapes(['shape:right', 'shape:left']);
    const before = structuredClone([...f.shapes.values()]);
    const result = drawingGuidesFromSelection(f.editor);
    assert.deepEqual(result.centers, [{ axis: 'x', position: 120 }, { axis: 'y', position: 35 }]);
    assert.deepEqual(result.gapX, { axis: 'x', position: 150 });
    assert.equal(result.gapY, null, 'overlapping Y extents have no external Y gap');
    assert.equal(result.parallel, null, 'ellipses do not supply a pair of straight lines');
    assert.deepEqual([...f.shapes.values()], before);
  });

  it('uses whole group bounds once, including nested transforms', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 100, y: 50, rotation: Math.PI / 2 });
    f.editor.createShape({ id: 'shape:one', type: 'cad-path', parentId: 'shape:group', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 20 }], closed: false } });
    f.editor.createShape({ id: 'shape:two', type: 'cad-path', parentId: 'shape:group', x: 10, y: 10, props: { points: [{ x: 0, y: 0 }, { x: 30, y: 20 }], closed: false } });
    f.editor.setSelectedShapes(['shape:group', 'shape:one']);
    const result = drawingGuidesFromSelection(f.editor);
    near(result.centers[0].position!, 85);
    near(result.centers[1].position!, 100);
    assert.equal(result.parallel, null);
  });

  it('creates an equidistant guide between straight paths even when lengths and drawing directions differ', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:a', type: 'cad-path', x: 100, y: 100, rotation: Math.PI / 6,
      props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false } });
    f.editor.createShape({ id: 'shape:b', type: 'cad-bezier', x: 100, y: 140, rotation: Math.PI / 6,
      props: { contours: [{ closed: false, nodes: [nodeAt({ x: 200, y: 0 }), nodeAt({ x: 30, y: 0 })] }] } });
    f.editor.setSelectedShapes(['shape:a', 'shape:b']);
    const result = drawingGuidesFromSelection(f.editor);
    assert.ok(result.parallel && result.parallel.axis === 'angle');
    const line = drawingGuideLine(result.parallel), first = { x: 100, y: 100 }, second = { x: 100, y: 140 };
    near(Math.abs(signedDistance(result.parallel, first)), Math.abs(signedDistance(result.parallel, second)));
    near(line.along.y / line.along.x, Math.tan(Math.PI / 6));
    const shape = f.shapes.get('shape:b');
    shape.props.contours[0].nodes[0].outY = 20;
    assert.equal(drawingGuidesFromSelection(f.editor).parallel, null, 'a bowed cubic is not labeled straight');
  });
});

describe('Moving guidelines onto geometric object targets', () => {
  function target() {
    const f = fixture();
    f.editor.createShape({ id: 'shape:target', type: 'cad-path', props: { points: [{ x: 160, y: 45 }, { x: 200, y: 45 }], closed: false } });
    return f;
  }

  it('snaps the dragged angled line through a nearby endpoint using only a normal correction', () => {
    const f = target(), geometry: DrawingGuideGeometry = { axis: 'angle', pivot: { x: 100, y: 100 }, angle: 45 };
    // Pointer is slightly off the grab line; its projection is the snap reference.
    const result = snapDrawingGuideToObjects(f.editor, geometry, { x: 162, y: 42 }, true)!;
    assert.ok(result && result.geometry.axis === 'angle');
    assert.equal(result.snap.kind, 'endpoints');
    assert.deepEqual(result.snap.point, { x: 160, y: 45 });
    near(result.geometry.angle, 45);
    near(result.geometry.pivot.x, 102.5); near(result.geometry.pivot.y, 102.5);
    const projected = projectToDrawingGuide(result.geometry, result.snap.point);
    near(projected.x, result.snap.point.x); near(projected.y, result.snap.point.y);
  });

  it('honors explicit bypass, target options and zoom without snapping back to the old guide', () => {
    const f = target();
    f.editor.updatePage({ meta: { omsGuides: { version: 1, visible: true, locked: false, guides: [
      { id: 'guide:old', axis: 'x', position: 156, visible: true, locked: false },
    ] } } });
    const geometry: DrawingGuideGeometry = { axis: 'x', position: 155 };
    assert.equal(snapDrawingGuideToObjects(f.editor, geometry, { x: 155, y: 45 }, false), null);
    assert.equal(snapDrawingGuideToObjects(f.editor, geometry, { x: 155, y: 45 }, true)?.geometry.position, 160);
    f.state.zoom = 2;
    assert.equal(snapDrawingGuideToObjects(f.editor, geometry, { x: 155, y: 45 }, true), null, '5 page units is 10 screen pixels at 2×');
    f.state.zoom = 1;
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCadSnap: { objects: false } } });
    assert.equal(snapDrawingGuideToObjects(f.editor, geometry, { x: 155, y: 45 }, true), null);
  });
});
