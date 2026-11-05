import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
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
