import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {prepareCadImport} from '../../src/lib/components/canvas/cad-import';
import {DEFAULT_CAD_SETTINGS as settings} from '../../src/lib/components/canvas/cad-settings';
const dxf=(body:string,blocks='')=>`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
describe('2D DXF exporter compatibility',()=>{
 it('accepts a legacy 3D-tagged polyline whose vertices are all in the XY plane',()=>{
  const plan=prepareCadImport(fixture().editor,settings,dxf('0\nPOLYLINE\n70\n8\n0\nVERTEX\n70\n32\n10\n0\n20\n0\n30\n0\n0\nVERTEX\n70\n32\n10\n100\n20\n20\n30\n0\n0\nSEQEND\n'),{keepCoordinates:true});
  assert.equal(plan.omitted.length,0);assert.equal(plan.shapes?.length,1);
  assert.equal(plan.widthMm,100);assert.equal(plan.heightMm,20);
 });
 it('transforms line geometry inside independently scaled blocks without dropping it',()=>{
  const plan=prepareCadImport(fixture().editor,settings,dxf('0\nINSERT\n2\nPART\n41\n2\n42\n3\n','0\nBLOCK\n2\nPART\n0\nLINE\n10\n0\n20\n0\n11\n100\n21\n20\n0\nENDBLK\n'),{keepCoordinates:true});
  assert.equal(plan.omitted.length,0);assert.equal(plan.widthMm,200);assert.equal(plan.heightMm,60);
 });
 it('continues to report out-of-plane polyline geometry instead of flattening it',()=>{
  const plan=prepareCadImport(fixture().editor,settings,dxf('0\nPOLYLINE\n70\n8\n0\nVERTEX\n70\n32\n10\n0\n20\n0\n30\n0\n0\nVERTEX\n70\n32\n10\n100\n20\n20\n30\n8\n0\nSEQEND\n'),{keepCoordinates:true});
  assert.equal(plan.omitted.length,1);assert.equal(plan.shapes?.length,0);
 });
 it('keeps circular geometry elliptical under a nonuniform block transform',()=>{
  const plan=prepareCadImport(fixture().editor,settings,dxf('0\nINSERT\n2\nPART\n41\n2\n42\n1\n','0\nBLOCK\n2\nPART\n0\nCIRCLE\n10\n0\n20\n0\n40\n50\n0\nENDBLK\n'),{keepCoordinates:true});
  // Each opposing extremum uses the importer's 0.002 mm approximation budget.
  assert.equal(plan.omitted.length,0);assert.ok(Math.abs(plan.widthMm-200)<0.004);
  assert.ok(Math.abs(plan.heightMm-100)<0.004);assert.equal(plan.shapes?.[0].type,'cad-bezier');
  assert.deepEqual(plan.warnings,['import-curves-approximated']);
 });
});
