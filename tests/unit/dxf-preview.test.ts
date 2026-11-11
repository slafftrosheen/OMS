import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadDxfPreview,DXF_PREVIEW_MAX_BYTES,isDxfFile} from '../../src/lib/order/dxf-preview';
import {filePocket,frameFilePocket} from '../../src/lib/order/file-pockets';
describe('DXF attachment previews',()=>{
 it('renders the reference geometry without needing an editable canvas',async()=>{
  const preview=await loadDxfPreview(new File([readFileSync('tests/fixtures/cad/production-reference.dxf')],'part.dxf'),new AbortController().signal);
  assert.equal(preview.paths.length,7);assert.equal(preview.width,1220);assert.equal(preview.height,600);
  assert.equal(preview.unit,'mm');assert.deepEqual(preview.omitted,[]);
  assert.ok(preview.paths.every(path=>path.startsWith('M')&&!path.includes('NaN')));
 });
 it('rejects oversized and aborted reads before starting DXF parsing',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadDxfPreview(new File(['invalid'],'part.dxf'),controller.signal),{name:'AbortError'});
  await assert.rejects(loadDxfPreview(new File([new Uint8Array(DXF_PREVIEW_MAX_BYTES+1)],'part.dxf'),new AbortController().signal),/limit/);
 });
 it('reports a malformed source rather than showing an earlier preview',async()=>{
  await assert.rejects(loadDxfPreview(new File(['not a DXF'],'part.dxf'),new AbortController().signal),/format/);
 });
 it('recognizes exporter MIME aliases and blank browser MIME values',()=>{
  assert.equal(isDxfFile('PART.DXF',''),true);assert.equal(isDxfFile('part','image/x-dxf'),true);
  assert.equal(isDxfFile('part.pdf','application/pdf'),false);
 });
});
describe('production file pocket compatibility',()=>{
 it('keeps older order frames usable without rewriting their saved records',()=>{
  assert.equal(frameFilePocket({type:'frame',props:{name:'Laser (DXF)'}}),'laser');
  assert.equal(frameFilePocket({type:'frame',props:{name:'CNC Routing'}}),'cnc');
  assert.equal(frameFilePocket({type:'frame',props:{name:'Bender'}}),'bender');
  assert.equal(frameFilePocket({type:'frame',props:{name:'Visuals (PDF/Rasters)'}}),'visuals');
  assert.equal(frameFilePocket({type:'frame',props:{name:'Unrelated frame'}}),null);
 });
 it('preserves explicit pocket metadata after a frame is renamed',()=>{
  assert.equal(frameFilePocket({type:'frame',props:{name:'New laser name'},meta:{omsFilePocket:'laser'}}),'laser');
  assert.equal(frameFilePocket({type:'document',meta:{omsFilePocket:'laser'}}),null);
 });
 it('keeps general historical attachments visible and recognizes station aliases',()=>{
  assert.equal(filePocket('sketch'),'visuals');assert.equal(filePocket('canvas-asset'),'visuals');
  assert.equal(filePocket('CNC_FREZER'),'cnc');assert.equal(filePocket('LASER_CUTTING'),'laser');
 });
});
