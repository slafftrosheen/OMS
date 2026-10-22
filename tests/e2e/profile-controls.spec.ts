import { test, expect, type Page } from '@playwright/test';

let runtimeErrors: string[];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('**/api/colors**', route => route.fulfill({ json: [
    { id: 1, code: '9010', name: 'Pure white', hexValue: '#F1EDE1', systemType: 'RAL' },
    { id: 2, code: '9005', name: 'Jet black', hexValue: '#0E0E10', systemType: 'RAL' }
  ] }));
  await page.route('**/api/materials**', route => route.fulfill({ json: [
    { id: 1, code: 'TEST_ALU', name: { en: 'Test aluminum' }, metadata: {}, thicknessOptions: [2, 3] }
  ] }));
  await page.route('**/api/profiles/templates', route => route.fulfill({ json: [
    { code: 'P7st', name: 'Profile 7st', description: 'Fixture profile' }
  ] }));
  await page.goto('/profile-controls.html');
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors).toEqual([]);
  await expect(page.getByTestId('submission-count')).toHaveText('0');
});

async function value(page: Page, testId: string) {
  return JSON.parse(await page.getByTestId(testId).innerText());
}

test('profile field labels target unique controls and groups expose their selected state', async ({ page }) => {
  const fields = page.getByRole('region', { name: 'Field labels' });
  await expect(fields.getByLabel('Finish', { exact: true })).toHaveCount(2);
  const associations = await fields.locator('label[for]').evaluateAll(labels => labels.map(label => {
    const control = (label as HTMLLabelElement).control;
    return { for: label.getAttribute('for'), valid: !!control, id: control?.id };
  }));
  expect(associations.every(item => item.valid && item.id === item.for)).toBe(true);
  expect(new Set(associations.map(item => item.id)).size).toBe(associations.length);
  await fields.locator('label').filter({ hasText: 'Return depth' }).click();
  await expect(fields.getByLabel('Return depth', { exact: true })).toBeFocused();
  await fields.locator('label').filter({ hasText: 'Illuminated' }).click();
  await expect(fields.getByRole('switch', { name: 'Illuminated' })).toBeChecked();
  await fields.getByLabel('Back material', { exact: true }).selectOption('PVC');
  await expect(fields.getByLabel('Back material', { exact: true })).toHaveValue('PVC');
  await expect(fields.getByRole('group', { name: 'Panel dimensions' })).toBeVisible();
  await expect(fields.getByLabel('Width', { exact: true })).toHaveValue('10');
  await expect(page.getByRole('group', { name: 'Light modules', exact: true }).getByRole('button', { pressed: true })).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Order color', exact: true })).toBeVisible();
  await fields.getByLabel('Profile Type', { exact: false }).click();
  await fields.getByRole('button', { name: /Profile 7st/ }).click();
  await expect(fields.getByLabel('Profile Type', { exact: false })).toContainText('P7st');
});

test('compact color modes, search and clear remain reactive and separately keyboard operable', async ({ page }) => {
  const compact = page.getByRole('region', { name: 'Compact colors' });
  const trigger = compact.locator('.picker-trigger');
  await expect(compact.locator('button button')).toHaveCount(0);
  await trigger.click();
  await compact.getByRole('button', { name: 'ORACAL', exact: true }).click();
  await compact.getByRole('textbox', { name: 'Search', exact: true }).fill('010');
  await expect(compact.locator('.color-swatch')).toHaveCount(1);
  await compact.locator('.color-swatch').click();
  expect(await value(page, 'compact-value')).toMatchObject({ system: 'ORACAL', code: '010', hex: '#FFFFFF' });
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(compact.getByRole('button', { name: 'Remove Surface 010' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await value(page, 'compact-value')).toEqual({ system: '', code: '', hex: '' });
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await compact.getByRole('button', { name: 'PANTONE', exact: true }).click();
  await compact.getByRole('textbox', { name: 'Search', exact: true }).fill('Reflex Blue');
  await expect(compact.locator('.color-swatch')).toHaveCount(1);
  await compact.locator('.color-swatch').click();
  expect(await value(page, 'compact-value')).toMatchObject({ system: 'PANTONE', code: 'Reflex Blue', hex: '#001489' });
  await page.getByLabel('Language').selectOption('ru');
  await expect(compact.getByRole('button', { name: 'Убрать Surface Reflex Blue' })).toBeVisible();
  await page.getByLabel('Language').selectOption('lv');
  await expect(compact.getByRole('button', { name: 'Noņemt Surface Reflex Blue' })).toBeVisible();
  await trigger.click();
  await compact.getByRole('textbox').press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Toggle disabled controls' }).click();
  await expect(trigger).toBeDisabled();
  await expect(compact.locator('.clear-btn')).toHaveCount(0);
});

test('external resets clear color previews, chip states and request selection without stale local copies', async ({ page }) => {
  const ral = page.getByRole('region', { name: 'RAL colors' });
  await expect(ral.locator('.selected-color')).toContainText('9010');
  await expect(ral.locator('button button')).toHaveCount(0);
  await ral.getByRole('button', { name: 'Remove Coating 9010' }).focus();
  await page.keyboard.press('Enter');
  await expect(ral.locator('.selected-color')).toHaveCount(0);
  await expect(ral.getByLabel('Coating', { exact: true })).toBeFocused();
  await ral.getByLabel('Coating', { exact: true }).click();
  await ral.getByRole('textbox', { name: 'Coating · Search' }).fill('black');
  await ral.locator('.color-item').click();
  await expect(page.getByTestId('ral-value')).toHaveText('9005');
  await page.getByRole('group', { name: 'Direction', exact: true }).getByRole('button', { name: 'Right' }).click();
  await expect(page.getByRole('group', { name: 'Direction', exact: true }).getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset external selections' }).click();
  await expect(ral.locator('.selected-color')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Direction', exact: true }).getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Light modules', exact: true }).getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Mounts', exact: true }).getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Trim color', exact: true }).locator('.selected-preview')).toHaveCount(0);
  await expect(page.getByRole('group', { name: /Film color/ }).locator('.selected-preview')).toHaveCount(0);
  await expect(page.getByLabel('Film codes 1', { exact: true })).toHaveValue('8500-070');
  await expect(page.getByLabel('Catalog material', { exact: true })).toContainText('Select material');
  await expect(page.getByRole('region', { name: 'Change request selection' }).getByRole('button', { pressed: true })).toHaveCount(0);
  await page.getByRole('group', { name: 'Light modules', exact: true }).getByRole('button', { name: 'Warm' }).click();
  await expect(page.getByRole('group', { name: 'Light modules', exact: true }).getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
});

test('inventory color entry switches modes and saves only the active code and finish', async ({ page }) => {
  const inventory = page.getByRole('region', { name: 'Inventory color entry' });
  await inventory.getByLabel('RAL Code', { exact: true }).fill('RAL 9010');
  await inventory.getByRole('button', { name: 'Pantone', exact: true }).click();
  await expect(inventory.getByLabel('RAL Code', { exact: true })).toHaveCount(0);
  await inventory.getByLabel('Pantone Code', { exact: true }).fill('Pantone 185 C');
  await inventory.getByRole('combobox', { name: 'Finish Type', exact: true }).selectOption('GLOSS');
  await inventory.getByRole('button', { name: 'Add Color', exact: true }).click();
  const pantone = await value(page, 'inventory-value');
  expect(pantone).toMatchObject({ name: 'PANTONE Pantone 185 C', pantoneCode: 'Pantone 185 C', finishType: 'GLOSS' });
  expect(pantone.ralCode).toBeUndefined();
  await inventory.getByRole('button', { name: 'HEX', exact: true }).click();
  await inventory.getByLabel('HEX Value', { exact: true }).fill('112233');
  await expect(inventory.locator('.color-preview')).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await inventory.getByRole('button', { name: 'Add Color', exact: true }).click();
  const hex = await value(page, 'inventory-value');
  expect(hex).toMatchObject({ name: 'HEX 112233', hexValue: '112233', finishType: 'GLOSS' });
  expect(hex.pantoneCode).toBeUndefined();
  await inventory.getByRole('button', { name: 'Custom', exact: true }).click();
  await inventory.getByLabel('Custom Color Name', { exact: true }).fill('Workshop blue');
  await inventory.getByRole('button', { name: 'Add Color', exact: true }).click();
  expect(await value(page, 'inventory-value')).toMatchObject({ name: 'Workshop blue', isCustom: true });
  await page.screenshot({ path: test.info().outputPath('profile-controls.png'), fullPage: true });
});

test('ORACAL labels and editable codes retain readable contrast on their actual swatch backgrounds', async ({ page }) => {
  const film = page.getByRole('group', { name: /Film color/ });
  const code = page.getByLabel('Film codes 1', { exact: true });
  await expect(code).toHaveValue('8500-031');

  // Check the painted child text, not just a color declaration on its parent.
  const luminance = (rgb: string) => {
    const channels = rgb.match(/^rgb\((\d+), (\d+), (\d+)\)$/)?.slice(1).map(Number);
    if (!channels) throw new Error(`Expected an opaque sRGB swatch, received ${rgb}`);
    const linear = channels.map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const contrast = (foreground: string, background: string) => {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  for (const theme of ['LightVim', 'DarkVim', 'HighContrastVim']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    const swatches = await film.locator('.color-item').evaluateAll(buttons => buttons.map(button => ({
      title: button.getAttribute('title'),
      background: getComputedStyle(button).backgroundColor,
      code: getComputedStyle(button.querySelector('.color-code')!).color,
      name: getComputedStyle(button.querySelector('.color-name')!).color
    })));
    expect(swatches).toHaveLength(38);
    for (const swatch of swatches) {
      expect(contrast(swatch.code, swatch.background), `${theme}: ${swatch.title} code`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(swatch.name, swatch.background), `${theme}: ${swatch.title} name`).toBeGreaterThanOrEqual(4.5);
    }
    await expect(film.getByTitle('Ivory (933)', { exact: true }).locator('.color-code')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(film.getByTitle('Dark Blue (060)', { exact: true }).locator('.color-code')).toHaveCSS('color', 'rgb(255, 255, 255)');
    for (const swatch of [
      { code: '031', name: 'Red', background: 'rgb(230, 0, 0)', text: 'rgb(255, 255, 255)' },
      { code: '933', name: 'Ivory', background: 'rgb(255, 255, 240)', text: 'rgb(0, 0, 0)' },
      { code: '060', name: 'Dark Blue', background: 'rgb(0, 48, 135)', text: 'rgb(255, 255, 255)' }
    ]) {
      await film.getByTitle(`${swatch.name} (${swatch.code})`, { exact: true }).click();
      await expect(film.locator('.preview-code')).toHaveText(swatch.code);
      await expect(film.locator('.preview-code')).toHaveCSS('color', swatch.text);
      await expect(film.locator('.preview-box')).toHaveCSS('background-color', swatch.background);
      await code.fill(`8500-${swatch.code}`);
      await expect(code).toBeFocused();
      await expect(code).toHaveValue(`8500-${swatch.code}`);
      await expect(code).toHaveCSS('background-color', swatch.background);
      await expect(code).toHaveCSS('color', swatch.text);
      await code.press('Tab');
      await expect(code).toHaveCSS('background-color', swatch.background);
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'LightVim'; });
  await film.getByTitle('Ivory (933)', { exact: true }).click();
  await code.fill('8500-031');
  await code.press('Tab');
  await expect(code).toHaveCSS('background-color', 'rgb(230, 0, 0)');
  await page.screenshot({ path: test.info().outputPath('profile-oracal-contrast.png'), fullPage: true });
});
