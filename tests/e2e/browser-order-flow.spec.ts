import { test, expect } from '@playwright/test';

test('local HTTP actions, private multipart uploads, and manager deletion', async ({page}) => {
  const errors: string[]=[];
  const writes: any[]=[];
  let attachments: any[]=[];
  let deletes=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(Crypto.prototype,'randomUUID',{configurable:true,value:undefined}));
  await page.route('**/api/auth',route=>route.fulfill({json:{user:{id:'manager',username:'boss',displayName:'Boss',role:'Boss',stations:[]}}}));
  await page.route('**/api/files?*',route=>route.fulfill({json:attachments,headers:{'X-Total-Count':String(attachments.length)}}));
  await page.route('**/api/files',async route=>{
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
    const body=route.request().postDataBuffer()!.toString();
    expect(body).toContain('11111111-1111-4111-8111-111111111111');
    expect(body).toContain('%PDF-1.4');
    writes.push(body);
    attachments=[{id:'file',originalName:'TEST-ONLY.pdf',mimeType:'application/pdf',size:20,uploadedAt:'2026-11-05T10:00:00Z'}];
    await route.fulfill({status:201,json:{success:true,file:attachments[0]}});
  });
  await page.route('**/api/orders/*',async route=>{
    deletes++;
    expect(route.request().postDataJSON()).toEqual({expectedUpdatedAt:'2026-11-05T10:00:00.000Z'});
    await route.fulfill(deletes===1 ? {status:409,json:{message:'Order changed. Reload first.'}} : {json:{success:true,status:'CANCELLED'}});
  });
  await page.goto('/order-flow.html');
  await page.getByRole('button',{name:'Notify success',exact:true}).click();
  await page.getByRole('button',{name:'Notify error',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Saved successfully'})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Upload failed'})).toBeVisible();
  // An empty browser MIME declaration is valid for a PDF selected on some OSes.
  await page.locator('input[type=file]').setInputFiles({name:'TEST-ONLY.pdf',mimeType:'',buffer:Buffer.from('%PDF-1.4\nTEST ONLY\n')});
  await expect(page.getByText('TEST-ONLY.pdf',{exact:true})).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole('button',{name:'Delete order',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('consumed materials and audit history');
  await dialog.getByRole('button',{name:'Delete order',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Order changed. Reload first.');
  await dialog.getByRole('button',{name:'Delete order',exact:true}).click();
  await expect(page.getByText('Deleted successfully',{exact:true})).toBeVisible();
  expect(deletes).toBe(2);
  expect(errors).toEqual([]);
});

for(const role of ['Operator','StationHead']) test(`${role} has no delete control`,async({page})=>{
  await page.route('**/api/auth',route=>route.fulfill({json:{user:{id:'operator',username:'operator',displayName:'Operator',role,stations:[]}}}));
  await page.route('**/api/files?*',route=>route.fulfill({json:[],headers:{'X-Total-Count':'0'}}));
  await page.goto('/order-flow.html');
  await expect(page.getByRole('button',{name:'Notify success'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Delete order',exact:true})).toHaveCount(0);
});

for(const station of ['CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY','SANDING','BENDING','WELDING','FILM_COATING','GLUEING','QC','LOGISTICS']) {
 test(`${station} queue exposes order view and versioned production controls`,async({page})=>{
  const errors:string[]=[]; let state='QUEUED'; const changes:any[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(Crypto.prototype,'randomUUID',{configurable:true,value:undefined}));
  await page.route('**/api/auth',r=>r.fulfill({json:{user:{id:'operator',username:'operator',displayName:'Operator',role:'Operator',stations:[{stationId:station,isHead:false}]}}}));
  await page.route(`**/api/station/${station}/orders`,r=>r.fulfill({json:[{id:'order-id',title:`TEST ONLY ${station}`,po_number:'QA-FLOW',client:'TEST ONLY',status:'IN_PRODUCTION',priority:'NORMAL',due_date:'2026-12-01',stage:{state,updated_at:'2026-11-05T10:00:00Z'}}]}));
  await page.route('**/api/orders/order-id/stages?*',async r=>{
    const body=r.request().postDataJSON(); changes.push(body);
    expect(body.expectedUpdatedAt).toBe('2026-11-05T10:00:00Z');state=body.state;
    await r.fulfill({json:{state}});
  });
  await page.route('**/api/chat',r=>r.fulfill({json:{success:true,room:{id:'room',name:station}}}));
  await page.route('**/api/chat/messages?*',r=>r.fulfill({json:{success:true,messages:[]}}));
  await page.route('**/api/users',r=>r.fulfill({json:[]}));
  await page.routeWebSocket(/\/realtime\/v1\//,socket=>socket.onMessage(()=>{}));
  await page.route('http://localhost:8000/**',r=>r.fulfill({status:503,json:{}}));
  await page.route('**/api/inventory/items?*',r=>r.fulfill({json:[]}));
  await page.goto(`/workflow-dialogs.html?surface=station&station=${station}`);
  await expect(page.getByRole('heading',{name:`TEST ONLY ${station}`,exact:true})).toBeVisible();
  await expect(page.locator('a[href="/orders/order-id"]')).toBeVisible();
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.getByRole('button',{name:'Log progress',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Complete',exact:true}).click();
  await expect(page.getByRole('dialog',{name:/Complete stage/})).toBeVisible();
  expect(changes).toHaveLength(1);
  expect(changes[0].state).toBe('IN_PROGRESS');
  expect(errors).toEqual([]);
 });
}

for(const role of ['RD','HeadOfProduction']) test(`${role} can open a deletion confirmation`,async({page})=>{
 await page.route('**/api/auth',r=>r.fulfill({json:{user:{id:'manager',role,username:role,displayName:role,stations:[]}}}));
 await page.route('**/api/files?*',r=>r.fulfill({json:[],headers:{'X-Total-Count':'0'}}));
 await page.goto('/order-flow.html');
 await page.getByRole('button',{name:'Delete order',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('removed from active lists and station queues');
});

test('delivery hands ready orders to loading instead of offering a rejected production mutation',async({page})=>{
 await page.route('**/api/auth',r=>r.fulfill({json:{user:{id:'delivery',role:'Operator',username:'delivery',displayName:'Delivery',stations:[{stationId:'DELIVERY',isHead:false}]}}}));
 await page.route('**/api/station/DELIVERY/orders',r=>r.fulfill({json:[{id:'ready-order',title:'TEST ONLY ready',po_number:'QA-READY',client:'TEST',status:'READY_TO_LOAD',priority:'NORMAL',due_date:'2026-12-01',stage:{state:'QUEUED',updated_at:'2026-11-05T10:00:00Z'}}]}));
 await page.route('**/api/chat',r=>r.fulfill({json:{success:true,room:{id:'room',name:'DELIVERY'}}}));
 await page.route('**/api/chat/messages?*',r=>r.fulfill({json:{success:true,messages:[]}}));
 await page.route('**/api/users',r=>r.fulfill({json:[]}));
 await page.routeWebSocket(/\/realtime\/v1\//,socket=>socket.onMessage(()=>{}));
 await page.route('http://localhost:8000/**',r=>r.fulfill({status:503,json:{}}));
 await page.goto('/workflow-dialogs.html?surface=station&station=DELIVERY');
 await expect(page.getByRole('heading',{name:'TEST ONLY ready',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'Loading calendar',exact:true})).toHaveAttribute('href','/calendar');
});
