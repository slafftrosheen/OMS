import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { fixture } from '../helpers/cad-editor';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { planDxfImport, prepareCadImport, readCadDxf } from '../../src/lib/components/canvas/cad-import';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import {
  addProductionLayer, MAX_PRODUCTION_LAYERS, productionLayerId, readProductionLayers, updateProductionLayer,
} from '../../src/lib/components/canvas/cad-production-layers';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';

const settings = { ...DEFAULT_CAD_SETTINGS, originX: 0, originY: 0 };
const options = { keepCoordinates: true, preserveLayers: true };
const line = (layer: string, height = 0) => [0, 'LINE', 8, layer, 10, 0, 20, height, 11, 40, 21, height];
const dxf = (entities: Array<string | number>, additionalSections: Array<string | number> = []) => [
  0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
  ...additionalSections, 0, 'SECTION', 2, 'ENTITIES', ...entities, 0, 'ENDSEC', 0, 'EOF', '',
].join('\n');

describe('DXF production layer import', () => {
  it('uses effective block layers, preserves the BYLAYER color, and keeps hidden source geometry out', () => {
    const drawing = dxf([
      ...line('oms_job_cut'), ...line('0', 10),
      0, 'INSERT', 8, 'Score', 2, 'b', 10, 10, 20, 20,
      ...line('off'),
    ], [
      0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER',
      0, 'LAYER', 2, 'SCORE', 62, 1, 420, 0x347abc,
      0, 'LAYER', 2, 'OFF', 70, 1, 62, 7, 0, 'ENDTAB', 0, 'ENDSEC',
      0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 2, 'b',
      0, 'CIRCLE', 8, '0', 10, 30, 20, 20, 40, 10,
      0, 'ARC', 8, 'score', 10, 40, 20, 25, 40, 10, 50, 0, 51, 90,
      ...line('Reference', 30), 0, 'ENDBLK', 0, 'ENDSEC',
    ]);
    for (const projection of ['strict', 'xy'] as const) {
      const { editor } = fixture();
      const plan = prepareCadImport(editor, settings, drawing, { ...options, projection });
      assert.deepEqual(plan.omitted, [{ type: 'LINE', reason: 'unsupported', layer: 'off' }]);
      assert.equal(plan.unassignedCount, 1);
      assert.deepEqual(plan.layerReview.map(layer => [layer.sourceName, layer.count, layer.destination?.name, !!layer.created]), [
        ['oms_job_cut', 1, 'Cut', false], ['Score', 2, 'Score', true], ['Reference', 1, 'Reference', false],
      ]);
      assert.ok(plan.shapes);
      if (projection === 'strict') {
        assert.deepEqual(plan.shapes.map(shape => shape.type), ['cad-bezier', 'cad-bezier', 'cad-ellipse', 'cad-arc', 'cad-bezier']);
      }
      assert.equal(plan.shapes[2].meta?.omsVectorPaint.stroke, '#347abc');
      assert.equal(plan.shapes[3].meta?.omsVectorPaint.stroke, '#347abc');
    }
  });

  it('adds layers with their geometry in the same transaction and reuses them on reimport', () => {
    const { editor, shapes, marks } = fixture();
    const drawing = dxf([...line('OMS_JOB_CUT'), ...line('Clearance', 10), ...line('Print', 20), ...line('0', 30)]);
    const plan = prepareCadImport(editor, settings, drawing, options);
    assert.equal(readProductionLayers(editor).length, 6);
    assert.equal(applyCadPlan(editor, plan), true);
    const clearance = readProductionLayers(editor).find(layer => layer.name === 'Clearance')!;
    assert.deepEqual([...shapes.values()].map(productionLayerId), ['cut', clearance.id, 'print', undefined]);

    const exported = buildCadDxf(editor, 'all', settings, { productionLayers: {} });
    assert.equal(exported.filteredByLayer, 2);
    const readback = prepareCadImport(editor, settings, exported.text, options);
    assert.equal(readback.layerReview.length, 2);
    assert.equal(readback.layerReview.find(layer => layer.destination?.id === clearance.id)?.sourceName, 'OMS_JOB_CLEARANCE');
    assert.ok(readback.layerReview.every(layer => !layer.created));
    assert.deepEqual(readback.omitted, []);

    editor.bailToMark(marks[0].id);
    assert.equal(shapes.size, 0);
    assert.equal(readProductionLayers(editor).length, 6);
    assert.equal(editor.getCurrentPage().meta.retained, 'metadata');
  });

  it('maps source names to existing layers or unassigned without rereading geometry', () => {
    const { editor } = fixture();
    const drawing = readCadDxf(settings, dxf([...line('Router'), ...line('router', 10), ...line('Notes', 20)]), options);
    const legacy = planDxfImport(editor, drawing, options);
    assert.equal(legacy.layerReview[0].destination?.name, 'Router');
    const plan = planDxfImport(editor, drawing, {
      ...options, layerDestinations: new Map<string, string | null>([['ROUTER', 'cut'], ['Notes', null]]),
    });
    assert.deepEqual(plan.layerReview.map(layer => [layer.count, layer.destination?.id]), [[2, 'cut'], [1, undefined]]);
    assert.equal(plan.contours, legacy.contours);
    assert.equal(plan.shapes![0].meta?.omsProductionLayer, 'cut');
    assert.equal(plan.shapes![2].meta?.omsProductionLayer, undefined);
    const unavailable = planDxfImport(editor, drawing, {
      ...options, layerDestinations: new Map([['Notes', 'removed-layer']]),
    });
    assert.equal(unavailable.missingLayerDestination, true);
    assert.equal(applyCadPlan(editor, unavailable), false);
    assert.equal(applyCadPlan(editor, plan), true);
    assert.equal(readProductionLayers(editor).length, 6);
  });

  it('round-trips exact colors per entity on one production layer without merging different colors', () => {
    const { editor } = fixture();
    const shape = (x: number, rgb: number) => [
      0, 'LWPOLYLINE', 8, 'Cut', 420, rgb, 90, 4, 70, 1,
      10, x, 20, 0, 10, x+30, 20, 0, 10, x+30, 20, 20, 10, x, 20, 20,
    ];
    const plan = prepareCadImport(editor, settings, dxf([...shape(0, 0xb01020), ...shape(30, 0x1670b4)]), options);
    assert.equal(applyCadPlan(editor, plan), true);
    const legacy = buildCadDxf(editor, 'all', settings, { productionLayers: {}, commonLines: true });
    assert.match(legacy.text, /\r\nAC1015\r\n/);
    assert.equal(legacy.sharedEdges, 1);
    const exact = buildCadDxf(editor, 'all', settings, {
      productionLayers: { preserveColors: true }, commonLines: true, includePreview: true,
    });
    assert.match(exact.text, /\r\nAC1018\r\n/);
    assert.equal(exact.sharedEdges, 0);
    assert.equal(exact.entities, 2);
    assert.deepEqual(exact.layers.map(layer => layer.name), ['OMS_JOB_CUT']);
    assert.deepEqual(exact.preview?.layers[0].colorPaths?.map(path => path.rgb), ['#B01020', '#1670B4']);
    const readback = prepareCadImport(editor, settings, exact.text, options);
    assert.deepEqual(readback.omitted, []);
    assert.equal(readback.layerReview[0].destination?.id, 'cut');
    const effectiveColor = (shape: NonNullable<typeof readback.shapes>[number]) => shape.meta?.omsVectorPaint.stroke;
    assert.deepEqual(readback.shapes!.map(effectiveColor), ['#b01020', '#1670b4']);
  });

  it('applies existing layer policies and invalidates a reviewed plan if the policy changes', () => {
    const { editor, shapes } = fixture();
    const drawing = dxf([...line('Print'), ...line('Engrave', 10)]);
    const stale = prepareCadImport(editor, settings, drawing, options);
    assert.equal(updateProductionLayer(editor, 'print', { visible: false }), true);
    assert.equal(updateProductionLayer(editor, 'engrave', { locked: true }), true);
    assert.equal(applyCadPlan(editor, stale), false);
    assert.equal(shapes.size, 0);
    const current = prepareCadImport(editor, settings, drawing, options);
    assert.equal(current.layerReview[0].destination?.includeInDxf, false);
    assert.equal(applyCadPlan(editor, current), true);
    assert.deepEqual([...shapes.values()].map(shape => [shape.opacity, shape.isLocked]), [[0, true], [1, true]]);
    assert.deepEqual(editor.getSelectedShapeIds(), []);
  });

  it('keeps the default import usable at the layer limit and rolls back failed creation', () => {
    const { editor, shapes } = fixture();
    for (let count = readProductionLayers(editor).length; count < MAX_PRODUCTION_LAYERS; count++) {
      assert.equal(addProductionLayer(editor, `Existing ${count}`), true);
    }
    const drawing = dxf(line('New layer'));
    const preserved = prepareCadImport(editor, settings, drawing, options);
    assert.equal(preserved.layerLimitExceeded, true);
    assert.equal(applyCadPlan(editor, preserved), false);
    assert.equal(shapes.size, 0);
    const reassigned = prepareCadImport(editor, settings, drawing, {
      ...options, layerDestinations: new Map([['New layer', 'cut']]),
    });
    assert.equal(reassigned.layerLimitExceeded, false);
    assert.equal(reassigned.shapes![0].meta?.omsProductionLayer, 'cut');
    const geometry = prepareCadImport(editor, settings, drawing, { keepCoordinates: true });
    assert.equal(geometry.layerReview[0].count, 1);
    assert.equal(applyCadPlan(editor, geometry), true);
    assert.equal(productionLayerId([...shapes.values()][0]), undefined);

    const fresh = fixture();
    fresh.state.failCreation = true;
    assert.equal(applyCadPlan(fresh.editor, prepareCadImport(fresh.editor, settings, drawing, options)), false);
    assert.equal(fresh.shapes.size, 0);
    assert.equal(readProductionLayers(fresh.editor).length, 6);
  });
});
