import { test, expect, type Page, type Route } from '@playwright/test';

const materials = [
  { id: 1, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_0F00', name_en: 'PLEXIGLAS GS Clear 0F00', name_ru: 'Литой акрил прозрачный 0F00', name_lv: 'Caurspīdīgs liets akrils 0F00', thickness_options: [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25], metadata: { hex: '#f5f5f0', short_name: '0F00' } },
  { id: 2, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_LONG', name_en: 'PLEXIGLAS GS White translucent acrylic with a deliberately long catalog name', name_ru: 'Белый светорассеивающий литой акрил с длинным названием материала', name_lv: 'Balts gaismu izkliedējošs liets akrils ar garu materiāla nosaukumu', thickness_options: [3, 5, 8, 10], metadata: { hex: '#ffffff', short_name: 'WH10' } },
  { id: 3, category: 'ALU_COMPOSITE', code: 'ALU_COMPOSITE_0A000', name_en: 'Aluminum composite white 0A000', name_ru: 'Белый алюминиевый композит 0A000', name_lv: 'Balts alumīnija kompozīts 0A000', thickness_options: [2, 3, 4], metadata: { hex: '#ffffff', short_name: '0A000' } },
  { id: 4, category: 'PVC_FOAM', code: 'PVC_CUSTOM', name_en: 'PVC made to order', thickness_options: [], metadata: {} }
];

async function catalogResponse(route: Route) {
  const url = new URL(route.request().url());
  const categories = (url.searchParams.get('categories') || url.searchParams.get('category'))?.split(',');
  await route.fulfill({ json: categories ? materials.filter(item => categories.includes(item.category)) : materials });
}

let runtimeErrors: string[];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('**/api/materials**', catalogResponse);
  await page.route('**/api/material-thickness-options**', async route => {
    const type = new URL(route.request().url()).searchParams.get('materialType');
    const values = type === 'ACRYLIC' ? [2, 3, 5, 10] : type === 'PVC' ? [5, 10] : [2, 3, 4];
    await route.fulfill({ json: values.map(thickness => ({ thickness, unit: 'mm' })) });
  });
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));

async function savedConfiguration(page: Page) {
  return JSON.parse(await page.getByTestId('configuration').innerText());
}

test('partial legacy profile opens without edits, and bare thickness stays selected', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.face-material-entry')).toHaveCount(1);
  await expect(page.locator('.face-material-entry .thickness-select')).toHaveValue('3mm');
  await expect(page.getByLabel('BACK · Select thickness', { exact: true })).toHaveValue('2mm');
  await expect(page.getByLabel('Standalone thickness')).toHaveValue('3mm');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('change-count')).toHaveText('0');
  expect((await savedConfiguration(page)).CNC_FREZER.faceMaterials).toBeUndefined();
  await expect(page.getByTestId('standalone-thickness')).toHaveText('3');
});

test('the last typed character and checkbox change are present in the saved profile', async ({ page }) => {
  await page.goto('/');
  await page.locator('.profile-name input').fill('Production profile revised');
  expect((await savedConfiguration(page)).profileName).toBe('Production profile revised');
  await page.locator('.section').first().getByLabel('LASER', { exact: true }).check();
  expect((await savedConfiguration(page)).CNC_FREZER.laser).toBe(true);
  await page.locator('.notes').first().fill('Final CNC instruction');
  expect((await savedConfiguration(page)).CNC_FREZER.notes).toBe('Final CNC instruction');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(page.locator('.profile-name input')).toHaveValue('Production profile revised');
  await expect(page.locator('.section').first().getByLabel('LASER', { exact: true })).toBeChecked();
  await expect(page.locator('.notes').first()).toHaveValue('Final CNC instruction');
});

test('category browsing, independent FACE rows, removal and serialized reload preserve selections', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('.face-material-entry');
  await rows.first().locator('.select-trigger').click();
  await expect(rows.first().locator('.category-option')).toHaveCount(3);
  await expect(rows.first().locator('.option')).toHaveCount(0);
  await rows.first().getByRole('button', { name: /Cast acrylic/ }).click();
  await expect(rows.first().locator('.option')).toHaveCount(2);
  await rows.first().getByRole('button', { name: /PLEXIGLAS GS Clear/ }).click();
  await rows.first().locator('.thickness-select').selectOption('5mm');

  await page.getByRole('button', { name: 'Add FACE material', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('.select-trigger').click();
  await rows.nth(1).getByRole('button', { name: /Aluminum composite/ }).click();
  await rows.nth(1).getByRole('button', { name: /Aluminum composite white/ }).click();
  await rows.nth(1).locator('.thickness-select').selectOption('4mm');
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials.map((row: any) => [row.value, row.thickness])).toEqual([
    ['PLEXIGLAS GS Clear 0F00', '5mm'], ['Aluminum composite white 0A000', '4mm']
  ]);
  expect(saved.CNC_FREZER.face).toBe('PLEXIGLAS GS Clear 0F00');

  const edits = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('.thickness-select')).toHaveValue('5mm');
  await expect(rows.nth(1).locator('.thickness-select')).toHaveValue('4mm');
  await expect(page.getByTestId('change-count')).toHaveText(edits);
  await rows.first().getByRole('button', { name: 'Remove FACE material 1' }).click();
  await expect(rows).toHaveCount(1);
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('Aluminum composite white 0A000');
  await expect(rows.first().locator('.thickness-select')).toHaveValue('4mm');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(page.locator('.add-face')).toHaveCount(0);
  await expect(rows.first().locator('.select-trigger')).toBeDisabled();
  await expect(rows.first().locator('.thickness-select')).toBeDisabled();
});

test('global search and keyboard dismissal keep the selected value intact', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  const trigger = row.locator('.select-trigger');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const search = row.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.fill('PLEXIGLAS_GS_LONG');
  await expect(row.locator('.option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(row.locator('.option')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row.locator('.dropdown')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await row.locator('.category-option').last().focus();
  await page.keyboard.press('Tab');
  await expect(row.locator('.dropdown')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('heading', { name: 'Profile controls regression fixture' }).click();
  await expect(row.locator('.dropdown')).toHaveCount(0);
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('PLEXIGLAS_GS_0F00');
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('custom FACE text, color and manual thickness survive remount and continued typing', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  await row.locator('.select-trigger').click();
  await row.getByRole('button', { name: 'Enter custom value', exact: true }).click();
  await row.getByRole('textbox', { name: 'Enter custom value' }).fill('Custom ruby glass');
  await row.getByLabel('Custom material color').evaluate((element: HTMLInputElement) => {
    element.value = '#881144';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await row.getByRole('textbox', { name: /Select thickness/ }).fill('6.5');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(row.getByRole('textbox', { name: 'Enter custom value' })).toHaveValue('Custom ruby glass');
  await expect(row.getByLabel('Custom material color')).toHaveValue('#881144');
  await expect(row.getByRole('textbox', { name: /Select thickness/ })).toHaveValue('6.5');
  await row.getByRole('textbox', { name: 'Enter custom value' }).fill('Custom ruby glass revised');
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials[0]).toMatchObject({ value: 'Custom ruby glass revised', hex: '#881144', thickness: '6.5mm' });
});

test('catalog errors expose retry and do not discard the saved material', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/materials**', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } }) : catalogResponse(route));
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  await row.locator('.select-trigger').click();
  await expect(row.getByText('Could not load materials. Try again.')).toBeVisible();
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('PLEXIGLAS_GS_0F00');
  unavailable = false;
  await row.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(row.locator('.category-option')).toHaveCount(3);
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('failed thickness lookup provides manual entry and a working retry', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/material-thickness-options**', route => route.fulfill(unavailable
    ? { status: 503, json: { error: 'Unavailable' } }
    : { json: [{ thickness: 3, unit: 'mm' }, { thickness: 6.5, unit: 'mm' }] }));
  await page.goto('/');
  const field = page.getByRole('region', { name: 'Legacy thickness request' });
  await expect(field.getByText(/could not be loaded/)).toBeVisible();
  await field.getByLabel('Standalone thickness').fill('6.5');
  await expect(page.getByTestId('standalone-thickness')).toHaveText('6.5mm');
  unavailable = false;
  await field.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(field.locator('select')).toHaveValue('6.5mm');
  await expect(field.getByText(/could not be loaded/)).toHaveCount(0);
});

test('a late old thickness response cannot replace the new material choices', async ({ page }) => {
  const pending: Route[] = [];
  await page.route('**/api/material-thickness-options**', async route => {
    if (new URL(route.request().url()).searchParams.get('materialType') === 'ACRYLIC') {
      pending.push(route);
      return;
    }
    await route.fulfill({ json: [{ thickness: 5, unit: 'mm' }] });
  });
  await page.goto('/');
  const field = page.getByRole('region', { name: 'Legacy thickness request' });
  await expect(field.locator('select')).toBeDisabled();
  await field.getByRole('button', { name: 'Use PVC fallback' }).click();
  await expect(field.locator('select')).toBeEnabled();
  await expect(field.locator('option[value="5mm"]')).toHaveCount(1);
  for (const route of pending) await route.fulfill({ json: [{ thickness: 2, unit: 'mm' }] }).catch(() => {});
  await expect(field.locator('option[value="2mm"]')).toHaveCount(0);
  await expect(field.locator('select')).toHaveValue('3mm');
  await field.getByRole('button', { name: 'Use explicit empty options' }).click();
  await expect(field.getByRole('textbox')).toHaveValue('3');
  await expect(field.getByText(/No standard thicknesses/)).toBeVisible();
});

for (const scenario of [
  { width: 320, theme: 'LightVim', language: 'ru', category: /Литой акрил/ },
  { width: 768, theme: 'DarkVim', language: 'lv', category: /Liets akrils/ },
  { width: 1024, theme: 'LightVim', language: 'en', category: /Cast acrylic/ },
  { width: 1440, theme: 'HighContrast', language: 'en', category: /Cast acrylic/ }
]) {
  test(`profile and material menu fit ${scenario.width}px in ${scenario.theme}/${scenario.language}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await page.emulateMedia({ colorScheme: scenario.theme === 'LightVim' ? 'dark' : 'light' });
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(scenario.theme);
    await page.getByLabel('Language', { exact: true }).selectOption(scenario.language);
    const row = page.locator('.face-material-entry').first();
    await row.locator('.select-trigger').click();
    await row.getByRole('button', { name: scenario.category }).click();
    await expect(row.locator('.option')).toHaveCount(2);
    const widths = await page.evaluate(() => {
      const menu = document.querySelector('.face-material-entry .dropdown')!;
      const options = menu.querySelector('.options-list')!;
      return {
        document: document.documentElement.scrollWidth, viewport: window.innerWidth,
        menu: menu.getBoundingClientRect().width, options: options.scrollWidth,
        optionsClient: options.clientWidth
      };
    });
    await page.screenshot({ path: testInfo.outputPath(`profile-${scenario.width}-${scenario.theme}.png`), fullPage: true });
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.options).toBeLessThanOrEqual(widths.optionsClient + 1);
  });
}
