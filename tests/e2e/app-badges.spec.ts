import { test, expect } from '@playwright/test';

let errors: string[];
test.beforeEach(async ({page})=>{
  errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await page.goto('/app-badges.html');
});
test.afterEach(()=>expect(errors).toEqual([]));

test('shared badges explain lifecycle and schedule consistently and clear alerts after dispatch',async({page})=>{
  const order=page.getByRole('region',{name:'Order summary'});
  await expect(order.locator('[data-badge="in_production"]')).toHaveText('In production');
  await expect(order.locator('[data-badge="urgent"]')).toHaveCount(1);
  await expect(order.locator('[data-badge="overdue"]')).toHaveAttribute('title','Overdue · 2026-10-21');
  await expect(order.locator('[data-badge="loading_today"]')).toBeVisible();
  await page.getByLabel('Due date',{exact:true}).fill('2026-10-22');
  await expect(order.locator('[data-badge="overdue"]')).toHaveCount(0);
  await expect(order.locator('[data-badge="due_today"]')).toBeVisible();
  await page.getByLabel('Order status').selectOption('DISPATCHED');
  await expect(order.locator('[data-badge="dispatched"]')).toBeVisible();
  await expect(order.locator('[data-badge="urgent"], [data-badge="due_today"], [data-badge="loading_today"]')).toHaveCount(0);
  await expect(order.locator('[data-badge="rd"]')).toBeVisible();
});

test('shared badges localize labels and retain full text for assistive technology',async({page})=>{
  const order=page.getByRole('region',{name:'Order summary'});
  await page.getByLabel('Language').selectOption('ru');
  await expect(order.locator('[data-badge="in_production"]')).toHaveText('В производстве');
  await expect(order.locator('[data-badge="overdue"]')).toHaveAttribute('aria-label','Просрочен · 2026-10-21');
  await page.getByLabel('Language').selectOption('lv');
  await expect(order.locator('[data-badge="in_production"]')).toHaveText('Ražošanā');
  await expect(order.locator('[data-badge="loading_today"]')).toHaveText('Iekraušana šodien');
  await expect(page.locator('body')).not.toContainText('appBadges.');
  await expect(page.locator('body')).not.toContainText('{priority}');
});

for (const width of [320,1440]) test(`shared badge layout at ${width}px across themes`,async({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width,height:1000});
  for(const theme of ['LightVim','DarkVim','HighContrastVim']){
    await page.getByLabel('Theme').selectOption(theme);
    await page.getByLabel('Language').selectOption('ru');
    await expect(page.getByRole('region',{name:'Order summary'}).locator('[data-badge="overdue"]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const hiddenCounts=await page.locator('.badge-count').evaluateAll(nodes=>nodes.filter(node=>{
      const r=node.getBoundingClientRect(),p=node.parentElement!.getBoundingClientRect();
      return r.right>p.right+1||r.left<p.left-1;
    }).length);
    expect(hiddenCounts).toBe(0);
  }
  await page.screenshot({path:`/tmp/oms-app-badges-${width}.png`,fullPage:true});
});
