import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import DxfParser from 'dxf-parser';
import {createTLStore,defaultShapeUtils,PageRecordType,getIndices} from '@tldraw/tldraw';
import {fixture} from '../helpers/cad-editor';
import {CadBezierShapeUtil} from '../../src/lib/components/canvas/shapes/CadBezierShape';
import {CadPathShapeUtil,CadEllipseShapeUtil,CadArcShapeUtil,CadDimensionShapeUtil} from '../../src/lib/components/canvas/shapes/CadShapes';
import {DEFAULT_CAD_SETTINGS,writeCadSettings} from '../../src/lib/components/canvas/cad-settings';
import {prepareCadImport} from '../../src/lib/components/canvas/cad-import';
import {applyCadPlan} from '../../src/lib/components/canvas/cad-plans';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {prepareCreationCanvas} from '../../src/lib/order/creation-canvas';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const source=readFileSync('tests/fixtures/cad/production-reference.dxf','utf8');
const reference=new DxfParser().parseSync(source)!;
const shapeUtils=[...defaultShapeUtils,CadPathShapeUtil,CadEllipseShapeUtil,CadArcShapeUtil,CadDimensionShapeUtil,CadBezierShapeUtil];

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
