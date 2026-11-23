import { expect, test, type Page } from '@playwright/test';

async function scene(page: Page) { return page.evaluate(() => (window as any).__drawingFixture.inspect()); }
async function open(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}`);
  await expect(page.getByTestId('drawing-tool-rectangle')).toBeVisible();
  if (mode === 'order') await expect.poll(async () => (await scene(page)).shapes.some((s: any) => s.type === 'order-details')).toBe(true);
  await page.evaluate(() => (window as any).__drawingFixture.emptyArea());
}
async function drawWith(page: Page, key: string) {
  const canvas = await page.locator('.drawing-viewport').boundingBox();
  if (!canvas) throw new Error('Drawing viewport missing');
  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click(canvas.x + 40, canvas.y + canvas.height - 40);
  await page.keyboard.press(key);
  await page.mouse.move(canvas.x + 60, canvas.y + 80); await page.mouse.down();
  await page.mouse.move(canvas.x + 200, canvas.y + 180, { steps: 10 }); await page.mouse.up();
}

for (const mode of ['idea', 'order']) {
  test(`${mode} menu bar follows desktop order and Object flyouts list keys`, async ({ page }) => {
    await open(page, mode);
    await expect(page.locator('[data-drawing-menu] > summary')).toHaveText(['File', 'Edit', 'View', 'Layout', 'Object', 'Effects', 'Bitmaps', 'Text', 'Tools', 'Window', 'Help']);
    await page.locator('[data-drawing-menu="object"] > summary').click();
    const order = page.locator('[data-drawing-submenu="order"]');
    await order.locator('> summary').hover();
    await expect(order.getByRole('button', { name: 'To front', exact: true })).toBeVisible();
    await expect(order.getByRole('button', { name: 'To front', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+Home Meta+Home');
    const box = await order.locator('.drawing-submenu-popover').boundingBox();
    expect(box && box.x + box.width <= 1440).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.drawing-menu[open]')).toHaveCount(0);
  });

  test(`${mode} Quick access finds and runs a command in the current language`, async ({ page }) => {
    await open(page, mode);
    await page.getByTestId('drawing-quick-trigger').click();
    const quick = page.getByTestId('drawing-quick-access');
    await expect(quick).toBeVisible();
    await page.getByTestId('drawing-quick-input').fill('rulers');
    await expect(quick.getByRole('option').first()).toContainText('Rulers');
    await page.keyboard.press('Enter');
    await expect(quick).toHaveCount(0);
    await expect(page.getByTestId('drawing-workspace')).toHaveClass(/no-rulers/);
    await page.getByTestId('drawing-standard-rulers').click();
    await expect(page.getByTestId('drawing-workspace')).not.toHaveClass(/no-rulers/);
    await page.locator('.drawing-viewport').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('F1');
    await expect(page.getByTestId('drawing-shortcut-sheet')).toContainText('Convert to curves');
    await page.keyboard.press('Escape');
    await expect(quick).toHaveCount(0);
  });

  test(`${mode} polygon key, status wells and the no-colour well`, async ({ page }) => {
    await open(page, mode);
    await drawWith(page, 'y');
    await expect.poll(async () => (await scene(page)).shapes.filter((s: any) => s.type === 'geo' && s.props.geo === 'pentagon').length).toBe(1);
    await expect(page.getByTestId('drawing-status-object')).toContainText('Polygon');
    await page.getByTestId('drawing-colour-red').click();
    await expect(page.getByTestId('drawing-status-outline')).toHaveAttribute('aria-label', /Outline: #/);
    await page.getByTestId('drawing-style-fill').selectOption('solid').catch(() => undefined);
    await page.getByTestId('drawing-colour-none').click();
    await expect.poll(async () => (await scene(page)).shapes.find((s: any) => s.type === 'geo').props.fill).toBe('none');
    await expect(page.getByTestId('drawing-status-fill')).toHaveAttribute('aria-label', 'Fill: No fill');
  });

  test(`${mode} Ctrl+E opens export settings and toolbox flyouts expose new tools`, async ({ page }) => {
    await open(page, mode);
    await page.locator('.drawing-viewport').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('Control+e');
    await expect(page.locator('[data-drawing-menu="file"]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-drawing-menu="file"] .drawing-export-options select').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByTestId('drawing-tools-hand').click();
    await page.getByTestId('drawing-flyout-zoom').click();
    await expect(page.getByTestId('drawing-tool-zoom')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('drawing-tools-effects').click();
    await page.getByTestId('drawing-flyout-fx-repeat').click();
    await expect(page.getByTestId('drawing-arrange-task')).toHaveValue('repeat');
  });

  test(`${mode} File menu opens the DXF review and cut order tools`, async ({ page }) => {
    await open(page, mode);
    await page.locator('[data-drawing-menu="file"] > summary').click();
    await page.getByRole('button', { name: 'Review and export DXF' }).click();
    await expect(page.getByTestId('drawing-cad-task')).toHaveValue('files');
    await expect(page.getByTestId('drawing-cad-cut-order')).toBeVisible();
  });
}

async function rectangleAt(page: Page) {
  const canvas = await page.locator('.drawing-viewport').boundingBox();
  if (!canvas) throw new Error('Drawing viewport missing');
  await drawWith(page, 'F6');
  await expect.poll(async () => (await scene(page)).shapes.filter((s: any) => s.type === 'geo').length).toBe(1);
  return canvas;
}
const geos = async (page: Page) => (await scene(page)).shapes.filter((s: any) => s.type === 'geo');

for (const mode of ['idea', 'order']) {
  test(`${mode} desktop rhythm: Space tap, + in place, Ctrl+R, Tab and the key toast`, async ({ page }) => {
    await open(page, mode);
    const canvas = await rectangleAt(page);
    await page.keyboard.press('F7');
    await expect(page.getByTestId('drawing-key-hud')).toContainText('F7');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await scene(page)).tool).toBe('select');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await scene(page)).tool).toBe('geo');
    await expect(page.getByTestId('drawing-tool-ellipse')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.getByTestId('drawing-tool-select').click();
    await page.mouse.click(canvas.x + 60, canvas.y + 80);
    await expect.poll(async () => (await scene(page)).selected.length).toBe(1);
    await page.keyboard.press('+');
    await expect.poll(async () => (await geos(page)).length).toBe(2);
    const [a, b] = await geos(page);
    expect([a.x, a.y]).toEqual([b.x, b.y]);
    await page.keyboard.press('Control+r');
    await expect.poll(async () => (await geos(page)).length).toBe(3);
    await expect(page.getByTestId('drawing-key-hud')).toContainText('Duplicate in place');
    const first = (await scene(page)).selected[0];
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await scene(page)).selected[0]).not.toBe(first);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(async () => (await scene(page)).selected[0]).toBe(first);
  });

  test(`${mode} second click returns to Pick, double-click edits the label`, async ({ page }) => {
    await open(page, mode);
    const canvas = await rectangleAt(page);
    const centre = { x: canvas.x + 130, y: canvas.y + 130 };
    await page.getByTestId('drawing-tool-select').click();
    await page.mouse.click(centre.x, centre.y);
    await page.waitForTimeout(600);
    await page.mouse.click(centre.x, centre.y);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as any).__drawingFixture.inspect().tool)).toBe('select');
    await expect(page.locator('.drawing-viewport textarea.tl-text-input')).toHaveCount(0);
    await page.keyboard.press('+');
    await expect.poll(async () => (await geos(page)).length).toBe(2);
    await page.keyboard.press('Control+z');
    await page.mouse.dblclick(centre.x, centre.y);
    await page.keyboard.type('OK');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await geos(page)).some((s: any) => s.props.text === 'OK')).toBe(true);
  });
}

test('P centres on the page and double-clicking Rectangle draws the page frame', async ({ page }) => {
  await open(page, 'idea');
  await page.locator('[data-drawing-menu="tools"] > summary').click();
  await page.locator('[data-drawing-menu="tools"]').getByRole('button', { name: 'Page setup', exact: true }).click();
  const setup = page.getByTestId('drawing-page-setup');
  await setup.getByLabel('Size preset', { exact: true }).selectOption('A4');
  await setup.getByRole('button', { name: 'Apply page setup', exact: true }).click();
  await page.locator('[data-drawing-menu="view"] > summary').click();
  await page.locator('[data-drawing-menu="view"] [data-command="fitPage"]').click();
  await drawWith(page, 'F6');
  const shape = (await geos(page))[0];
  await page.keyboard.press('p');
  await expect.poll(async () => {
    const bounds = await page.evaluate((id: string) => (window as any).__drawingFixture.bounds(id), shape.id);
    return [Math.round(bounds.x + bounds.w / 2), Math.round(bounds.y + bounds.h / 2)];
  }).toEqual([Math.round(210 / 25.4 * 48), Math.round(297 / 25.4 * 48)]);
  await page.getByTestId('drawing-tool-rectangle').dblclick();
  await expect.poll(async () => (await geos(page)).length).toBe(2);
  const frame = (await geos(page))[1];
  const bounds = await page.evaluate((id: string) => (window as any).__drawingFixture.bounds(id), frame.id);
  expect([Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.w), Math.round(bounds.h)]).toEqual([0, 0, Math.round(210 / 25.4 * 96), Math.round(297 / 25.4 * 96)]);
});

test('motion plays with normal settings and stays still with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, 'idea');
  await page.getByTestId('drawing-tools-shapes').click();
  expect(await page.evaluate(() => document.querySelector('.drawing-tool-flyout')!.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('drawing-objects-toggle').click();
  expect(await page.evaluate(() => document.querySelector('.drawing-docker')!.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(400); // let the slides started above finish
  await page.getByTestId('drawing-tools-shapes').click();
  expect(await page.evaluate(() => document.querySelector('.drawing-tool-flyout')!.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('drawing-properties-toggle').click();
  expect(await page.evaluate(() => document.querySelector('.drawing-docker')!.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
});
