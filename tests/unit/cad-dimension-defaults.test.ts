import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTLStore, defaultShapeUtils, HistoryManager, Vec } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { CAD_DIMENSION_BASE_TEXT_HEIGHT, CAD_DIMENSION_DEFAULTS_META_KEY, DEFAULT_CAD_DIMENSION_DEFAULTS,
  dimensionAngularOffset, dimensionCreationStyle, dimensionDefaultsRevision, dimensionStyleForCreation,
  readDimensionDefaults, validateDimensionDefaults, writeDimensionDefaults, type CadDimensionDefaults } from '../../src/lib/components/canvas/cad-dimension-defaults';
import { createCadDimension } from '../../src/lib/components/canvas/cad-geometry';
import { CAD_DIMENSION_KINDS, getDimensionEndpoints } from '../../src/lib/components/canvas/cad-dimension-links';
import { CAD_MAX_COORDINATE, DEFAULT_CAD_SETTINGS, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import { CadDimensionTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { CadAngularDimensionTool } from '../../src/lib/components/canvas/CadAngularDimensionTool';
import { CadDimensionShapeUtil, dimensionLayout } from '../../src/lib/components/canvas/shapes/CadShapes';
import { registerCanvasDraft } from '../../src/lib/components/canvas/canvas-document';

const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const physical: CadDimensionDefaults = { ...DEFAULT_CAD_DIMENSION_DEFAULTS, mode: 'physical', textHeightMm: 5,
  offsetMm: 12, precision: 3, showUnit: false, marker: 'arrow' };
function calibrated() {
  const f = fixture();
  f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { retained: 'metadata', omsCad: DEFAULT_CAD_SETTINGS } });
  return f;
}
function save(f: ReturnType<typeof fixture>, value = physical) {
  assert.equal(writeDimensionDefaults(f.editor, dimensionDefaultsRevision(f.editor), value), true);
}
function click(f: ReturnType<typeof fixture>, tool: CadDimensionTool | CadAngularDimensionTool, x: number, y: number) {
  f.editor.inputs.currentPagePoint = { x, y }; tool.onPointerDown({ button: 0 } as any);
}
function source(f: ReturnType<typeof fixture>, kind: string) {
  const type = kind === 'radius' || kind === 'diameter' ? 'cad-ellipse' : kind === 'angular' ? 'cad-arc' : 'cad-path';
  const props = type === 'cad-ellipse' ? { w: 20000, h: 20000 } : type === 'cad-arc' ? { radius: 5000, startAngle: 0, endAngle: 90 }
    : { points: [{ x: 0, y: 0 }, { x: 22000, y: 1000 }], closed: false };
  f.editor.createShape({ id: 'shape:source', type, props }); f.editor.setSelectedShapes(['shape:source']);
}

describe('page dimension defaults', () => {
  it('keeps legacy records unchanged and uses readable view defaults without saving metadata during reads', () => {
    const f = fixture(), before = structuredClone(f.editor.getCurrentPage());
    assert.deepEqual(readDimensionDefaults(f.editor), DEFAULT_CAD_DIMENSION_DEFAULTS);
    for (const zoom of [.00005, .025, 1, 8]) {
      f.state.zoom = zoom; const style = dimensionCreationStyle(f.editor)!;
      near(style.decorationScale * CAD_DIMENSION_BASE_TEXT_HEIGHT * zoom, 14);
      near(style.offset * zoom, 30);
    }
    assert.deepEqual(f.editor.getCurrentPage(), before); assert.equal(f.marks.length, 0);
    for (const value of [null, [], { ...physical, version: 2 }, { ...physical, textHeightMm: 0 }, { ...physical, offsetMm: Infinity },
      { ...physical, precision: 1.5 }, { ...physical, marker: 'triangle' }]) assert.equal(validateDimensionDefaults(value), null);
    f.editor.updatePage({ id: before.id, meta: { ...before.meta, [CAD_DIMENSION_DEFAULTS_META_KEY]: { version: 2 } } });
    const unknown = structuredClone(f.editor.getCurrentPage());
    assert.deepEqual(readDimensionDefaults(f.editor), DEFAULT_CAD_DIMENSION_DEFAULTS); assert.deepEqual(f.editor.getCurrentPage(), unknown);
  });

  it('converts physical text and offsets consistently across display units, scales and camera zooms', () => {
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) for (const scale of [.001, 1, 10, 10000]) for (const zoom of [.02, 1, 8]) {
      const settings = { ...DEFAULT_CAD_SETTINGS, unit, scale }, style = dimensionStyleForCreation(zoom, settings, physical)!;
      near(style.decorationScale * CAD_DIMENSION_BASE_TEXT_HEIGHT * cadMmPerPixel(settings), physical.textHeightMm);
      near(style.offset * cadMmPerPixel(settings), physical.offsetMm);
      assert.equal(style.precision, 3); assert.equal(style.showUnit, false); assert.equal(style.marker, 'arrow');
    }
    assert.equal(dimensionStyleForCreation(1, null, physical), null);
    for (const zoom of [0, -1, NaN, Infinity, 1e-12]) assert.equal(dimensionStyleForCreation(zoom), null);
    assert.equal(dimensionStyleForCreation(1, { ...DEFAULT_CAD_SETTINGS, scale: .001 }, { ...physical, offsetMm: 1000000 }), null);
    assert.equal(dimensionAngularOffset(10, { ...dimensionStyleForCreation(1)!, offset: -100 }, 'physical'), null);
  });

  it('persists independent page defaults through native store serialization and undo/redo', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    store.put([
      { id: 'page:first', typeName: 'page', name: 'First', index: 'a1', meta: { retained: true, omsCad: DEFAULT_CAD_SETTINGS } },
      { id: 'page:second', typeName: 'page', name: 'Second', index: 'a2', meta: { retained: false, omsCad: DEFAULT_CAD_SETTINGS } },
    ] as any);
    const history = new HistoryManager({ store }); let pageId = 'page:first';
    const editor: any = { store, inputs: {}, getInstanceState: () => ({ isReadonly: false }),
      getCurrentPageId: () => pageId, getCurrentPage: () => store.get(pageId as any),
      updatePage: (patch: any) => store.put([{ ...editor.getCurrentPage(), ...patch }]),
      run: history.batch, mark: history.mark, bailToMark: history.bailToMark };
    try {
      assert.equal(writeDimensionDefaults(editor, dimensionDefaultsRevision(editor), physical), true);
      assert.equal(editor.getCurrentPage().meta.retained, true); assert.deepEqual(readDimensionDefaults(editor), physical);
      const snapshot = JSON.parse(JSON.stringify(store.serialize()));
      assert.deepEqual(snapshot['page:first'].meta[CAD_DIMENSION_DEFAULTS_META_KEY], physical);
      pageId = 'page:second'; assert.deepEqual(readDimensionDefaults(editor), DEFAULT_CAD_DIMENSION_DEFAULTS);
      pageId = 'page:first'; history.undo(); assert.deepEqual(readDimensionDefaults(editor), DEFAULT_CAD_DIMENSION_DEFAULTS);
      history.redo(); assert.deepEqual(readDimensionDefaults(editor), physical);
      assert.deepEqual(editor.getCurrentPage().meta.omsCad, DEFAULT_CAD_SETTINGS);
    } finally { history.dispose(); }
  });

  it('rejects stale, busy, read-only, refused and rewritten defaults without changing existing dimensions', () => {
    for (const mode of ['stale-unit', 'stale-page', 'pointer', 'draft', 'readonly', 'refused', 'rewritten']) {
      const f = calibrated(); f.editor.createShape({ id: 'shape:old', type: 'cad-dimension' });
      const revision = dimensionDefaultsRevision(f.editor); let stop = () => {};
      if (mode === 'stale-unit') f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { omsCad: { ...DEFAULT_CAD_SETTINGS, unit: 'cm' } } });
      if (mode === 'stale-page') f.editor.updatePage({ id: 'page:other' });
      if (mode === 'pointer') f.editor.inputs.isPointing = true;
      if (mode === 'draft') stop = registerCanvasDraft(f.editor, () => ({ id: 'shape:old' as any, props: null }));
      if (mode === 'readonly') f.state.isReadonly = true;
      if (mode === 'refused') f.editor.updatePage = () => {};
      if (mode === 'rewritten') { const update = f.editor.updatePage; f.editor.updatePage = (patch: any) => update({ ...patch, meta: { ...patch.meta, retained: false } }); }
      const before = structuredClone(f.editor.getCurrentPage()), shapes = structuredClone([...f.shapes.values()]);
      assert.equal(writeDimensionDefaults(f.editor, revision, physical), false, mode);
      assert.deepEqual(f.editor.getCurrentPage(), before, mode); assert.deepEqual([...f.shapes.values()], shapes); assert.equal(f.marks.length, 0);
      stop();
    }
  });

  it('requires calibration for physical mode and refuses impossible converted sizes before saving', () => {
    const f = fixture(), revision = dimensionDefaultsRevision(f.editor);
    assert.equal(writeDimensionDefaults(f.editor, revision, physical), false);
    assert.equal(writeDimensionDefaults(f.editor, revision, DEFAULT_CAD_DIMENSION_DEFAULTS), true);
    const marks = f.marks.length; save(f, DEFAULT_CAD_DIMENSION_DEFAULTS); assert.equal(f.marks.length, marks);
    f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { omsCad: { ...DEFAULT_CAD_SETTINGS, scale: .001 } } });
    assert.equal(writeDimensionDefaults(f.editor, dimensionDefaultsRevision(f.editor), { ...physical, textHeightMm: 1000000 }), false);
    assert.equal(writeDimensionDefaults(f.editor, dimensionDefaultsRevision(f.editor), { ...physical, offsetMm: 1000000 }), false);
    assert.equal(f.marks.length, marks);
  });
});

describe('consistent dimension creation at production overview scale', () => {
  it('creates every selected dimension kind with readable view annotations while preserving source geometry', () => {
    for (const kind of CAD_DIMENSION_KINDS) for (const linked of [false, true]) {
      const f = calibrated(); f.state.zoom = .025; source(f, kind);
      const before = structuredClone(f.editor.getShape('shape:source'));
      assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, kind, linked), true, `${kind} ${linked}`);
      const shape = f.only(); near(shape.props.decorationScale * .025 * 14, 14);
      assert.equal(shape.props.color, 'blue'); assert.equal(shape.props.marker, 'auto'); assert.equal(shape.props.showUnit, true);
      assert.equal(getDimensionEndpoints(f.editor, shape).status, linked ? 'linked' : 'free');
      if (kind !== 'angular') near(shape.props.offset * .025, 30);
      else {
        const endpoints = getDimensionEndpoints(f.editor, shape), length = Math.hypot(endpoints.end.x - endpoints.start.x, endpoints.end.y - endpoints.start.y);
        near(shape.props.offset, dimensionAngularOffset(length, dimensionCreationStyle(f.editor)!, 'view')!);
      }
      assert.deepEqual(f.editor.getShape('shape:source'), before);
    }
  });

  it('uses saved physical typography and presentation on selected, two-point and angular dimensions', () => {
    for (const mode of ['selected', 'linear-tool', 'angle-tool']) {
      const f = calibrated(); f.state.zoom = .025; save(f);
      if (mode === 'selected') { source(f, 'horizontal'); assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'horizontal'), true); }
      else {
        const tool = mode === 'linear-tool' ? new CadDimensionTool(f.editor, undefined as any) : new CadAngularDimensionTool(f.editor, undefined as any);
        tool.onEnter(); click(f, tool, 0, 0); click(f, tool, 1000, 0); if (mode === 'angle-tool') click(f, tool, 0, 1000);
      }
      const shape = f.only(); assert.ok(shape, mode);
      near(shape.props.decorationScale * 14 * cadMmPerPixel(DEFAULT_CAD_SETTINGS), 5);
      near(shape.props.offset * cadMmPerPixel(DEFAULT_CAD_SETTINGS), 12);
      assert.equal(shape.props.precision, 3); assert.equal(shape.props.marker, 'arrow'); assert.equal(shape.props.showUnit, false);
      assert.deepEqual(readDimensionDefaults(f.editor), physical);
    }
  });

  it('rolls back refused creation, rewritten placement or a changed linked source', () => {
    for (const mode of ['refused', 'props', 'parent', 'rotation', 'source']) {
      const f = calibrated(); source(f, 'horizontal'); const create = f.editor.createShape;
      const before = structuredClone([...f.shapes.values()]);
      f.editor.createShape = (request: any) => {
        if (mode === 'refused') return;
        create(mode === 'props' ? { ...request, props: { ...request.props, decorationScale: 2 } }
          : mode === 'parent' ? { ...request, parentId: 'shape:source' }
          : mode === 'rotation' ? { ...request, rotation: .1 } : request);
        if (mode === 'source') f.editor.updateShape({ id: 'shape:source', x: 100 });
      };
      assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'horizontal'), false, mode);
      assert.deepEqual([...f.shapes.values()], before, mode); assert.deepEqual(f.editor.getSelectedShapeIds(), ['shape:source']); assert.equal(f.marks.length, 0);
    }
  });

  it('rejects dimensions whose complete label or stroke falls outside world limits before mutating', () => {
    for (const mode of ['label', 'stroke']) {
      const f = calibrated(); f.state.zoom = mode === 'label' ? .00005 : 1;
      f.editor.createShape({ id: 'shape:source', type: 'cad-path', x: mode === 'label' ? 0 : CAD_MAX_COORDINATE - 100,
        props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false } });
      f.editor.setSelectedShapes(['shape:source']); const before = structuredClone([...f.shapes.values()]);
      if (mode === 'label') f.editor.updateShape({ id: 'shape:source', x: CAD_MAX_COORDINATE - 100000 });
      const unchanged = structuredClone([...f.shapes.values()]);
      assert.equal(createCadDimension(f.editor, DEFAULT_CAD_SETTINGS, 'horizontal'), false, mode);
      assert.deepEqual([...f.shapes.values()], unchanged); assert.equal(f.marks.length, 0);
      assert.equal(before.length, 1);
    }
  });

  it('clears an invalid linear preview and never commits its last valid point on Enter', () => {
    const f = calibrated(), tool = new CadDimensionTool(f.editor, undefined as any); tool.onEnter();
    click(f, tool, 0, 0); f.editor.inputs.currentPagePoint = { x: 200, y: 0 }; tool.onPointerMove(); assert.equal(f.shapes.size, 1);
    f.editor.inputs.currentPagePoint = { x: 0, y: 0 }; tool.onPointerMove(); assert.equal(f.shapes.size, 0);
    tool.onKeyDown({ key: 'Enter' } as any); assert.equal(f.shapes.size, 0);
    f.editor.inputs.currentPagePoint = { x: 400, y: 0 }; tool.onPointerMove(); tool.onKeyDown({ key: 'Enter' } as any);
    assert.equal(f.only().props.endX, 400); assert.equal(f.marks.length, 2);
  });

  it('cancels entire interactive drafts on refused or rewritten native writes', () => {
    for (const angular of [false, true]) for (const mode of ['create', 'update', 'delete']) {
      const f = calibrated(), tool = angular ? new CadAngularDimensionTool(f.editor, undefined as any) : new CadDimensionTool(f.editor, undefined as any);
      tool.onEnter(); click(f, tool, 0, 0); if (angular) click(f, tool, 1000, 0);
      if (mode === 'create') f.editor.createShape = () => {};
      f.editor.inputs.currentPagePoint = { x: angular ? 0 : 1000, y: angular ? 1000 : 0 }; tool.onPointerMove();
      if (mode !== 'create') {
        assert.equal(f.shapes.size, 1);
        if (mode === 'update') {
          const update = f.editor.updateShape; f.editor.updateShape = (patch: any) => update({ ...patch, props: { ...patch.props, decorationScale: 2 } });
          f.editor.inputs.currentPagePoint = { x: angular ? 0 : 2000, y: angular ? 2000 : 0 };
        } else { f.editor.deleteShapes = () => {}; f.editor.inputs.currentPagePoint = { x: 0, y: 0 }; }
        tool.onPointerMove();
      }
      assert.equal(f.shapes.size, 0, `${angular} ${mode}`); assert.equal(f.marks.length, 0); assert.equal(f.state.tool, 'select');
    }
  });
});

describe('dimension stroke rendering and bounds', () => {
  it('keeps live lines visible but produces camera-independent SVG without changing stored dimensions', () => {
    const f = calibrated(); f.editor.createShape({ id: 'shape:dimension', type: 'cad-dimension', props: { decorationScale: 4, endX: 800, offset: 160 } });
    const shape = f.editor.getShape('shape:dimension'), before = structuredClone(shape), util = new CadDimensionShapeUtil(f.editor);
    const svg = renderToStaticMarkup(util.toSvg(shape)); assert.match(svg, /stroke-width="4"/); assert.match(svg, /stroke-linejoin="round"/);
    for (const zoom of [.00005, .025, 1, 8]) {
      f.state.zoom = zoom;
      const live = renderToStaticMarkup(util.component(shape));
      const width = Number(live.match(/stroke-width="([^"]+)"/)![1]);
      assert.ok(width * zoom >= 1); near(width, Math.max(4, 1 / zoom));
      assert.equal(renderToStaticMarkup(util.toSvg(shape)), svg);
    }
    assert.deepEqual(f.editor.getShape(shape.id), before);
  });

  it('includes exported stroke edges in the envelope without adding a filled hit-test rectangle', () => {
    const f = calibrated(); f.editor.createShape({ id: 'shape:dimension', type: 'cad-dimension', props: { endX: 2000, offset: 800, decorationScale: 40 } });
    const shape = f.editor.getShape('shape:dimension'), layout = dimensionLayout(f.editor, shape), geometry = f.editor.getShapeGeometry(shape);
    for (const point of layout.lines.flat()) {
      assert.ok(geometry.bounds.minX <= point.x - 20); assert.ok(geometry.bounds.maxX >= point.x + 20);
      assert.ok(geometry.bounds.minY <= point.y - 20); assert.ok(geometry.bounds.maxY >= point.y + 20);
    }
    assert.equal(geometry.hitTestPoint(new Vec(1000, 760), 0, true), false);
    assert.equal(geometry.hitTestPoint(new Vec(0, 400), 0, true), true);
    assert.equal(geometry.children.length, layout.lines.length + 1);
  });
});
