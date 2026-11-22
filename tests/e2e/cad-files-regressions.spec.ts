import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const dxf=readFileSync('tests/fixtures/cad/production-reference.dxf');
const fileId='22222222-2222-4222-8222-222222222222';
test('locates a shared DXF section and previews the exported shared layer',async({page})=>{
 await page.setViewportSize({width:1440,height:950});
 await page.goto('/drawing-workspace.html?mode=idea');
 await page.getByTestId('drawing-cad-toggle').click();
 await page.getByTestId('drawing-cad-apply').click();
 const task=page.getByTestId('drawing-cad-task');
 await task.selectOption('files');
 const intake=page.getByTestId('drawing-cad-import');
 await intake.locator('summary').click();
 const rectangle=(x:number,y:number,w:number,h:number)=>[0,'LWPOLYLINE',90,4,70,1,10,x,20,y,10,x+w,20,y,10,x+w,20,y+h,10,x,20,y+h];
 const source=[0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'ENTITIES',
  ...rectangle(0,0,100,50),...rectangle(100,10,40,20),0,'ENDSEC',0,'EOF',''].join('\n');
 await intake.getByLabel('DXF file',{exact:true}).setInputFiles({name:'adjacent-parts.dxf',mimeType:'application/dxf',buffer:Buffer.from(source)});
 await intake.getByRole('button',{name:'Prepare preview',exact:true}).click();
 await intake.getByTestId('drawing-cad-apply-plan').click();
 await task.selectOption('preflight');
 const preflight=page.getByTestId('drawing-preflight');
 await preflight.getByRole('button',{name:'Check drawing',exact:true}).click();
 const finding=preflight.getByRole('listitem').filter({hasText:'Shared straight cut'});
 await expect(finding).toHaveCount(1);
 await finding.getByRole('button',{name:'Locate',exact:true}).click();
 const marker=page.getByTestId('drawing-preflight-highlight');
 await expect(marker.locator('circle')).toHaveCount(2);
 const length=await marker.locator('circle').evaluateAll(nodes=>{
  const [a,b]=nodes;
  return Math.hypot(Number(b.getAttribute('cx'))-Number(a.getAttribute('cx')),Number(b.getAttribute('cy'))-Number(a.getAttribute('cy')));
 });
 expect(length*25.4/96).toBeCloseTo(20,7);
 expect(await page.evaluate(()=>(window as any).__drawingFixture.inspect().selected.length)).toBe(2);
 await preflight.getByTestId('drawing-preflight-open-dxf').click();
 await expect(marker).toHaveCount(0);
 const common=page.getByRole('checkbox',{name:'Cut shared edges once',exact:true});
 await common.check();
 await page.getByTestId('drawing-cad-review').click();
 const report=page.getByTestId('drawing-cad-report');
 await expect(report.getByText('400 mm',{exact:true})).toBeVisible();
 const preview=page.getByTestId('drawing-dxf-preview');
 await expect(preview.locator('[data-dxf-layer="OMS_SHARED"]')).toBeAttached();
 await preview.getByRole('combobox',{name:'Preview layer',exact:true}).selectOption('OMS_SHARED');
 await expect(preview.locator('[data-dxf-layer]')).toHaveCount(1);
 await expect(preview.getByText('20 mm',{exact:true})).toBeVisible();
 await common.uncheck();
 await expect(preview).toHaveCount(0);
 await expect(report.getByText('400 mm',{exact:true})).toHaveCount(0);
 await page.getByTestId('drawing-cad-review').click();
 await expect(report.getByText('420 mm',{exact:true})).toBeVisible();
 await expect(preview.locator('[data-dxf-layer="OMS_CLOSED"]')).toBeAttached();
 await expect(preview.locator('[data-dxf-layer="OMS_SHARED"]')).toHaveCount(0);
});
test('carries the reviewed Production check scope into DXF after clearing the selection',async({page})=>{
 await page.setViewportSize({width:1440,height:950});
 await page.goto('/drawing-workspace.html?mode=idea');
 await page.getByTestId('drawing-cad-toggle').click();
 await page.getByTestId('drawing-cad-apply').click();
 await page.evaluate(()=>(window as any).__drawingFixture.emptyArea());
 const panel=page.getByTestId('drawing-cad-panel'),task=panel.getByTestId('drawing-cad-task');
 await task.selectOption('draw');
 await panel.locator('summary').filter({hasText:/^Exact geometry$/}).click();
 const geometry=panel.locator('form').filter({has:page.getByTestId('drawing-cad-create')});
 await geometry.getByLabel('Width (mm)',{exact:true}).fill('100');
 await geometry.getByLabel('Height (mm)',{exact:true}).fill('60');
 await panel.getByTestId('drawing-cad-create').click();
 const selected=()=>page.evaluate(()=>(window as any).__drawingFixture.inspect().selected.length);
 await expect.poll(selected).toBe(1);
 await task.selectOption('preflight');
 const check=panel.getByTestId('drawing-preflight');
 await check.getByRole('button',{name:'Check drawing',exact:true}).click();
 await page.locator('.drawing-viewport').click({position:{x:18,y:18}});
 await expect.poll(selected).toBe(0);
 await check.getByTestId('drawing-preflight-open-dxf').click();
 await expect(task).toHaveValue('files');
 await expect(panel.getByRole('combobox',{name:'Export scope',exact:true})).toHaveValue('preflight');
 await panel.getByTestId('drawing-cad-review').click();
 await expect(panel.getByTestId('drawing-cad-report')).toContainText('100 × 60');
 await expect(panel.getByTestId('drawing-cad-download')).toBeEnabled();
 await expect.poll(selected).toBe(0);

 await task.selectOption('document');
 await panel.getByLabel('Drawing scale 1 :',{exact:true}).fill('2');
 await panel.getByTestId('drawing-cad-apply').click();
 await task.selectOption('files');
 await expect(panel.getByTestId('drawing-cad-review')).toBeDisabled();
 await expect(panel.getByTestId('drawing-cad-download')).toBeDisabled();
});
for (const mode of ['idea', 'order']) {
  test(`${mode} DXF layer mapping, color export and layer removal work together`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto(`/drawing-workspace.html?mode=${mode}`);
    await page.getByTestId('drawing-cad-toggle').click();
    await page.getByTestId('drawing-cad-apply').click();
    const panel = page.getByTestId('drawing-cad-panel');
    await panel.getByTestId('drawing-cad-task').selectOption('files');
    const intake = panel.getByTestId('drawing-cad-import');
    await intake.locator('summary').click();

    const line = (layer: string, y: number, rgb = 0x112233) => [0, 'LINE', 8, layer, 420, rgb, 10, 0, 20, y, 11, 100, 21, y];
    const source = [
      0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES',
      ...line('OMS_JOB_CUT', 0, 0xb01020), ...line('Score guides', 10), ...line('Etching', 15), ...line('0', 20), 0, 'ENDSEC', 0, 'EOF', '',
    ].join('\n');
    const inspect = () => page.evaluate(() => (window as any).__drawingFixture.inspect());
    const before = await inspect();
    await intake.getByLabel('DXF file', { exact: true }).setInputFiles({
      name: 'production-layers.dxf', mimeType: 'application/dxf', buffer: Buffer.from(source),
    });
    const preview = intake.getByRole('button', { name: 'Prepare preview', exact: true });
    const apply = intake.getByTestId('drawing-cad-apply-plan');
    await preview.click();
    await expect(apply).toBeEnabled();
    await intake.getByRole('checkbox', { name: 'Preserve DXF layers', exact: true }).check();
    await intake.getByRole('checkbox', { name: 'Keep imported objects together', exact: true }).check();
    await expect(apply).toBeDisabled();
    await preview.click();
    await expect(intake.getByText('Score guides · New layer', { exact: true })).toBeVisible();
    await expect(intake.getByText('Unassigned (DXF layer 0) (1)', { exact: true })).toBeVisible();
    await intake.getByRole('combobox', { name: 'Destination layer · Etching', exact: true }).selectOption('layer:engrave');
    await apply.click();

    const imported = await inspect();
    const layer = imported.page.meta.omsProductionLayers.find((item: any) => item.name === 'Score guides');
    const group = imported.shapes.find((shape: any) => shape.id === imported.selected[0]);
    expect(group.type).toBe('group');
    expect(imported.shapes.filter((shape: any) => shape.parentId === group.id)

      .map((shape: any) => shape.meta.omsProductionLayer ?? '').sort()).toEqual(['', 'cut', 'engrave', layer.id].sort());
    await panel.getByRole('combobox', { name: 'Cutting layers', exact: true }).selectOption('production');
    await panel.getByRole('checkbox', { name: 'Preserve object colors (R2004)', exact: true }).check();
    await panel.getByTestId('drawing-cad-review').click();
    const exportPreview = panel.getByTestId('drawing-dxf-preview');
    await expect(exportPreview.locator('[data-dxf-layer="OMS_JOB_CUT"] [stroke="#B01020"]')).toBeAttached();
    await expect(exportPreview.locator('[data-dxf-layer="OMS_JOB_ENGRAVE"]')).toBeAttached();
    await expect(exportPreview.locator('[data-dxf-layer="OMS_JOB_SCORE_GUIDES"]')).toBeAttached();
    const report = panel.getByTestId('drawing-cad-report');
    await report.getByText('Why objects were excluded', { exact: true }).click();
    await expect(report.getByText('Unassigned objects', { exact: true })).toBeVisible();

    await page.getByTestId('drawing-objects-toggle').click();
    const layers = page.getByTestId('drawing-production-layers');
    await layers.getByText('Production layers', { exact: true }).click();
    await layers.getByRole('combobox', { name: 'Layer settings', exact: true }).selectOption(layer.id);
    await layers.getByRole('button', { name: 'Remove layer', exact: true }).click();
    const remove = layers.getByRole('button', { name: 'Confirm removal', exact: true });
    await expect(remove).toBeDisabled();
    await layers.getByRole('combobox', { name: 'Move objects to', exact: true }).selectOption('layer:bend');
    await remove.click();
    await expect(layers.getByRole('combobox', { name: 'Layer settings', exact: true })).toHaveValue('bend');
    const moved = await inspect();
    expect(moved.page.meta.omsProductionLayers.some((item: any) => item.id === layer.id)).toBe(false);
    expect(moved.shapes.filter((shape: any) => shape.parentId === group.id).some((shape: any) => shape.meta.omsProductionLayer === 'bend')).toBe(true);

    await page.getByTestId('drawing-undo').click();
    expect((await inspect()).page.meta.omsProductionLayers).toEqual(imported.page.meta.omsProductionLayers);
    await page.getByTestId('drawing-undo').click();
    const undone = await inspect();
    expect(undone.shapes.length).toBe(before.shapes.length);
    expect(undone.page.meta.omsProductionLayers).toEqual(before.page.meta.omsProductionLayers);
  });
}
test('new draft previews a DXF with geometry and retains its source file',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:[]}));
 await page.goto('/production-intake.html?new');
 await page.locator('#file-upload').setInputFiles({name:'laser-part.dxf',mimeType:'application/dxf',buffer:dxf});
 await expect(page.getByTestId('dxf-preview-svg')).toBeVisible({timeout:20000});
 await expect(page.getByTestId('dxf-preview-svg').locator('path')).toHaveCount(7);
 await expect(page.locator('.file-list-name')).toHaveText('laser-part.dxf');
 expect(errors).toEqual([]);
});
test('production pocket lists permitted files and downloads through the authenticated endpoint',async({page})=>{
 await page.route('**/api/files?**',r=>r.fulfill({headers:{'X-Total-Count':'1'},json:[{id:fileId,originalName:'laser-part.dxf',mimeType:'application/dxf',file_type:'laser'}]}));
 await page.route(`**/api/files/${fileId}/download*`,r=>r.fulfill({body:dxf,contentType:'application/dxf',headers:{'Content-Disposition':'attachment; filename="laser-part.dxf"'}}));
 await page.goto('/drawing-workspace.html?mode=order&persisted');
 const pocket=page.getByTestId('production-pocket-laser');
 await expect(pocket.getByRole('link',{name:/laser-part.dxf/})).toBeAttached({timeout:20000});
 await expect(pocket.getByRole('link',{name:/laser-part.dxf/})).toHaveAttribute('href',`/api/files/${fileId}/download`);
 await page.getByRole('button',{name:'Toggle read only'}).click();
 await expect(pocket.getByRole('link',{name:/laser-part.dxf/})).toBeAttached();
 const downloading=page.waitForEvent('download');
 await pocket.getByRole('link',{name:/laser-part.dxf/}).click();
 expect((await downloading).suggestedFilename()).toBe('laser-part.dxf');
 await page.route('**/api/files?**',r=>r.fulfill({status:403,json:{message:'Forbidden'}}));
 await page.reload();
 await expect(page.getByTestId('production-pocket-laser').getByRole('alert')).toBeAttached();
 await expect(page.getByRole('link',{name:/laser-part.dxf/})).toHaveCount(0);
});
test('native Bézier pointer gestures survive validation and snapshot reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/drawing-workspace.html?mode=idea');
 await page.getByTestId('drawing-cad-toggle').click();
 await page.getByTestId('drawing-cad-apply').click();
 await page.getByTestId('drawing-tools-curves').click();
 await page.getByTestId('drawing-flyout-cad-bezier').click();
 const area=await page.locator('.drawing-viewport').boundingBox();if(!area)throw Error('Canvas missing');
 await page.mouse.click(area.x+100,area.y+120);
 await page.mouse.move(area.x+230,area.y+180);await page.mouse.down();
 await page.mouse.move(area.x+260,area.y+140,{steps:5});await page.mouse.up();
 await page.keyboard.press('Enter');
 const curves=()=>page.evaluate(()=>(window as any).__drawingFixture.inspect().shapes.filter((s:any)=>s.type==='cad-bezier'));
 await expect.poll(async()=>(await curves()).length).toBe(1);
 const curve=(await curves())[0];expect(curve.props.contours[0].nodes).toHaveLength(2);
 for(const node of curve.props.contours[0].nodes)expect(node).not.toHaveProperty('z');
 await page.getByTestId('drawing-undo').click();await expect.poll(async()=>(await curves()).length).toBe(0);
 await page.getByTestId('drawing-redo').click();await expect.poll(async()=>(await curves()).length).toBe(1);
 await page.evaluate(()=>(window as any).__drawingFixture.roundTrip());
 expect((await curves())[0].props.contours).toEqual(curve.props.contours);expect(errors).toEqual([]);
});
test('new draft keeps the selected pocket and canonical download reference after saving',async({page})=>{
 const {default:appConfig}=await import(new URL('../../svelte.config.js',import.meta.url).href);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const orderId='11111111-1111-4111-8111-111111111111';let uploadPocket='',saved:any=null;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET')return route.fulfill({json:[]});
  if(path==='/api/draft-orders')return route.fulfill({status:201,json:{order:{id:orderId,updated_at:'2026-11-11T12:00:00Z'}}});
  if(path==='/api/files/upload'){
   const body=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'content-type':request.headers()['content-type']}}).formData();
   uploadPocket=String(body.get('file_type'));return route.fulfill({status:201,json:{file:{id:fileId}}});
  }
  if(path.endsWith('/canvas-state')){saved=request.postDataJSON();return route.fulfill({json:{updatedAt:'2026-11-11T12:00:01Z'}});}
  return route.fulfill({status:405,json:{message:'Unexpected test write'}});
 });
 // Match the production policy: local canvas cards fetch their Blob source.
 await page.route('**/production-intake.html?new',async route=>{
  const response=await route.fetch();
  const connect=appConfig.kit?.csp?.directives?.['connect-src']??[];
  return route.fulfill({response,headers:{...response.headers(),'content-security-policy':`connect-src ${connect.join(' ')}`}});
 });
 await page.goto('/production-intake.html?new');
 await page.locator('#clientName').fill('TEST ONLY CAD pocket');await page.locator('#deadline').fill('2099-11-25');
 await page.locator('#file-upload').setInputFiles({name:'router-part.dxf',mimeType:'application/dxf',buffer:dxf});
 await page.getByRole('button',{name:'Drawing',exact:true}).click();
 await expect(page.getByTestId('production-pocket-visuals').getByRole('link',{name:/router-part.dxf/})).toBeAttached({timeout:20000});
 await expect(page.locator('.drawing-viewport').getByTestId('dxf-preview-svg')).toBeAttached();
 await page.getByRole('button',{name:'Form',exact:true}).click();
 await page.getByRole('combobox',{name:'Production file pocket: router-part.dxf'}).selectOption('cnc');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect.poll(()=>saved!==null).toBe(true);
 expect(uploadPocket).toBe('cnc');
 const store=saved.snapshot.document?.store??saved.snapshot.store;
 const documents=Object.values(store).filter((record:any)=>record.type==='document') as any[];
 expect(documents).toHaveLength(1);expect(documents[0].props.fileId).toBe(fileId);
 expect(documents[0].props.url).toBe(`/api/files/${fileId}/download`);
 expect(documents[0].meta.omsFilePocket).toBe('cnc');
 expect(store[documents[0].parentId].meta.omsFilePocket).toBe('cnc');expect(errors).toEqual([]);
});
test('initially readonly orders without a saved canvas still list permitted files',async({page})=>{
 await page.route('**/api/files?**',r=>r.fulfill({headers:{'X-Total-Count':'1'},json:[{id:fileId,originalName:'reader-part.dxf',mimeType:'application/dxf',file_type:'bender'}]}));
 await page.goto('/drawing-workspace.html?mode=order&readonly&persisted');
 const pocket=page.getByTestId('production-pocket-bender');
 await expect(pocket.getByRole('link',{name:/reader-part.dxf/})).toBeVisible({timeout:15000});
 await expect(pocket.getByRole('button',{name:'Add files'})).toBeDisabled();
});

test('saves the reviewed DXF to CNC with provenance and reuses the review after retry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const uploads: Array<{ review: any; body: Buffer }> = [];
  let attachment: Record<string, unknown> | null = null;
  await page.route('**/api/files?*', async route => {
    await route.fulfill({ json: attachment ? [attachment] : [], headers: { 'X-Total-Count': attachment ? '1' : '0' } });
  });
  await page.route('**/api/files/upload', async route => {
    const body = route.request().postDataBuffer()!;
    const contentType = route.request().headers()['content-type'];
    const parsed = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
    const review = JSON.parse(String(parsed.get('canvas_dxf_release')));
    uploads.push({ review, body });
    expect(parsed.get('file_type')).toBe('cnc');
    if (uploads.length === 1) {
      await route.fulfill({ status: 503, json: { message: 'Try again' } });
      return;
    }
    attachment = { id: fileId, originalName: 'Panel.dxf', mimeType: 'application/dxf', file_type: 'cnc', canvasDxfRelease: review };
    await route.fulfill({ status: 201, json: { success: true, file: attachment } });
  });
  await page.goto('/drawing-workspace.html?mode=order&persisted');
  await page.getByTestId('drawing-files').click();
  const enable = page.getByRole('button', { name: 'Enable CAD in mm at 1:1', exact: true });
  if (await enable.isVisible()) await enable.click();
  const intake = page.getByTestId('drawing-cad-import');
  await intake.locator('summary').click();
  await intake.getByLabel('DXF file', { exact: true }).setInputFiles({
    name: 'Panel-source.dxf', mimeType: 'application/dxf', buffer: dxf,
  });
  await intake.getByRole('button', { name: 'Prepare preview', exact: true }).click();
  await intake.getByTestId('drawing-cad-apply-plan').click();
  await page.getByTestId('drawing-cad-review').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('drawing-cad-download').click();
  const exported = readFileSync((await (await download).path())!);

  const save = page.getByTestId('production-export');
  await save.getByRole('textbox').fill('Panel');
  const release = save.getByRole('button', { name: /Save into CNC/ });
  await release.click();
  await expect.poll(() => uploads.length).toBe(1);
  await expect(release).toBeEnabled();
  await release.click();
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads[0].review).toEqual(uploads[1].review);
  expect(uploads[1].review).toMatchObject({ scope: 'selected', curves: 'spline', toleranceMm: null, omitted: 0 });
  expect(uploads[1].review.revision).toMatch(/^[0-9a-f]{64}$/);
  expect(uploads[1].body.includes(exported)).toBe(true);

  const pocket = page.getByTestId('production-pocket-cnc');
  await expect(pocket.getByRole('link', { name: 'Download Panel.dxf' })).toHaveAttribute('href', `/api/files/${fileId}/download`);
  await pocket.getByText('Reviewed DXF', { exact: true }).click();
  await expect(pocket.getByText(uploads[1].review.revision.slice(0, 12), { exact: true })).toBeVisible();
});
