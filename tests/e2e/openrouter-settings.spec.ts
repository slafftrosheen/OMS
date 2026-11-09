import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_TELEGRAM_OPTIONS} from '../../src/lib/notifications/telegram-options';
test.use({serviceWorkers:'block',viewport:{width:390,height:844}});
const choices=[
  {id:'fixture/text',name:'Assistant',text:true,image:false,tools:true,structured:true,free:true},
  {id:'fixture/images-only',name:'Images only',text:true,image:true,tools:true,structured:false,free:true},
  {id:'fixture/vision',name:'Compatible OCR',text:true,image:true,tools:false,structured:true,free:true},
  {id:'fixture/paid',name:'Paid OCR',text:true,image:true,tools:true,structured:true,free:false}
];
async function setup(page:Page,failSave=false){
  let models={textModel:'fixture/text',visionModel:'fixture/images-only'};
  const writes:unknown[]=[];let reads=0;
  await page.route('http://localhost:8000/**',r=>r.fulfill({json:[]}));
  await page.route('**/api/**',r=>{
    const request=r.request(),path=new URL(request.url()).pathname;
    if(path==='/api/settings/openrouter/models'){
      if(request.method()==='PATCH'){
        writes.push(request.postDataJSON());
        if(failSave){failSave=false;return r.fulfill({status:503,json:{error:'Provider catalog temporarily unavailable'}});}
        models=request.postDataJSON();return r.fulfill({json:{...models,ok:true}});
      }
      reads++;return r.fulfill({json:{...models,choices}});
    }
    if(path==='/api/settings/openrouter')return r.fulfill({json:{configured:true,masked:'••••••••test'}});
    if(path==='/api/settings/ai-policy')return r.fulfill({json:{enabled:true}});
    if(path==='/api/settings/telegram')return r.fulfill({json:{available:true,configured:false,
      options:structuredClone(DEFAULT_TELEGRAM_OPTIONS),
      credentials:{botToken:{configured:false,masked:''},webhookSecret:{configured:false,masked:''},deliverySecret:{configured:false,masked:''}},
      counts:{connected:0,pending:0,failed:0},webhookUrl:'',dispatchUrl:''}});
    if(path==='/api/notifications/telegram')return r.fulfill({json:{configured:false,available:false}});
    return r.fulfill({json:[]});
  });
  return {writes,reads:()=>reads};
}
test('R&D selects compatible OCR models under AI & OpenRouter and selections survive reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const observed=await setup(page);
  await page.goto('/openrouter-settings.html');
  await page.getByRole('tab',{name:'AI & OpenRouter',exact:true}).click();
  await expect(page.getByText(/current vision model is unavailable/)).toBeVisible();
  const vision=page.getByLabel('Vision / order OCR model',{exact:true});
  await expect(vision.locator('option')).toHaveCount(3);
  await vision.selectOption('fixture/vision');
  await page.getByRole('button',{name:'Save models',exact:true}).click();
  await expect(page.getByText(/Models saved/)).toBeVisible();
  expect(observed.writes).toEqual([{textModel:'fixture/text',visionModel:'fixture/vision'}]);
  await page.reload();
  await page.getByRole('tab',{name:'AI & OpenRouter',exact:true}).click();
  await expect(vision).toHaveValue('fixture/vision');
  await expect(page.getByRole('button',{name:'Save models',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.local/qa/openrouter-models.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('failed saves retain the selected OCR model and allow retry',async({page})=>{
  const observed=await setup(page,true);
  await page.goto('/openrouter-settings.html');
  await page.getByRole('tab',{name:'AI & OpenRouter',exact:true}).click();
  await page.getByLabel('Vision / order OCR model',{exact:true}).selectOption('fixture/vision');
  await page.getByRole('button',{name:'Save models',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Provider catalog temporarily unavailable'})).toBeVisible();
  await expect(page.getByLabel('Vision / order OCR model',{exact:true})).toHaveValue('fixture/vision');
  await page.getByRole('button',{name:'Save models',exact:true}).click();
  await expect(page.getByText(/Models saved/)).toBeVisible();
  expect(observed.writes).toHaveLength(2);
});
test('ordinary accounts do not see provider controls or request privileged model settings',async({page})=>{
  const observed=await setup(page);
  await page.goto('/openrouter-settings.html?operator');
  await expect(page.getByRole('tab',{name:'General',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:'AI & OpenRouter',exact:true})).toHaveCount(0);
  expect(observed.reads()).toBe(0);
});
