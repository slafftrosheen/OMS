import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/cad-editor';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, readCadSettings, type CadSettings } from '../../src/lib/components/canvas/cad-settings';
import { spawnDraftOrderTemplate, syncOrderDataToCanvas } from '../../src/lib/components/canvas/templates/DraftOrderTemplate';
import { defaultCanvasFormSize, defaultOrderCanvasScale, canvasFormScalePercent, FORM_WIDTHS, ORDER_CANVAS_SCALE_META_KEY, readOrderCanvasScale } from '../../src/lib/components/canvas/shapes/form-shapes/form-layout';
import { scaleCanvasForm } from '../../src/lib/components/canvas/workbench-operations';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const seed = { orderId: 'order:scale', title: 'Signage', clientName: 'Client', profiles: [{ quantity: 2, configuration: { material: 'steel' } }] };

function templateFixture(settings: CadSettings | null = DEFAULT_CAD_SETTINGS) {
  const f = fixture();
  if (settings) f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: { ...settings } } });
  f.editor.getCurrentPageShapes = () => [...f.shapes.values()];
  f.editor.createShapes = (shapes: any[]) => shapes.forEach(shape => f.editor.createShape(shape));
  f.editor.deleteShape = (id: string) => f.editor.deleteShapes([id]);
  f.editor.batch = (fn: () => void) => f.editor.run(fn);
  let fits = 0;
  f.editor.zoomToFit = () => { fits++; };
  return { ...f, fits: () => fits };
}

describe('physical order canvas defaults', () => {
  for (const settings of [DEFAULT_CAD_SETTINGS, { ...DEFAULT_CAD_SETTINGS, unit: 'in' as const },
    { ...DEFAULT_CAD_SETTINGS, scale: 25, unit: 'm' as const, originX: 37, originY: -29 }]) {
    it(`uses a 6000 mm form with proportional positions at ${settings.unit}, 1:${settings.scale}`, () => {
      const f = templateFixture(settings), originalSettings = structuredClone(readCadSettings(f.editor));
      const spawned = spawnDraftOrderTemplate(f.editor, seed);
      assert.ok(spawned);
      const scale = defaultOrderCanvasScale(settings), mm = cadMmPerPixel(settings);
      const form = f.editor.getShape(spawned.profileIds[0]), details = f.editor.getShape(spawned.detailsId), address = f.editor.getShape(spawned.addressId);
      near(form.props.w * mm, 6000); near(form.props.h * mm, 3000);
      near(form.x / scale, 24); near(form.y / scale, 520);
      near(details.props.w / form.props.w, 880 / 1800); near(details.props.h / form.props.h, 460 / 900);
      near(address.x / scale, 944); near(address.props.w, details.props.w);
      for (const [index, id] of Object.values(spawned.frameIds).entries()) {
        const frame = f.editor.getShape(id);
        near(frame.x / scale, 1880); near(frame.y / scale, index * 540);
        near(frame.props.w / scale, 800); near(frame.props.h / scale, 500);
        assert.equal(readOrderCanvasScale(frame), scale);
      }
      assert.deepEqual(readCadSettings(f.editor), originalSettings);
      assert.deepEqual(form.props.data, { material: 'steel' }); assert.equal(form.props.quantity, 2);
      assert.equal(f.fits(), 1);
      near(canvasFormScalePercent(form.type, form.props.w, settings)!, 100);
    });
  }

  it('keeps HTML design widths unchanged and converts all three form defaults', () => {
    assert.deepEqual(FORM_WIDTHS, { 'profile-7st': 1800, 'order-details': 880, 'order-address': 880 });
    const factor = defaultOrderCanvasScale();
    assert.deepEqual(defaultCanvasFormSize('profile-7st'), { w: 1800 * factor, h: 900 * factor });
    assert.deepEqual(defaultCanvasFormSize('order-details'), { w: 880 * factor, h: 460 * factor });
    assert.deepEqual(defaultCanvasFormSize('order-address'), { w: 880 * factor, h: 460 * factor });
    assert.equal(defaultCanvasFormSize('text'), null);
    const f = templateFixture(null), spawned = spawnDraftOrderTemplate(f.editor, seed)!;
    near(f.editor.getShape(spawned.profileIds[0]).props.w * cadMmPerPixel(DEFAULT_CAD_SETTINGS), 6000);
    assert.equal(readCadSettings(f.editor), null);
  });

  it('rejects a whole template when readonly, over capacity, outside drawing limits or partially refused', () => {
    for (const kind of ['readonly', 'capacity', 'limits', 'refused'] as const) {
      const f = templateFixture(kind === 'limits' ? { ...DEFAULT_CAD_SETTINGS, scale: 0.001 } : DEFAULT_CAD_SETTINGS);
      f.editor.createShape({ id: 'shape:existing', type: 'cad-ellipse', x: 10, y: 20, props: { w: 100, h: 50 } });
      const before = structuredClone([...f.shapes.values()]);
      if (kind === 'readonly') f.state.isReadonly = true;
      if (kind === 'capacity') f.editor.options.maxShapesPerPage = 7;
      if (kind === 'refused') {
        const create = f.editor.createShape;
        f.editor.createShape = (shape: any) => { if (shape.type !== 'order-address') create(shape); };
      }
      assert.equal(spawnDraftOrderTemplate(f.editor, seed), null, kind);
      assert.deepEqual([...f.shapes.values()], before, kind); assert.equal(f.fits(), 0);
    }
  });

  it('treats only explicit valid metadata as scaled and keeps legacy resized pockets unchanged', () => {
    for (const invalid of [null, undefined, 0, -1, NaN, Infinity, '12', 1e-320, 1_000_001])
      assert.equal(readOrderCanvasScale({ meta: { [ORDER_CANVAS_SCALE_META_KEY]: invalid } }), 1);
    assert.equal(readOrderCanvasScale(undefined), 1); assert.equal(readOrderCanvasScale(null), 1);
    assert.equal(readOrderCanvasScale({ meta: { [ORDER_CANVAS_SCALE_META_KEY]: 12.5 } }), 12.5);
    assert.equal(readOrderCanvasScale({ meta: {} }), 1);
  });
});

describe('saved order layouts and proportional additions', () => {
  it('adds a second form at the original ratio without resizing the first form or altering document calibration', () => {
    const settings = { ...DEFAULT_CAD_SETTINGS, unit: 'in' as const, scale: 10 }, f = templateFixture(settings);
    const spawned = spawnDraftOrderTemplate(f.editor, seed)!;
    const first = f.editor.getShape(spawned.profileIds[0]), before = structuredClone(first), scale = first.props.w / 1800;
    syncOrderDataToCanvas(f.editor, spawned.detailsId, spawned.addressId, { ...seed, profiles: [...seed.profiles, { quantity: 3, configuration: { material: 'acrylic' } }] });
    const forms = [...f.shapes.values()].filter(shape => shape.type === 'profile-7st');
    assert.equal(forms.length, 2); assert.deepEqual(f.editor.getShape(first.id), before);
    near(forms[1].props.w, first.props.w); near(forms[1].x, first.x);
    near(forms[1].y, first.y + first.props.h + 40 * scale);
    assert.equal(readOrderCanvasScale(forms[1]), scale); assert.deepEqual(readCadSettings(f.editor), settings);
    const saved = structuredClone([...f.shapes.values()]);
    syncOrderDataToCanvas(f.editor, spawned.detailsId, spawned.addressId, { ...seed, profiles: [...seed.profiles, { quantity: 3, configuration: { material: 'acrylic' } }] });
    assert.deepEqual([...f.shapes.values()], saved);
  });

  it('preserves a legacy form’s custom geometry when filling missing quantity and adding a sibling', () => {
    const f = templateFixture(null);
    f.editor.createShape({ id: 'shape:legacy', type: 'profile-7st', x: 76, y: 312, rotation: 0.2,
      props: { w: 1000, h: 1200, orderId: seed.orderId, profileIndex: 0, data: {} } });
    const settingsBefore = structuredClone(f.editor.getCurrentPage());
    syncOrderDataToCanvas(f.editor, undefined, undefined, { ...seed, profiles: [...seed.profiles, { quantity: 1, configuration: {} }] });
    const legacy = f.editor.getShape('shape:legacy'), second = [...f.shapes.values()].find(shape => shape.id !== legacy.id)!;
    assert.equal(legacy.x, 76); assert.equal(legacy.y, 312); assert.equal(legacy.props.w, 1000); assert.equal(legacy.props.h, 1200);
    assert.equal(legacy.rotation, 0.2); assert.equal(legacy.props.quantity, 2);
    assert.equal(second.props.w, 1000); near(second.y, 312 + 1200 + 40); assert.equal(readOrderCanvasScale(second), 1);
    assert.deepEqual(f.editor.getCurrentPage(), settingsBefore);
  });

  it('uses the physical baseline for the first sync-added form and respects readonly and ancestor locks', () => {
    const f = templateFixture();
    syncOrderDataToCanvas(f.editor, undefined, undefined, seed);
    const created = [...f.shapes.values()][0];
    near(created.props.w * cadMmPerPixel(DEFAULT_CAD_SETTINGS), 6000);
    f.editor.createShape({ id: 'shape:group', type: 'group', isLocked: true });
    f.editor.updateShape({ id: created.id, parentId: 'shape:group' });
    const saved = structuredClone([...f.shapes.values()]);
    syncOrderDataToCanvas(f.editor, undefined, undefined, { ...seed, profiles: [{ quantity: 8, configuration: {} }, { quantity: 1, configuration: {} }] });
    assert.deepEqual([...f.shapes.values()], saved);
    f.state.isReadonly = true;
    syncOrderDataToCanvas(f.editor, undefined, undefined, { ...seed, profiles: [] });
    assert.deepEqual([...f.shapes.values()], saved);
  });

  it('refuses a sync-added stack outside page limits after translated or rotated ancestor transforms', () => {
    for(const transform of [{x:0,y:999000,rotation:0},{x:-999000,y:0,rotation:Math.PI/2}]){
      const f=templateFixture();
      f.editor.createShape({id:'shape:parent',type:'group',...transform});
      f.editor.createShape({id:'shape:form',type:'profile-7st',parentId:'shape:parent',props:{w:1800,h:900,orderId:seed.orderId,profileIndex:0,quantity:2,data:seed.profiles[0].configuration}});
      const before=structuredClone([...f.shapes.values()]);
      syncOrderDataToCanvas(f.editor,undefined,undefined,{...seed,profiles:[...seed.profiles,{quantity:1,configuration:{}}]});
      assert.deepEqual([...f.shapes.values()],before);
    }
  });

  it('adds inside a rotated parent and rolls back every addition when one write is refused or moves the parent outside limits', () => {
    for(const mode of ['success','refused','changed-parent'] as const){
      const f=templateFixture();
      f.editor.createShape({id:'shape:parent',type:'group',x:100,y:200,rotation:Math.PI/2});
      f.editor.createShape({id:'shape:form',type:'profile-7st',parentId:'shape:parent',x:30,y:40,props:{w:1800,h:900,orderId:seed.orderId,profileIndex:0,quantity:2,data:seed.profiles[0].configuration}});
      const before=structuredClone([...f.shapes.values()]),create=f.editor.createShape;
      f.editor.createShape=(shape:any)=>{
        if(mode==='refused'&&shape.props?.profileIndex===2)return;
        create(shape);
        if(mode==='changed-parent'&&shape.props?.profileIndex===2)f.editor.updateShape({id:'shape:parent',x:-999000});
      };
      syncOrderDataToCanvas(f.editor,undefined,undefined,{...seed,profiles:[...seed.profiles,{quantity:1,configuration:{}},{quantity:1,configuration:{}}]});
      if(mode==='success'){
        const forms=[...f.shapes.values()].filter(shape=>shape.type==='profile-7st');
        assert.equal(forms.length,3);assert.equal(forms[1].parentId,'shape:parent');assert.equal(forms[1].x,30);assert.equal(forms[1].y,980);
        assert.deepEqual(f.editor.getShape('shape:form'),before[1]);
      }else assert.deepEqual([...f.shapes.values()],before,mode);
    }
  });
});

describe('form scaling in document units', () => {
  it('uses 100% = 6000 mm and preserves form content, position and current aspect ratio', () => {
    const f = templateFixture({ ...DEFAULT_CAD_SETTINGS, scale: 20, unit: 'in' });
    f.editor.createShape({ id: 'shape:form', type: 'profile-7st', x: 80, y: 120, props: { w: 400, h: 300, data: { retained: true } } });
    assert.equal(scaleCanvasForm(f.editor, 'shape:form', 100), true);
    const shape = f.editor.getShape('shape:form'), mm = cadMmPerPixel(readCadSettings(f.editor)!);
    near(shape.props.w * mm, 6000); near(shape.props.h / shape.props.w, 0.75);
    assert.equal(shape.x, 80); assert.equal(shape.y, 120); assert.deepEqual(shape.props.data, { retained: true });
    near(canvasFormScalePercent(shape.type, shape.props.w, readCadSettings(f.editor))!, 100);
    assert.equal(scaleCanvasForm(f.editor, 'shape:form', 50), true);
    near(f.editor.getShape('shape:form').props.w * mm, 3000);
    const mark = f.marks.at(-2)!.id; f.editor.bailToMark(mark);
    near(f.editor.getShape('shape:form').props.w * mm, 6000);
  });

  it('retains legacy pixel percentages and rolls back refused writes', () => {
    const f = templateFixture(null);
    f.editor.createShape({ id: 'shape:form', type: 'profile-7st', props: { w: 1800, h: 900 } });
    assert.equal(scaleCanvasForm(f.editor, 'shape:form', 50), true);
    assert.equal(f.editor.getShape('shape:form').props.w, 900);
    assert.equal(canvasFormScalePercent('profile-7st', 900, null), 50);
    const before = structuredClone(f.editor.getShape('shape:form'));
    f.editor.updateShape = () => {};
    assert.equal(scaleCanvasForm(f.editor, 'shape:form', 100), false);
    assert.deepEqual(f.editor.getShape('shape:form'), before);
  });

  it('refuses physical resizing past page limits for root forms, own rotation and nested ancestor transforms', () => {
    for(const mode of ['root','own-rotation','ancestors'] as const){
      const f=templateFixture();
      if(mode==='ancestors'){
        f.editor.createShape({id:'shape:outer',type:'group',x:980000,y:100,rotation:Math.PI/4});
        f.editor.createShape({id:'shape:inner',type:'group',parentId:'shape:outer',rotation:-Math.PI/4});
      }
      f.editor.createShape({id:'shape:form',type:'profile-7st',...(mode==='ancestors'?{parentId:'shape:inner'}:mode==='own-rotation'?{x:-980000,rotation:Math.PI}:{x:980000}),props:{w:1800,h:900}});
      const before=structuredClone([...f.shapes.values()]);
      assert.equal(scaleCanvasForm(f.editor,'shape:form',100),false,mode);
      assert.deepEqual([...f.shapes.values()],before,mode);
    }
  });

  it('rechecks world bounds after a write and rolls back an unsafe parent adjustment', () => {
    const f=templateFixture();
    f.editor.createShape({id:'shape:parent',type:'group'});
    f.editor.createShape({id:'shape:form',type:'profile-7st',parentId:'shape:parent',props:{w:1800,h:900}});
    const before=structuredClone([...f.shapes.values()]),update=f.editor.updateShape;
    f.editor.updateShape=(shape:any)=>{update(shape);if(shape.id==='shape:form')update({id:'shape:parent',x:980000});};
    assert.equal(scaleCanvasForm(f.editor,'shape:form',100),false);
    assert.deepEqual([...f.shapes.values()],before);
  });
});
