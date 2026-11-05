import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {orderSheetBaseOrder,orderSheetIds,orderSheetSnapshot,orderSheetUsers} from '../ui/order-sheet-fixtures';
const pngFile={name:'Artwork.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=','base64')};
function drawingPdf(width:number,height:number){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents 4 0 R >>`,
  '<< /Length 0 >>\nstream\n\nendstream'];
 let text='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`;});
 const xref=Buffer.byteLength(text);
 text+=`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(text);
}
const ru=JSON.parse(readFileSync('src/locales/ru.json','utf8'));
const id='22222222-2222-4222-8222-222222222222';
const material={id:'33333333-3333-4333-8333-333333333333',code:'REAL_PLEXI',category:'ACRYLIC_XT',name_en:'Blue acrylic',metadata:{model:'5N870'}};
const fact=(target:string,value:string,extra={})=>({target,value,evidence:value,page:1,part:null,
 confidence:'medium',status:'ready',reason:'source-value',material:null,...extra});
async function setup(page:Page,production:any[],url='/production-intake.html'){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/files?**',route=>route.fulfill({headers:{'X-Total-Count':'1'},json:[{id,originalName:'Drawing.pdf',mimeType:'application/pdf'}]}));
 await page.route('**/api/ai/order-intake',route=>route.request().method()==='GET'?route.fulfill({json:{nativePdf:true,paidOcr:false}}):route.fulfill({json:{proposals:[],profileSuggestions:[],missing:['Confirm unspecified PSU model'],
  production,fileId:id,fileName:'Drawing.pdf',profileIndex:0,profileId:'p1',model:'fixture/model',
  orderUpdatedAt:'2026-11-05T12:00:00Z',evidenceVerified:[],engine:'native',provenance:'model-reported'}}));
 await page.route('**/api/draft-orders/*',route=>route.fulfill({json:{updatedAt:'2026-11-05T12:00:00Z',status:'DRAFT',profiles:[{dbId:'p1'}]}}));
 await page.route('**/api/materials?**',route=>route.fulfill({json:[{...material,stock:0}]}));
 await page.goto(url);
 return errors;
}
async function analyze(page:Page){
 await page.getByRole('button',{name:'Analyze order source',exact:true}).click();
 await expect(page.getByText('Production choices',{exact:true})).toBeVisible();
}
test('uploads a PDF from attachment analysis and analyzes its private linked ID only after staff requests it',async({page})=>{
 let uploaded=false,analysisRequests=0,uploadBody='';
 const uploadedId='99999999-9999-4999-8999-999999999999';
 await setup(page,[fact('depth','60 mm')]);
 await page.route('**/api/files?**',r=>r.fulfill({headers:{'X-Total-Count':uploaded?'1':'0'},json:uploaded
  ?[{id:uploadedId,originalName:'New drawing.pdf',mimeType:'application/pdf'}]:[]}));
 await page.route('**/api/files',r=>{
  uploadBody=r.request().postDataBuffer()?.toString()??'';uploaded=true;
  return r.fulfill({status:201,json:{id:uploadedId,originalName:'New drawing.pdf',mimeType:'application/pdf'}});
 });
 await page.route('**/api/ai/order-intake',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{nativePdf:true,paidOcr:false}});
  analysisRequests++;
  expect(r.request().postDataJSON()).toMatchObject({orderId:'11111111-1111-4111-8111-111111111111',fileId:uploadedId,ocr:false,nativePdf:false});
  expect(r.request().postData()).not.toContain('data:application/pdf');
  return r.fulfill({json:{proposals:[],profileSuggestions:[],missing:[],production:[fact('depth','60 mm')],
   fileId:uploadedId,fileName:'New drawing.pdf',profileIndex:0,profileId:'p1',model:'existing/configured-model',
   orderUpdatedAt:'2026-11-05T12:00:00Z',evidenceVerified:[],engine:'cloudflare-ai'}});
 });
 await page.reload();
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Upload PDF or image',exact:true}).click();
 await (await chooser).setFiles({name:'New drawing.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nCustomer drawing')});
 await expect(page.getByRole('combobox',{name:'Source file',exact:true})).toHaveValue(uploadedId);
 expect(uploadBody).toContain('name="order_id"');
 expect(uploadBody).toContain('11111111-1111-4111-8111-111111111111');
 expect(uploadBody).toContain('filename="New drawing.pdf"');
 expect(analysisRequests).toBe(0);
 await analyze(page);
 await expect(page.getByRole('checkbox',{name:'Depth',exact:true})).not.toBeChecked();
 await expect(page.getByTestId('applied')).toHaveText('0');
 expect(analysisRequests).toBe(1);
});
test('failed uploads retain the selected source, show recovery and allow selecting the same PDF again',async({page})=>{
 await setup(page,[]);
 let attempts=0;
 await page.route('**/api/files',r=>{attempts++;return r.fulfill({status:503,json:{message:'Private file storage unavailable'}});});
 const file={name:'Retry.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nRetry')};
 for(let attempt=0;attempt<2;attempt++){
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Upload PDF or image',exact:true}).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole('alert')).toHaveText('Private file storage unavailable');
  await expect(page.getByRole('combobox',{name:'Source file',exact:true})).toHaveValue(id);
 }
 expect(attempts).toBe(2);
 await expect(page.getByTestId('applied')).toHaveText('0');
});
test('attachment upload is unavailable on a read-only order',async({page})=>{
 await setup(page,[]);
 await page.getByRole('button',{name:'Toggle read only'}).click();
 await expect(page.getByRole('button',{name:'Upload PDF or image',exact:true})).toBeDisabled();
});
test('uploading another source clears the old review and blocks analysis until the upload completes',async({page})=>{
 await setup(page,[fact('depth','60 mm')]);
 await analyze(page);
 await page.getByRole('checkbox',{name:'Depth',exact:true}).check();
 await page.getByRole('checkbox',{name:/I approve replacing/}).check();
 let release=()=>{};const gate=new Promise<void>(r=>release=r);let uploaded=false;
 const nextId='99999999-9999-4999-8999-999999999999';
 await page.route('**/api/files?**',r=>r.fulfill({headers:{'X-Total-Count':uploaded?'2':'1'},json:[
  {id,originalName:'Drawing.pdf',mimeType:'application/pdf'},
  ...(uploaded?[{id:nextId,originalName:'Next.pdf',mimeType:'application/pdf'}]:[])]}));
 await page.route('**/api/files',async r=>{await gate;uploaded=true;await r.fulfill({status:201,json:{id:nextId}});});
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Upload PDF or image',exact:true}).click();
 await (await chooser).setFiles({name:'Next.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nNext drawing')});
 await expect(page.getByRole('button',{name:'Analyze order source',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Apply selected fields to form',exact:true})).toBeDisabled();
 release();
 await expect(page.getByRole('combobox',{name:'Source file',exact:true})).toHaveValue(nextId);
 await expect(page.getByRole('heading',{name:'Review extracted choices'})).toHaveCount(0);
 await expect(page.getByTestId('applied')).toHaveText('0');
});
async function setupOrderEntry(page:Page,mode:'new'|'editor'|'detail',status='DRAFT',language='en'){
 const writes:Array<{path:string;body:string|null}>=[],navigation:string[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.text().startsWith('[Mock navigation] goto: '))navigation.push(m.text().slice('[Mock navigation] goto: '.length));});
 await page.route('**/api/**',r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){
   writes.push({path,body:req.postData()});
   if(path==='/api/draft-orders')return r.fulfill({status:201,json:{order:{id:orderSheetIds.first,updated_at:'2026-10-31T10:00:00Z'}}});
   if(path==='/api/files/upload')return r.fulfill({status:201,json:{id}});
   return r.fulfill({status:405,json:{message:'Unexpected write'}});
  }
  if(path==='/api/auth')return r.fulfill({json:{user:orderSheetUsers.manager}});
  if(path===`/api/draft-orders/${orderSheetIds.first}`)return r.fulfill({json:orderSheetSnapshot(orderSheetIds.first,status)});
  if(path===`/api/orders/${orderSheetIds.first}`)return r.fulfill({json:orderSheetBaseOrder(orderSheetSnapshot(orderSheetIds.first,status))});
  if(path.endsWith('/canvas-state'))return r.fulfill({json:{snapshot:null}});
  if(path==='/api/files')return r.fulfill({headers:{'X-Total-Count':'0'},json:[]});
  if(path==='/api/order/profile-choices')return r.fulfill({json:{templates:[],truncated:false}});
  if(path==='/api/ai/order-intake')return r.fulfill({json:{nativePdf:false,paidOcr:false}});
  return r.fulfill({json:[]});
 });
 await page.goto(`/production-intake.html?mode=${mode}&lang=${language}`);
 return {writes,navigation,errors};
}
test('the saved-order toolbar opens attachment analysis with a real upload control',async({page})=>{
 const observed=await setupOrderEntry(page,'editor');
 await page.getByRole('button',{name:'Upload & analyze PDF',exact:true}).click();
 await expect(page.getByRole('button',{name:'Upload PDF or image',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Analyze order source',exact:true})).toBeVisible();
 expect(observed.writes).toEqual([]);expect(observed.errors).toEqual([]);
});
test('the order detail page offers a direct PDF upload and analysis entry',async({page})=>{
 const observed=await setupOrderEntry(page,'detail');
 await page.getByRole('button',{name:'Upload & analyze PDF',exact:true}).click();
 expect(observed.navigation).toContain(`/orders/${orderSheetIds.first}/edit?section=intake`);
 expect(observed.writes).toEqual([]);expect(observed.errors).toEqual([]);
});
test('new orders save and link an uploaded source before opening analysis without submitting for review',async({page})=>{
 const observed=await setupOrderEntry(page,'new');
 await page.locator('#clientName').fill('Drawing customer');
 await page.locator('#deadline').fill('2099-11-25');
 await page.locator('#file-upload').setInputFiles({name:'Artwork.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=','base64')});
 await page.getByRole('button',{name:'Save & analyze PDF',exact:true}).click();
 await expect.poll(()=>observed.navigation).toContain(`/orders/${orderSheetIds.first}/edit?section=intake`);
 expect(observed.writes.map(w=>w.path)).toEqual(['/api/draft-orders','/api/files/upload']);
 expect(JSON.parse(observed.writes[0].body!)).toMatchObject({status:'DRAFT',clientName:'Drawing customer'});
 expect(observed.writes[1].body).toContain(orderSheetIds.first);
 expect(observed.errors).toEqual([]);
});
test('confirmed orders do not offer the PDF intake shortcut',async({page})=>{
 await setupOrderEntry(page,'editor','CONFIRMED');
 await expect(page.locator('.canvas-editor')).toBeVisible();
 await expect(page.getByRole('button',{name:'Upload & analyze PDF',exact:true})).toHaveCount(0);
});
test('the PDF entry and upload controls are reachable in Russian on a narrow dark screen',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});
 await setupOrderEntry(page,'editor','DRAFT','ru');
 await page.evaluate(()=>document.documentElement.dataset.theme='DarkVim');
 const entry=page.getByRole('button',{name:ru.orderIntake.openUpload,exact:true});
 await expect(entry).toBeVisible();await entry.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:ru.orderIntake.upload,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:testInfo.outputPath('pdf-upload-mobile-dark.png')});
});
test('order screens keep actions and content inside the viewport across themes and languages',async({page},testInfo)=>{
 test.setTimeout(120000);
 for(const view of [{width:1440,height:1000,theme:'LightVim',language:'en'},
  {width:390,height:844,theme:'DarkVim',language:'ru'}]){
  await page.setViewportSize({width:view.width,height:view.height});
  for(const mode of ['new','detail','editor'] as const){
   await page.unrouteAll({behavior:'wait'});
   const observed=await setupOrderEntry(page,mode,'DRAFT',view.language);
   const surface=page.locator(mode==='new'?'.page-container':mode==='editor'?'.canvas-editor':'.order-detail-container');
   await expect(surface).toBeVisible();
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,view.theme);
   await page.screenshot({path:testInfo.outputPath(`${mode}-${view.width}-${view.theme}.png`)});
   const geometry=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,
    overflowing:[...document.querySelectorAll<HTMLElement>('main,header,section,.header-actions,.stage-card')]
     .filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);})
     .map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width}))}));
   expect.soft(geometry.document,JSON.stringify({mode,view,geometry})).toBeLessThanOrEqual(view.width+1);
   expect(observed.errors).toEqual([]);
   if(mode==='detail'){
    await page.locator('.stage-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`stages-${view.width}-${view.theme}.png`)});
   }
  }
 }
});
test('new-order PDF preview renders the selected drawing even when PDF headers are identical',async({page})=>{
 await setupOrderEntry(page,'new');
 await page.locator('#file-upload').setInputFiles([
  {name:'First.pdf',mimeType:'application/pdf',buffer:drawingPdf(300,200)},
  {name:'Second.pdf',mimeType:'application/pdf',buffer:drawingPdf(500,350)}]);
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('width','300');
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('height','200');
 await expect(page.locator('.pdf-canvas')).toBeVisible();
 await page.locator('.file-list-item').filter({hasText:'Second.pdf'}).click();
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('width','500');
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('height','350');
});
test('switching PDFs while the worker loads only renders the latest selected source',async({page})=>{
 await setupOrderEntry(page,'new');
 let release=()=>{};const gate=new Promise<void>(r=>release=r);let workerRequested=false;
 await page.route('**/*pdf.worker*.mjs*',async r=>{workerRequested=true;await gate;await r.continue();});
 await page.locator('#file-upload').setInputFiles([
  {name:'First.pdf',mimeType:'application/pdf',buffer:drawingPdf(300,200)},
  {name:'Second.pdf',mimeType:'application/pdf',buffer:drawingPdf(500,350)}]);
 await expect.poll(()=>workerRequested).toBe(true);
 await page.locator('.file-list-item').filter({hasText:'Second.pdf'}).click();release();
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('width','500');
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('height','350');
 await page.locator('.file-list-item').filter({hasText:'Second.pdf'}).getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page.locator('.preview-filename')).toHaveText('First.pdf');
 await expect(page.locator('.pdf-canvas')).toHaveAttribute('width','300');
});
test('preset dialogs contain keyboard focus and saving a preset keeps order actions available',async({page})=>{
 const observed=await setupOrderEntry(page,'new');
 await page.route('**/api/order-profile-presets',r=>r.request().method()==='POST'?r.fulfill({status:201,json:{id:'preset'}}):r.fulfill({json:[]}));
 await page.locator('.profile-actions').getByRole('button',{name:'Save as Preset',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Save profile as preset',exact:true});
 await expect(dialog).toBeVisible();await expect(page.locator('#preset-name')).toBeFocused();
 await dialog.getByRole('button',{name:'Save preset',exact:true}).focus();await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.activeElement?.closest('dialog')?.matches(':modal'))).toBe(true);
 await dialog.getByRole('button',{name:'Save preset',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Submit for review',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Save & analyze PDF',exact:true})).toBeEnabled();
 expect(observed.writes).toEqual([]);
});
test('a failed preset lookup offers recovery instead of an empty-list message',async({page})=>{
 await setupOrderEntry(page,'new');let reads=0;
 await page.route('**/api/order-profile-presets',r=>++reads===1?r.fulfill({status:503,json:{}}):r.fulfill({json:[]}));
 await page.reload();
 const trigger=page.getByRole('button',{name:'Load Preset',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Load profile preset',exact:true});
 await expect(dialog.getByRole('alert')).toBeVisible();
 await dialog.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test('new-order upload is keyboard accessible and the review action describes submission',async({page})=>{
 await setupOrderEntry(page,'new');
 const upload=page.getByRole('button',{name:'Upload order files',exact:true});
 await upload.focus();const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Space');
 await (await chooser).setFiles(pngFile);
 await expect(page.locator('.file-list-item').filter({hasText:'Artwork.png'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Submit for review',exact:true})).toBeVisible();
});
test('Russian order controls and progress summaries retain their translated labels and counts',async({page})=>{
 await setupOrderEntry(page,'new','DRAFT','ru');
 await expect(page.getByRole('button',{name:'Добавить профиль',exact:true})).toBeVisible();
 await expect(page.locator('.profile-title h3')).toHaveText('Новый профиль');
 await expect(page.locator('.quantity-control label')).toHaveText('Количество:');
 await page.unrouteAll({behavior:'wait'});await setupOrderEntry(page,'detail','DRAFT','ru');
 await expect(page.locator('.stage-progress-context')).toContainText('0 из 1');
});
test('delivery replacement compares the current email as well as the saved email',async({page})=>{
 await setup(page,[]);await page.getByRole('button',{name:'Edit delivery email locally'}).click();
 await page.route('**/api/client-delivery-addresses?**',r=>r.fulfill({json:[savedAddress]}));
 await page.getByRole('button',{name:'Find saved client addresses'}).click();
 await page.getByLabel('Saved delivery address').selectOption(addressId);
 await expect(page.locator('.address-preview .comparison')).toContainText('current@example.test');
 await expect(page.locator('.address-preview .comparison')).toContainText('delivery@example.test');
});
test('production choices start unchecked; unresolved matches cannot apply; replacements need acknowledgment',async({page})=>{
 const errors=await setup(page,[fact('depth','60 mm'),fact('psuModel','REGULAR',{status:'unresolved',reason:'no-exact-match'})]);
 await analyze(page);
 const depth=page.getByRole('checkbox',{name:/Depth/});
 await expect(depth).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:/Power supply model/})).toBeDisabled();
 await depth.check();
 await page.getByRole('button',{name:'Apply selected fields to form',exact:true}).click();
 await expect(page.getByTestId('applied')).toHaveText('0');
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('checkbox',{name:/I approve replacing/}).check();
 await page.getByRole('button',{name:'Apply selected fields to form',exact:true}).click();
 await expect(page.getByTestId('applied')).toHaveText('1');
 expect(JSON.parse(await page.getByTestId('current').innerText()).profiles[0].configuration.BENDER.depth).toBe(60);
 expect(errors).toEqual([]);
});
test('rechecks the real catalog and fills the native material code locally',async({page})=>{
 await setup(page,[fact('faceMaterial','5N870',{material,reason:'exact-match'})]);
 await analyze(page);
 await page.getByRole('checkbox',{name:/Face material/}).check();
 await page.getByRole('button',{name:'Apply selected fields to form',exact:true}).click();
 await expect(page.getByTestId('applied')).toHaveText('1');
 const cnc=JSON.parse(await page.getByTestId('current').innerText()).profiles[0].configuration.CNC_FREZER;
 expect(cnc.face).toBe('REAL_PLEXI');expect(cnc.faceMaterials[0].materialId).toBe(material.id);
});
test('a local edit made during the asynchronous apply checks is preserved',async({page})=>{
 await setup(page,[fact('depth','60 mm')]);
 let release=()=>{};const gate=new Promise<void>(r=>{release=r;});let reading=false;
 await page.route('**/api/draft-orders/*',async route=>{reading=true;await gate;await route.fulfill({json:{updatedAt:'2026-11-05T12:00:00Z',status:'DRAFT',profiles:[{dbId:'p1'}]}});});
 await analyze(page);await page.getByRole('checkbox',{name:/Depth/}).check();
 await page.getByRole('checkbox',{name:/I approve replacing/}).check();
 await page.getByRole('button',{name:'Apply selected fields to form',exact:true}).click();
 await expect.poll(()=>reading).toBe(true);await page.getByRole('button',{name:'Edit locally'}).click();release();
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByTestId('applied')).toHaveText('0');
 expect(JSON.parse(await page.getByTestId('current').innerText()).notes).toBe('Explicit local edit');
});
test('saved address reuse is explicit and preserves entered values until replacement approval',async({page})=>{
 await setup(page,[]);
 await page.route('**/api/client-delivery-addresses?**',route=>route.fulfill({json:[{id:'44444444-4444-4444-8444-444444444444',address:'Saved address',contact:'Saved contact',phone:'123',email:null,last_used_at:'2026-11-05T12:00:00Z'}]}));
 await page.getByRole('button',{name:'Find saved client addresses'}).click();
 await page.getByLabel('Saved delivery address').selectOption('44444444-4444-4444-8444-444444444444');
 await expect(page.getByRole('button',{name:'Use this address'})).toBeDisabled();
 expect(JSON.parse(await page.getByTestId('current').innerText()).deliveryAddress).toBe('User address');
 await page.getByRole('checkbox',{name:/Replace the current delivery details/}).check();
 await page.getByRole('button',{name:'Use this address'}).click();
 expect(JSON.parse(await page.getByTestId('current').innerText()).deliveryAddress).toBe('Saved address');
});

async function chooseFaceProduct(page:Page){
 await page.getByRole('button',{name:'Choose from catalog',exact:true}).click();
 await page.getByRole('button',{name:/Face material · Select/}).click();
 await page.getByRole('searchbox',{name:/Search all materials/}).fill('Blue');
 await page.getByRole('button',{name:/Blue acrylic/}).click();
}
test('a deliberate catalog choice retains source uncertainty and still requires approval',async({page})=>{
 await setup(page,[fact('faceMaterial','Generic opal',{status:'unresolved',reason:'no-exact-match',confidence:'low'})]);
 await analyze(page);await chooseFaceProduct(page);
 await expect(page.getByText('Catalog product selected by staff; confirm its suitability.')).toBeVisible();
 const choice=page.getByRole('checkbox',{name:'Face material',exact:true});
 await expect(choice).toBeEnabled();await expect(choice).not.toBeChecked();
 await expect(page.getByRole('button',{name:'Apply selected fields to form'})).toBeDisabled();
 await choice.check();await page.getByRole('button',{name:'Apply selected fields to form'}).click();
 await expect(page.getByTestId('applied')).toHaveText('1');
 const current=JSON.parse(await page.getByTestId('current').innerText());
 expect(current.profiles[0].configuration.CNC_FREZER.face).toBe('REAL_PLEXI');
});
test('a manual product decision is rejected when the catalog changes before application',async({page})=>{
 await setup(page,[fact('faceMaterial','Generic opal',{status:'unresolved',reason:'no-exact-match'})]);
 await analyze(page);await chooseFaceProduct(page);
 await page.route('**/api/materials?intake=true',r=>r.fulfill({json:[{...material,thickness_options:[5]}]}));
 await page.getByRole('checkbox',{name:'Face material',exact:true}).check();
 await page.getByRole('button',{name:'Apply selected fields to form'}).click();
 await expect(page.getByRole('alert')).toContainText('material catalog changed');
 await expect(page.getByTestId('applied')).toHaveText('0');
});
test('review filters and clearing approvals leave values untouched',async({page})=>{
 await setup(page,[fact('depth','60 mm',{confidence:'high'}),fact('psuModel','REGULAR',{status:'unresolved',reason:'no-exact-match',confidence:'low'})]);
 await analyze(page);await expect(page.getByText('2 choices · 1 need attention · 0 selected')).toBeVisible();await page.getByRole('button',{name:'Needs attention',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Depth',exact:true})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:'Power supply model',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Selected',exact:true}).click();
 await expect(page.getByText(/Nothing selected yet/)).toBeVisible();
 await page.getByRole('button',{name:'All choices',exact:true}).click();
 await page.getByRole('checkbox',{name:'Depth',exact:true}).check();
 await page.getByRole('checkbox',{name:/I approve replacing/}).check();
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Depth',exact:true})).not.toBeChecked();
 await expect(page.getByTestId('applied')).toHaveText('0');
});
test('canceling analysis ignores its late response and enables a fresh request',async({page})=>{
 await setup(page,[]);
 let release=()=>{};const gate=new Promise<void>(r=>{release=r;});let started=false;
 await page.route('**/api/ai/order-intake',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{nativePdf:true,paidOcr:false}});
  started=true;await gate;await r.fulfill({json:{}}).catch(()=>{});
 });
 await page.getByRole('button',{name:'Analyze order source',exact:true}).click();
 await expect.poll(()=>started).toBe(true);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.getByText('Analysis canceled. Your draft has not changed.')).toBeVisible();release();
 await expect(page.getByRole('button',{name:'Analyze order source',exact:true})).toBeEnabled();
 await expect(page.getByRole('heading',{name:'Review extracted choices'})).toHaveCount(0);
 await expect(page.getByTestId('applied')).toHaveText('0');
});
const addressId='44444444-4444-4444-8444-444444444444';
const savedAddress={id:addressId,address:'Rīgas iela 4',contact:'Warehouse team',phone:'+371 123',email:'delivery@example.test',last_used_at:'2026-11-05T12:00:00Z'};
const use=(id:string,contact:string)=>({id,raw_address:'Rīgas iela 4',contact,phone:null,email:null,used_at:'2026-11-01T12:00:00Z',source_order_id:'11111111-1111-4111-8111-111111111111'});
test('searchable address history pages preserve contacts and require fresh approval after new edits',async({page})=>{
 await setup(page,[]);
 await page.route('**/api/client-delivery-addresses?**',r=>r.fulfill({json:[savedAddress,{...savedAddress,id:'55555555-5555-4555-8555-555555555555',address:'Other street',contact:'Other team'}]}));
 await page.route('**/api/client-delivery-addresses/*/history?**',r=>{
  const offset=new URL(r.request().url()).searchParams.get('offset');
  return r.fulfill({json:{items:[offset==='0'?use('66666666-6666-4666-8666-666666666666','Earlier contact'):use('77777777-7777-4777-8777-777777777777','Oldest contact')],total:2,nextOffset:offset==='0'?1:null}});
 });
 await page.getByRole('button',{name:'Find saved client addresses'}).click();
 await page.getByRole('searchbox',{name:'Search saved addresses'}).fill('RIGAS warehouse');
 await expect(page.getByLabel('Saved delivery address').locator('option')).toHaveCount(2);
 await page.getByLabel('Saved delivery address').selectOption(addressId);
 await expect(page.getByText(/Last used: .+2026/)).toBeVisible();
 await page.getByRole('button',{name:'View use history'}).click();
 await expect(page.getByText(/Earlier contact/)).toBeVisible();
 await page.getByRole('button',{name:'Load earlier uses'}).click();
 await expect(page.getByText(/Oldest contact/)).toBeVisible();
 await expect(page.getByRole('link',{name:'Open source order'}).first()).toHaveAttribute('href','/orders/11111111-1111-4111-8111-111111111111');
 await page.getByRole('checkbox',{name:/Replace the current delivery details/}).check();
 await page.getByRole('button',{name:'Edit delivery locally'}).click();
 await expect(page.getByRole('checkbox',{name:/Replace the current delivery details/})).not.toBeChecked();
 await expect(page.getByRole('button',{name:'Use this address'})).toBeDisabled();
 expect(JSON.parse(await page.getByTestId('current').innerText()).deliveryAddress).toBe('New user delivery edit');
});
test('a late address history result is discarded after switching clients',async({page})=>{
 await setup(page,[]);await page.route('**/api/client-delivery-addresses?**',r=>r.fulfill({json:[savedAddress]}));
 let release=()=>{};const gate=new Promise<void>(r=>{release=r;});let started=false;
 await page.route('**/api/client-delivery-addresses/*/history?**',async r=>{started=true;await gate;await r.fulfill({json:{items:[use('66666666-6666-4666-8666-666666666666','Private earlier contact')],total:1,nextOffset:null}}).catch(()=>{});});
 await page.getByRole('button',{name:'Find saved client addresses'}).click();await page.getByLabel('Saved delivery address').selectOption(addressId);
 await page.getByRole('button',{name:'View use history'}).click();await expect.poll(()=>started).toBe(true);
 await page.getByRole('button',{name:'Change client'}).click();release();
 await expect(page.getByText('Other client',{exact:true})).toBeVisible();
 await expect(page.getByText(/Private earlier contact/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Use this address'})).toHaveCount(0);
});

test('clearing a reviewed manual product removes its approval and cannot apply it',async({page})=>{
 await setup(page,[fact('faceMaterial','Generic opal',{status:'unresolved',reason:'no-exact-match'})]);
 await analyze(page);await chooseFaceProduct(page);
 const checkbox=page.getByRole('checkbox',{name:'Face material',exact:true});await checkbox.check();
 await page.getByRole('button',{name:'Change catalog product',exact:true}).click();
 await page.locator('.material-editor').getByRole('button',{name:'Clear selection',exact:true}).click();
 await expect(checkbox).not.toBeChecked();await expect(checkbox).toBeDisabled();
 await expect(page.getByRole('button',{name:'Apply selected fields to form'})).toBeDisabled();
 await expect(page.getByTestId('applied')).toHaveText('0');
});
test('different manual products for the same field are blocked before applying',async({page})=>{
 const green={...material,id:'88888888-8888-4888-8888-888888888888',code:'GREEN_PLEXI',name_en:'Green acrylic'};
 await setup(page,[fact('faceMaterial','Generic opal',{status:'unresolved',reason:'no-exact-match',part:'First part'}),
  fact('faceMaterial','Generic opal',{status:'unresolved',reason:'no-exact-match',part:'Second part'})]);
 await page.route('**/api/materials?**',r=>r.fulfill({json:[material,green]}));
 await analyze(page);
 for(const [part,name] of [['First part','Blue acrylic'],['Second part','Green acrylic']]){
  const row=page.locator('.review-row').filter({hasText:part});
  await row.getByRole('button',{name:'Choose from catalog',exact:true}).click();
  await page.getByRole('button',{name:/Face material · Select/}).click();
  await page.getByRole('searchbox',{name:/Search all materials/}).fill(name);
  await page.getByRole('button',{name:new RegExp(name)}).click();
  await row.getByRole('checkbox',{name:'Face material',exact:true}).check();
 }
 await expect(page.getByText(/Selected choices assign different values/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Apply selected fields to form'})).toBeDisabled();
 await expect(page.getByTestId('applied')).toHaveText('0');
});

test('mobile Russian review shows real counts, fits the viewport and supports keyboard filters',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,[fact('depth','60 mm',{confidence:'high'}),fact('psuModel','REGULAR',{status:'unresolved',reason:'no-exact-match',confidence:'low'})],'/production-intake.html?lang=ru');
 await page.getByRole('button',{name:ru.orderIntake.analyze,exact:true}).click();
 await expect(page.getByText('Параметров: 2 · Требуют внимания: 1 · Выбрано: 0')).toBeVisible();
 await expect(page.getByRole('heading',{name:ru.orderIntake.reviewChoices})).toBeFocused();
 const filter=page.getByRole('button',{name:ru.orderIntake.filter_selected,exact:true});
 await filter.focus();await filter.press('Space');await expect(filter).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('read-only orders can retry and inspect address history without applying it',async({page})=>{
 await setup(page,[]);await page.getByRole('button',{name:'Toggle read only'}).click();
 await page.route('**/api/client-delivery-addresses?**',r=>r.fulfill({json:[savedAddress]}));
 let requests=0;
 await page.route('**/api/client-delivery-addresses/*/history?**',r=>++requests===1?r.fulfill({status:503,json:{error:'Unavailable'}}):r.fulfill({json:{items:[use('66666666-6666-4666-8666-666666666666','Earlier contact')],total:1,nextOffset:null}}));
 await page.getByRole('button',{name:'Find saved client addresses'}).click();await page.getByLabel('Saved delivery address').selectOption(addressId);
 await expect(page.getByRole('button',{name:'Use this address'})).toBeDisabled();
 await page.getByRole('button',{name:'View use history'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText(/Earlier contact/)).toBeVisible();
 await expect(page.getByTestId('applied')).toHaveText('0');
});
