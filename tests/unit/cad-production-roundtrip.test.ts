import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import DxfParser from 'dxf-parser';
import {createTLStore,defaultShapeUtils,PageRecordType,getIndices} from '@tldraw/tldraw';
import {fixture} from '../helpers/cad-editor';
import {CadBezierShapeUtil} from '../../src/lib/components/canvas/shapes/CadBezierShape';
import {CadPathShapeUtil,CadEllipseShapeUtil,CadArcShapeUtil,CadDimensionShapeUtil} from '../../src/lib/components/canvas/shapes/CadShapes';
import {DEFAULT_CAD_SETTINGS,writeCadSettings} from '../../src/lib/components/canvas/cad-settings';
import {prepareCadImport,readCadDxf} from '../../src/lib/components/canvas/cad-import';
import {measureCadEdgeAngle,measureCadJointAngle,productionPresetGeometry} from '../../src/lib/components/canvas/cad-production-geometry';
import {applyCadPlan} from '../../src/lib/components/canvas/cad-plans';
import {buildCadDxf,serializeCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {prepareCreationCanvas} from '../../src/lib/order/creation-canvas';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const source=readFileSync('tests/fixtures/cad/production-reference.dxf','utf8');
const reference=new DxfParser().parseSync(source)!;
const shapeUtils=[...defaultShapeUtils,CadPathShapeUtil,CadEllipseShapeUtil,CadArcShapeUtil,CadDimensionShapeUtil,CadBezierShapeUtil];

it('measures the actual obtuse angle at a joint with either segment direction', () => {
 const tip = {x:0,y:0}, a = {x:20,y:0}, b = {x:-10,y:10*Math.sqrt(3)};
 near(measureCadJointAngle({start:a,end:tip},{start:tip,end:b})!,120);
 near(measureCadJointAngle({start:tip,end:a},{start:b,end:tip})!,120);
 const other = {start:{x:1,y:0},end:{x:b.x+1,y:b.y}};
 assert.equal(measureCadJointAngle({start:tip,end:a},other),undefined);
 near(measureCadEdgeAngle({start:tip,end:a},other),60);
});

describe('production DXF through order persistence',()=>{
 for(const [unit,scale] of [['mm',1],['mm',10],['in',10]] as const){
  it(`retains full-size analytic geometry after import, native store reload and export at ${unit} 1:${scale}`,()=>{
   const f=fixture(),settings={...DEFAULT_CAD_SETTINGS,unit,scale,originX:137,originY:249};
   assert.equal(writeCadSettings(f.editor,settings),true);
   const plan=prepareCadImport(f.editor,settings,source,{keepCoordinates:true});
   assert.deepEqual(plan.omitted,[]);assert.equal(plan.requiresUnit,false);
   near(plan.widthMm,1220);near(plan.heightMm,600);assert.equal(applyCadPlan(f.editor,plan),true);
   const store=createTLStore({shapeUtils}),indices=getIndices(f.shapes.size);
   const page=PageRecordType.create({...f.editor.getCurrentPage(),name:'TEST ONLY production',index:getIndices(1)[0]});
   const shapes=[...f.shapes.values()].map((shape,i)=>store.schema.types.shape.create({...shape,index:indices[i]}));
   store.put([page,...shapes]);
   const persisted=prepareCreationCanvas({document:store.getStoreSnapshot('document')},'local','saved',{},new Set());
   const restored=createTLStore({shapeUtils});restored.loadStoreSnapshot(persisted.document);
   assert.deepEqual(restored.get(page.id)?.meta.omsCad,settings);
   const reload=fixture();reload.editor.updatePage(restored.get(page.id));
   shapes.forEach(shape=>reload.shapes.set(shape.id,restored.get(shape.id)));
   const output=buildCadDxf(reload.editor,'all',settings);
   assert.equal(output.entities,7);assert.equal(output.closedContours,4);assert.equal(output.openContours,3);
   assert.deepEqual(output.omitted,[]);near(output.widthMm,1220);near(output.heightMm,600);
   const parsed=new DxfParser().parseSync(output.text)!;
   assert.equal(parsed.header.$INSUNITS,4);
   const compare=(actual:any,expected:any)=>{
    if(typeof expected==='number'){near(actual,expected);return;}
    if(Array.isArray(expected)){assert.equal(actual.length,expected.length);expected.forEach((item,i)=>compare(actual[i],item));return;}
    if(expected&&typeof expected==='object'){for(const key of Object.keys(expected))if(key!=='handle'&&key!=='ownerHandle')compare(actual[key],expected[key]);return;}
    assert.equal(actual,expected);
   };
   compare(parsed.entities,reference.entities);
  });
 }
});

it('reimports and applies a dense polyline export across independent outlines', () => {
 const { editor, shapes } = fixture();
 const settings = DEFAULT_CAD_SETTINGS;
 const entities = Array.from({ length: 6 }, (_, index) => ({
  type: 'polyline' as const, closed: true,
  points: Array.from({ length: 768 }, (_, vertex) => {
   const angle = vertex * 2 * Math.PI / 768;
   return { x: index * 70 + 30 * Math.cos(angle), y: 30 * Math.sin(angle) };
  })
 }));
 const output = serializeCadDxf(entities);
 const plan = prepareCadImport(editor, settings, output.text, { keepCoordinates: true });
 assert.deepEqual(plan.omitted, []);
 assert.equal(plan.contours.reduce((total, contour) => total + contour.nodes.length, 0), 4608);
 assert.equal(applyCadPlan(editor, plan), true);
 assert.equal(shapes.size, 6);
 const roundTrip = buildCadDxf(editor, 'selected', settings, { curves: 'polyline' });
 assert.equal(roundTrip.closedContours, 6);
 assert.deepEqual(roundTrip.omitted, []);
 near(roundTrip.widthMm, output.widthMm);
 near(roundTrip.heightMm, output.heightMm);
});

it('exports custom production templates at the requested millimetre dimensions', () => {
 const templates = [
  { id: 'mountingSlot', width: 45, height: 8, closed: 1, open: 0 },
  { id: 'mountingPlate', width: 180, height: 60, closed: 5, open: 0 },
  { id: 'mountingRail', width: 150, height: 24, closed: 3, open: 0 },
  { id: 'cableEntry', width: 32, height: 32, closed: 1, open: 0 },
  { id: 'signBlank', width: 420, height: 160, closed: 1, open: 0 },
  { id: 'trimMarks', width: 216, height: 116, closed: 0, open: 8 },
 ] as const;
 for (const template of templates) {
  const geometry = productionPresetGeometry(template.id, template);
  const result = readCadDxf(DEFAULT_CAD_SETTINGS, serializeCadDxf(geometry).text, {keepCoordinates:true});
  assert.deepEqual(result.omitted, []);
  near(result.widthMm, template.width);
  near(result.heightMm, template.height);
  assert.equal(result.contours.filter(contour => contour.closed).length, template.closed);
  assert.equal(result.contours.filter(contour => !contour.closed).length, template.open);
 }
 const holes = productionPresetGeometry('mountingPlate', {width:180, height:60}).filter(entity => entity.type === 'circle');
 assert.deepEqual(holes.map(hole => [hole.center.x, hole.center.y, hole.radius]), [
  [-80, -20, 3], [-80, 20, 3], [80, -20, 3], [80, 20, 3]
 ]);
 assert.deepEqual(productionPresetGeometry('mountingPlate', {width:25, height:40}), []);
 assert.deepEqual(productionPresetGeometry('mountingSlot', {width:4, height:8}), []);
});
