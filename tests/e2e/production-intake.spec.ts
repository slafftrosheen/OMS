import {test,expect,type Page} from '@playwright/test';
const id='22222222-2222-4222-8222-222222222222';
const material={id:'33333333-3333-4333-8333-333333333333',code:'REAL_PLEXI',category:'ACRYLIC_XT',name_en:'Blue acrylic',metadata:{model:'5N870'}};
const fact=(target:string,value:string,extra={})=>({target,value,evidence:value,page:1,part:null,
 confidence:'medium',status:'ready',reason:'source-value',material:null,...extra});
async function setup(page:Page,production:any[]){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/files?**',route=>route.fulfill({headers:{'X-Total-Count':'1'},json:[{id,originalName:'Drawing.pdf',mimeType:'application/pdf'}]}));
 await page.route('**/api/ai/order-intake',route=>route.fulfill({json:{proposals:[],profileSuggestions:[],missing:['Confirm unspecified PSU model'],
  production,fileId:id,fileName:'Drawing.pdf',profileIndex:0,profileId:'p1',model:'fixture/model',
  orderUpdatedAt:'2026-11-05T12:00:00Z',evidenceVerified:[],engine:'native',provenance:'model-reported'}}));
 await page.route('**/api/draft-orders/*',route=>route.fulfill({json:{updatedAt:'2026-11-05T12:00:00Z',status:'DRAFT',profiles:[{dbId:'p1'}]}}));
 await page.route('**/api/materials?intake=true',route=>route.fulfill({json:[{...material,stock:0}]}));
 await page.goto('/production-intake.html');
 return errors;
}
async function analyze(page:Page){
 await page.getByRole('button',{name:'Analyze order source',exact:true}).click();
 await expect(page.getByText('Production choices',{exact:true})).toBeVisible();
}
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
 await page.route('**/api/client-delivery-addresses?**',route=>route.fulfill({json:[{id:'a1',address:'Saved address',contact:'Saved contact',phone:'123',email:null,last_used_at:'2026-11-05T12:00:00Z'}]}));
 await page.getByRole('button',{name:'Find saved client addresses'}).click();
 await page.getByLabel('Saved delivery address').selectOption('a1');
 await expect(page.getByRole('button',{name:'Use this address'})).toBeDisabled();
 expect(JSON.parse(await page.getByTestId('current').innerText()).deliveryAddress).toBe('User address');
 await page.getByRole('checkbox',{name:/Replace the current delivery details/}).check();
 await page.getByRole('button',{name:'Use this address'}).click();
 expect(JSON.parse(await page.getByTestId('current').innerText()).deliveryAddress).toBe('Saved address');
});
