import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';

const initial = () => ({ available:true,source:'settings',configured:true,
  options:{...structuredClone(DEFAULT_TELEGRAM_OPTIONS),enabled:true,botUsername:'OMS_notify_bot',appUrl:'https://oms.example.test'},
  credentials:{botToken:{configured:true,masked:'••••6789'},webhookSecret:{configured:true,masked:'••••ssss'},deliverySecret:{configured:true,masked:'••••dddd'}},
  webhookUrl:'https://oms.example.test/api/telegram/webhook',dispatchUrl:'https://oms.example.test/api/telegram/dispatch',counts:{connected:3,pending:2,failed:1}
});
let errors:string[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',error=>errors.push(error.message));});
test.afterEach(()=>expect(errors).toEqual([]));
async function fixture(page:Page, options:{failLoad?:boolean;failSave?:boolean}={}) {
  let state=initial();let failLoad=options.failLoad;const writes:any[]=[];const actions:string[]=[];
  await page.route('**/api/settings/telegram',async route=>{
    const request=route.request();
    if(request.method()==='GET') {
      if(failLoad){failLoad=false;return route.fulfill({status:503,json:{code:'settings_unavailable'}});}
      return route.fulfill({json:state});
    }
    if(request.method()==='PUT') {
      const body=request.postDataJSON();writes.push(body);
      if(options.failSave)return route.fulfill({status:400,json:{code:'invalid_settings'}});
      state={...state,options:body.options};
      if(body.botToken)state.credentials.botToken={configured:true,masked:'••••'+body.botToken.slice(-4)};
      return route.fulfill({json:state});
    }
    if(request.method()==='POST') {
      const action=request.postDataJSON().action;actions.push(action);
      if(action==='probe')return route.fulfill({json:{ok:true,botUsername:'OMS_notify_bot',botMatches:true,webhook:{registered:true,matches:true,pending:0,hasError:false}}});
      if(action==='retryFailures'){state.counts={...state.counts,pending:3,failed:0};return route.fulfill({json:{ok:true,requeued:1}});}
      return route.fulfill({json:{ok:true,commandsSynced:true}});
    }
    if(request.method()==='DELETE'){state.options.enabled=false;state.configured=false;state.credentials={botToken:{configured:false,masked:''},webhookSecret:{configured:false,masked:''},deliverySecret:{configured:false,masked:''}};return route.fulfill({json:{ok:true}});}
    return route.fulfill({status:405});
  });
  return {writes,actions};
}

test('Telegram R&D settings keep credentials write-only and save delivery/AI controls before provider actions',async({page})=>{
  const calls=await fixture(page);await page.goto('/telegram-admin.html');
  await expect(page.getByRole('heading',{name:'Telegram · R&D administration'})).toBeVisible();
  await expect(page.locator('#telegram-bot-token')).toHaveValue('');
  await expect(page.locator('#telegram-webhook-secret')).toHaveValue('');
  await expect(page.locator('.telegram-admin')).toContainText('••••6789');
  await page.locator('#telegram-bot-token').fill('123456:replacement_abcdefghijklmnopqrstuvwxyz');
  await page.locator('#telegram-batchSize').fill('4');
  await page.getByLabel('OpenRouter assistant in Telegram').check();
  await expect(page.getByRole('button',{name:'Register webhook',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Generate secret',exact:true}).first().click();
  await expect(page.locator('#telegram-webhook-secret')).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button',{name:'Save Telegram settings',exact:true}).click();
  await expect(page.locator('#telegram-bot-token')).toHaveValue('');
  await expect(page.locator('#telegram-webhook-secret')).toHaveValue('');
  expect(calls.writes).toHaveLength(1);expect(calls.writes[0].options.aiEnabled).toBe(true);expect(calls.writes[0].options.batchSize).toBe(4);
  expect(calls.writes[0].deliverySecret).toBeUndefined();
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.locator('.probe-result')).toContainText('The API token matches');
  await page.getByRole('button',{name:'Register webhook',exact:true}).click();
  await expect(page.locator('.feedback.success')).toContainText('Webhook registered');
  expect(calls.actions).toEqual(['probe','registerWebhook']);
});

test('Telegram R&D admin can retry eligible failures and recover a settings outage without losing replacements',async({page})=>{
  const calls=await fixture(page,{failLoad:true});await page.goto('/telegram-admin.html');
  await expect(page.getByRole('alert')).toContainText('settings are unavailable');
  await page.getByRole('button',{name:'Reload',exact:true}).click();
  await expect(page.locator('.integration-metrics')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Retry eligible failures',exact:true}).click();
  await expect(page.locator('.feedback.success')).toContainText('1 eligible failed notifications requeued');
  await expect(page.getByRole('button',{name:'Retry eligible failures',exact:true})).toBeDisabled();
  expect(calls.actions).toEqual(['retryFailures']);
  await fixture(page,{failSave:true});
  await page.locator('#telegram-bot-token').fill('123456:replacement_abcdefghijklmnopqrstuvwxyz');
  await page.getByRole('button',{name:'Save Telegram settings',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Check the public HTTPS address');
  await expect(page.locator('#telegram-bot-token')).toHaveValue('123456:replacement_abcdefghijklmnopqrstuvwxyz');
});

test('Telegram R&D administration fits desktop and phone in all three languages and themes',async({page})=>{
  test.setTimeout(120000);await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/telegram-admin.html');
  await expect(page.locator('.provider-actions')).toBeVisible();
  await expect(page.locator('.telegram-admin')).not.toContainText('settings.telegramAdmin.');
  await page.screenshot({path:'/tmp/oms-telegram-admin-1440.png',fullPage:true});
  await page.setViewportSize({width:320,height:900});
  for(const [language,theme,title] of [['ru','DarkVim','Telegram · настройки R&D'],['lv','HighContrastVim','Telegram · R&D administrēšana']]) {
    await page.getByLabel('Language',{exact:true}).selectOption(language);await page.getByLabel('Theme',{exact:true}).selectOption(theme);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('.telegram-admin')).not.toContainText('settings.telegramAdmin.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }
  await page.screenshot({path:'/tmp/oms-telegram-admin-320.png',fullPage:true});
});
