import { test, expect } from '@playwright/test';

const baseURL = process.env.OMS_QA_BASE_URL;
const orderId = process.env.OMS_QA_ORDER_ID;
const storageState = process.env.OMS_QA_STORAGE_STATE;

test.use({ baseURL, storageState, contextOptions: { reducedMotion: 'reduce' } });
test.skip(!baseURL || !orderId || !storageState,
  'Provide an isolated app URL, an editable test order and private manager storage state.');

for (const width of [320, 768, 1024, 1440]) {
  test(`editor actions stay below navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/orders/${orderId}/edit?section=details`);
    const save = page.locator('.top-bar-actions').getByRole('button', { name: /^Save draft$/i });
    const confirm = page.locator('.top-bar-actions').getByRole('button', { name: /Confirm order/i });
    await expect(save).toBeEnabled();
    await page.locator('.order-field-panel').getByLabel('Title', { exact: true }).fill('TEST ONLY layout check');
    await page.locator('.order-field-panel').getByLabel('Order notes', { exact: true }).fill('TEST ONLY unsaved layout check');
    // A canceled page-entry animation must not change the editor's containing block.
    await page.locator('#main').evaluate(el => {
      el.style.animation = 'none';
      el.style.transform = 'none';
    });
    await expect(confirm).toBeEnabled();
    // Trial clicks perform ordinary pointer hit-testing without saving data.
    await save.click({ trial: true, timeout: 5000 });
    await confirm.click({ trial: true, timeout: 5000 });
    const nav = await page.locator('.rf-topbar').boundingBox();
    const toolbar = await page.locator('.top-bar').boundingBox();
    expect(toolbar!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
  });
}

test('reload warns through the browser without a blocked custom confirm', async ({ page }) => {
  const errors: string[] = [];
  const dialogs: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  await page.goto(`/orders/${orderId}/edit?section=details`);
  const title = page.locator('.order-field-panel').getByLabel('Title', { exact: true });
  await expect(title).toHaveValue(/.+/);
  const original = await title.inputValue();
  await title.click();
  await title.fill(`${original} TEST ONLY UNSAVED`);
  await expect(page.locator('.unsaved-dot')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.order-field-panel').getByLabel('Title', { exact: true })).toHaveValue(original);
  expect(dialogs).toContain('beforeunload');
  expect(errors).toEqual([]);
});
