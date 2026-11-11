import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const dxf=readFileSync('tests/fixtures/cad/production-reference.dxf');
const fileId='22222222-2222-4222-8222-222222222222';
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
 await page.goto('/drawing-workspace.html?mode=order');
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
 await page.getByTestId('drawing-tool-cad-bezier').click();
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
 await page.goto('/drawing-workspace.html?mode=order&readonly');
 const pocket=page.getByTestId('production-pocket-bender');
 await expect(pocket.getByRole('link',{name:/reader-part.dxf/})).toBeVisible({timeout:15000});
 await expect(pocket.getByRole('button',{name:'Add files'})).toBeDisabled();
});
