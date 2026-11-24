import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '../helpers/cad-editor';
import { CadAngularDimensionTool, angularDimensionGeometry } from '../../src/lib/components/canvas/CadAngularDimensionTool';
import { cadConstruction } from '../../src/lib/components/canvas/cad-construction';
import { angleDimensionAt, dimensionAngleSweep, getDimensionEndpoints } from '../../src/lib/components/canvas/cad-dimension-links';
import { dimensionMeasurementText, dimensionSettingsRevision, readDimensionOptions, updateCadDimensionOptions, validDimensionAnnotationSize, validDimensionOptions } from '../../src/lib/components/canvas/cad-dimension-settings';
import { createCadDimension, detachCadDimension } from '../../src/lib/components/canvas/cad-geometry';
import { CAD_MAX_COORDINATE, DEFAULT_CAD_SETTINGS, canvasLengthToUnit } from '../../src/lib/components/canvas/cad-settings';
import { CadDimensionShapeUtil, dimensionLayout } from '../../src/lib/components/canvas/shapes/CadShapes';
import { registerCanvasDraft } from '../../src/lib/components/canvas/canvas-document';
import { measureCadSelection } from '../../src/lib/components/canvas/cad-measurements';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';

const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const origin = { x: 0, y: 0 };
const click = (f: ReturnType<typeof fixture>, tool: CadAngularDimensionTool, x: number, y: number) => {
  f.editor.inputs.currentPagePoint = { x, y }; tool.onPointerDown({ button: 0 } as any);
};
function selectedDimension(props = {}, settings: any = DEFAULT_CAD_SETTINGS) {
  const f = fixture();
  f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: settings ? { omsCad: settings } : {} });
  f.editor.createShape({ id: 'shape:dimension', type: 'cad-dimension', props });
  f.editor.setSelectedShapes(['shape:dimension']);
  return f;
}
function draft(f: ReturnType<typeof fixture>) {
  const shape = f.only(), points = getDimensionEndpoints(f.editor, shape);
  const settings = f.editor.getCurrentPage().meta.omsCad ?? null;
  return { revision: dimensionSettingsRevision(f.editor, shape), options: readDimensionOptions(shape, settings, points.angleSweep) };
}

describe('angular dimension construction and handles', () => {
  it('constructs either signed smaller sector, accepts a straight angle and rejects zero rays and unsafe decoration bounds', () => {
    near(angularDimensionGeometry(origin, { x: 100, y: 0 }, { x: 50, y: 50 })!.props.angleSweep, Math.PI / 4);
    near(angularDimensionGeometry(origin, { x: 100, y: 0 }, { x: 0, y: -100 })!.props.angleSweep, -Math.PI / 2);
    near(angularDimensionGeometry(origin, { x: 100, y: 0 }, { x: -100, y: 0 })!.props.angleSweep, Math.PI);
    for (const end of [origin, { x: 50, y: 0 }, { x: 100, y: 1e-9 }, { x: NaN, y: 10 }])
      assert.equal(angularDimensionGeometry(origin, { x: 100, y: 0 }, end), null);
    for (const zoom of [0, -1, NaN, Infinity, 1e-12]) assert.equal(angularDimensionGeometry(origin, { x: 100, y: 0 }, { x: 0, y: 100 }, zoom), null);
    assert.equal(angularDimensionGeometry({ x: CAD_MAX_COORDINATE - 1, y: 0 }, { x: CAD_MAX_COORDINATE - 101, y: 0 }, { x: CAD_MAX_COORDINATE - 1, y: 100 }), null);
    near(dimensionAngleSweep(Math.PI / 2, true)!, -3 * Math.PI / 2);
    near(dimensionAngleSweep(-3 * Math.PI / 2, false)!, Math.PI / 2);
    near(dimensionAngleSweep(dimensionAngleSweep(Math.PI / 2, true), true)!, -3 * Math.PI / 2);
  });

  it('clears invalid previews, supports Backspace and cancels all draft geometry together', () => {
    const f = fixture(), tool = new CadAngularDimensionTool(f.editor, undefined as any); tool.onEnter();
    click(f, tool, 0, 0); click(f, tool, 100, 0);
    f.editor.inputs.currentPagePoint = { x: 0, y: 100 }; tool.onPointerMove(); assert.equal(f.shapes.size, 1);
    f.editor.inputs.currentPagePoint = { x: 50, y: 0 }; tool.onPointerMove(); assert.equal(f.shapes.size, 0);
    tool.onKeyDown({ key: 'Enter' } as any); assert.equal(f.shapes.size, 0); assert.equal(cadConstruction(f.editor).get()!.points.length, 2);
    tool.onKeyDown({ key: 'Backspace' } as any); assert.equal(cadConstruction(f.editor).get()!.points.length, 1);
    click(f, tool, 50, 50); f.editor.inputs.currentPagePoint = { x: 0, y: 100 }; tool.onPointerMove(); assert.equal(f.shapes.size, 1);
    tool.onKeyDown({ key: 'Escape' } as any); assert.equal(f.shapes.size, 0); assert.equal(cadConstruction(f.editor).get(), null); assert.equal(f.marks.length, 0);
  });

  it('commits a source-independent angle with one history boundary and rejects read-only completion', () => {
    const f = fixture(), tool = new CadAngularDimensionTool(f.editor, undefined as any); tool.onEnter();
    click(f, tool, 20, 30); click(f, tool, 120, 30); click(f, tool, 20, -70);
    assert.equal(f.shapes.size, 1); assert.equal(f.only().type, 'cad-dimension'); assert.equal(f.only().props.link, undefined);
    near(getDimensionEndpoints(f.editor, f.only()).angleSweep!, -Math.PI / 2);
    assert.equal(f.marks.length, 2); assert.equal(f.state.tool, 'select'); assert.equal(cadConstruction(f.editor).get(), null);
    f.editor.bailToMark(f.marks[0].id); assert.equal(f.shapes.size, 0);
    tool.onEnter(); click(f, tool, 0, 0); click(f, tool, 100, 0);
    f.editor.inputs.currentPagePoint = { x: 0, y: 100 }; tool.onPointerMove(); f.state.isReadonly = true;
    tool.onKeyDown({ key: 'Enter' } as any); assert.equal(f.shapes.size, 0); assert.equal(cadConstruction(f.editor).get(), null);
  });

  it('snaps the second ray to 15 degrees and keeps the other ray fixed while moving the first', () => {
    const f = selectedDimension({ endX: 100, angleSweep: Math.PI / 2 });
    const util = new CadDimensionShapeUtil(f.editor), shape = f.only();
    assert.deepEqual(util.getHandles(shape).map(handle => handle.id), ['start', 'end', 'angle', 'offset']);
    f.editor.inputs.shiftKey = true;
    const angle = util.onHandleDrag(shape, { handle: { id: 'angle', x: 100 * Math.cos(.6), y: 100 * Math.sin(.6) } } as any); assert.ok(angle);
    near(angle.props!.angleSweep!, Math.PI / 6);
    f.editor.inputs.shiftKey = false;
    const first = util.onHandleDrag(shape, { handle: { id: 'end', x: 70, y: 70 } } as any); assert.ok(first);
    near(first.props!.angleSweep!, Math.PI / 4); near(first.props!.endX!, 70);
    const moved = util.onHandleDrag(shape, { handle: { id: 'start', x: 10, y: 20 } } as any); assert.ok(moved);
    near(moved.x!, 10); near(moved.y!, 20); near(moved.props!.endX!, 90); near(moved.props!.endY!, -20);
    near(moved.props!.angleSweep!, angleDimensionAt({ x: 10, y: 20 }, { x: 100, y: 0 }, { x: 0, y: 100 })!.angleSweep!);
    assert.equal(util.onHandleDrag(shape, { handle: { id: 'angle', x: 100, y: 0 } } as any), undefined);
    f.editor.updateShape({ id: shape.id, isLocked: true }); assert.equal(util.onHandleDrag(f.only(), { handle: { id: 'angle', x: 70, y: 70 } } as any), undefined);
  });
});

describe('dimension settings, values and export geometry', () => {
  it('edits precision and markers on low-zoom and downscaled annotations without changing their size', () => {
    const angle = angularDimensionGeometry(origin, { x: 100, y: 0 }, { x: 0, y: 100 }, .05);
    assert.ok(angle);
    for (const props of [angle.props, { endX: 100, endY: 0, offset: 24, decorationScale: .01 }]) {
      const f = selectedDimension(props), queued = draft(f), before = f.only().props.decorationScale;
      assert.equal(validDimensionOptions(queued.options, DEFAULT_CAD_SETTINGS), true);
      assert.equal(updateCadDimensionOptions(f.editor, f.only().id, queued.revision,
        { ...queued.options, precision: 5, marker: 'tick' }), true);
      assert.equal(f.only().props.decorationScale, before);
      assert.equal(f.only().props.precision, 5);
      assert.equal(f.only().props.marker, 'tick');
    }
    for (const value of [0, -1, NaN, Infinity, CAD_MAX_COORDINATE * 100 + 1]) assert.equal(validDimensionAnnotationSize(value), false);
  });

  it('applies physical offsets, precision and markers atomically in a scaled inch document', () => {
    const settings = { ...DEFAULT_CAD_SETTINGS, unit: 'in' as const, scale: 10 };
    const f = selectedDimension({}, settings), before = structuredClone(f.only()), queued = draft(f);
    assert.equal(updateCadDimensionOptions(f.editor, before.id, queued.revision,
      { ...queued.options, offset: -2, annotationSize: 150, precision: 4, showUnit: false, marker: 'arrow' }), true);
    near(canvasLengthToUnit(f.only().props.offset, settings), -2); near(f.only().props.decorationScale, 1.5);
    assert.equal(dimensionMeasurementText(f.only(), settings, 96, null, null), '10.0000');
    assert.equal(f.marks.length, 2); assert.equal(f.only().props.endX, before.props.endX);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.only(), before);
  });

  it('preserves the chosen reflex sector across source edits, detachment and SVG export', () => {
    const f = fixture(); f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { omsCad: DEFAULT_CAD_SETTINGS } });
    f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', props: { radius: 100, startAngle: 0, endAngle: 90 } });
    const sourceBefore = structuredClone(f.editor.getShape('shape:arc'));
    f.editor.setSelectedShapes(['shape:arc']); assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'angular'), true);
    const queued = draft(f);
    assert.equal(updateCadDimensionOptions(f.editor, f.only().id, queued.revision, { ...queued.options, angleReflex: true, precision: 3, marker: 'arrow' }), true);
    near(getDimensionEndpoints(f.editor, f.only()).angleSweep!, 3 * Math.PI / 2);
    assert.deepEqual(f.editor.getShape('shape:arc'), sourceBefore);
    f.editor.updateShape({ id: 'shape:arc', props: { endAngle: 120 } }); near(getDimensionEndpoints(f.editor, f.only()).angleSweep!, 4 * Math.PI / 3);
    assert.equal(detachCadDimension(f.editor), true); f.editor.deleteShapes(['shape:arc']);
    const shape = f.only(); near(getDimensionEndpoints(f.editor, shape).angleSweep!, 4 * Math.PI / 3);
    const svg = renderToStaticMarkup(new CadDimensionShapeUtil(f.editor).toSvg(shape));
    assert.match(svg, /240\.000°/); assert.match(svg, /data-angular-dimension="true"/); assert.match(svg, /data-dimension-state="free"/);
    const layout = dimensionLayout(f.editor, shape); assert.equal(layout.lines.length, 5);
    const bounds = f.editor.getShapeGeometry(shape).bounds;
    assert.ok(bounds.minY <= layout.midpoint.y - 20 * shape.props.decorationScale);
    const next = draft(f); assert.equal(updateCadDimensionOptions(f.editor, shape.id, next.revision, { ...next.options, marker: 'none' }), true);
    assert.equal(dimensionLayout(f.editor, f.only()).lines.length, 3);
  });

  it('blocks stale source/selection/unit drafts, read-only, locks, pointer gestures and in-progress construction', () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.state.isReadonly = true; },
      (f: ReturnType<typeof fixture>) => { f.editor.updateShape({ id: f.only().id, isLocked: true }); },
      (f: ReturnType<typeof fixture>) => { f.editor.updateShape({ id: f.only().id, props: { offset: 25 } }); },
      (f: ReturnType<typeof fixture>) => { f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { omsCad: { ...DEFAULT_CAD_SETTINGS, unit: 'cm' } } }); },
      (f: ReturnType<typeof fixture>) => { f.editor.inputs.isPointing = true; },
      (f: ReturnType<typeof fixture>) => { f.editor.inputs.isDragging = true; },
      (f: ReturnType<typeof fixture>) => { registerCanvasDraft(f.editor, () => ({ id: f.only().id, props: null })); },
      (f: ReturnType<typeof fixture>) => { f.editor.selectNone(); },
    ]) {
      const f = selectedDimension(), queued = draft(f); change(f); const before = JSON.stringify([...f.shapes.values()]);
      assert.equal(updateCadDimensionOptions(f.editor, 'shape:dimension' as any, queued.revision, { ...queued.options, precision: 4 }), false);
      assert.equal(JSON.stringify([...f.shapes.values()]), before); assert.equal(f.marks.length, 0);
    }
    const f = fixture(); f.editor.createShape({ id: 'shape:source', type: 'cad-path' }); f.editor.setSelectedShapes(['shape:source']);
    assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'horizontal'), true);
    const queued = draft(f); f.editor.updateShape({ id: 'shape:source', x: 40 });
    assert.equal(updateCadDimensionOptions(f.editor, f.only().id, queued.revision, { ...queued.options, precision: 4 }), false);
    const fresh = draft(f); f.editor.deleteShapes(['shape:source']);
    assert.equal(updateCadDimensionOptions(f.editor, f.only().id, fresh.revision, { ...fresh.options, precision: 4 }), false);
  });

  it('rolls back refused, partial or out-of-bounds updates and rejects collapsed angular offsets', () => {
    for (const partial of [false, true]) {
      const f = selectedDimension(), queued = draft(f), before = structuredClone(f.only()), update = f.editor.updateShape;
      f.editor.updateShape = (change: any) => { if (partial) update({ ...change, props: { offset: change.props.offset } }); };
      assert.equal(updateCadDimensionOptions(f.editor, before.id, queued.revision, { ...queued.options, offset: 40, precision: 4 }), false);
      assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    }
    const f = selectedDimension({}, null), queued = draft(f), before = structuredClone(f.only());
    assert.equal(updateCadDimensionOptions(f.editor, before.id, queued.revision, { ...queued.options, offset: CAD_MAX_COORDINATE }), false);
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    const angle = selectedDimension({ angleSweep: Math.PI / 2 }, null), next = draft(angle);
    assert.equal(updateCadDimensionOptions(angle.editor, angle.only().id, next.revision, { ...next.options, offset: -100 }), false);
  });
});

describe('straight-edge and corner measurement readouts', () => {
  it('measures the direction through rotated parents and corners after conversion to editable curves', () => {
    const f = fixture(); f.editor.createShape({ id: 'shape:group', type: 'group', rotation: Math.PI / 6 });
    f.editor.createShape({ id: 'shape:edge', type: 'cad-bezier', parentId: 'shape:group', rotation: Math.PI / 6,
      props: { contours: [{ closed: false, nodes: [nodeAt(origin), nodeAt({ x: 100, y: 0 })] }] } });
    f.editor.setSelectedShapes(['shape:edge']);
    near(measureCadSelection(f.editor, DEFAULT_CAD_SETTINGS).bearing!, 300);
    f.editor.updateShape({ id: 'shape:edge', props: { contours: [{ closed: false, nodes: [nodeAt({ x: 100, y: 0 }), nodeAt(origin), nodeAt({ x: 100, y: 100 })] }] } });
    near(measureCadSelection(f.editor, DEFAULT_CAD_SETTINGS).cornerAngle!, 45);
    assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'angular'), true);
    near(Math.abs(getDimensionEndpoints(f.editor, f.only()).angleSweep!), Math.PI / 4);
    f.editor.updateShape({ id: 'shape:edge', props: { contours: [{ closed: false, nodes: [nodeAt({ x: 100, y: 0 }), { ...nodeAt(origin), outX: 10 }, nodeAt({ x: 100, y: 100 })] }] } });
    assert.equal(getDimensionEndpoints(f.editor, f.only()).status, 'broken');
    f.editor.setSelectedShapes(['shape:edge']); assert.equal(measureCadSelection(f.editor, DEFAULT_CAD_SETTINGS).cornerAngle, undefined);
  });
});
