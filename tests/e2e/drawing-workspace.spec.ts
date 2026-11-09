import { expect, test, type Page } from '@playwright/test';

async function scene(page: Page) { return page.evaluate(() => (window as any).__drawingFixture.inspect()); }
async function drawRectangle(page: Page) {
  await page.getByTestId('drawing-tool-rectangle').click();
  const canvas = await page.locator('.drawing-viewport').boundingBox();
  if (!canvas) throw new Error('Drawing viewport missing');
  await page.mouse.move(canvas.x + 60, canvas.y + 80); await page.mouse.down();
  await page.mouse.move(canvas.x + 200, canvas.y + 180, { steps: 10 }); await page.mouse.up();
  await page.getByTestId('drawing-tool-select').click();
  const box = (await scene(page)).shapes.find((shape: any) => shape.type === 'geo');
  await expect.poll(async () => (await scene(page)).shapes.filter((s: any) => s.type === 'geo').length).toBe(1);
  // Pick through the canvas, not a fixture mutation.
  await page.mouse.click(canvas.x + 130, canvas.y + 130);
  await expect.poll(async () => (await scene(page)).selected.length).toBe(1);
}

for (const mode of ['idea', 'order']) {
  test(`${mode} uses shared drawing controls, numeric history and readonly guards`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto(`/drawing-workspace.html?mode=${mode}`);
    await expect(page.getByTestId('drawing-tool-rectangle')).toBeVisible();
    if (mode === 'order') await expect.poll(async () => (await scene(page)).shapes.some((s: any) => s.type === 'order-details')).toBe(true);
    await page.evaluate(() => (window as any).__drawingFixture.emptyArea());
    await drawRectangle(page);
    await page.getByTestId('drawing-colour-red').click();
    await page.getByTestId('drawing-style-fill').selectOption('solid');
    await expect.poll(async () => (await scene(page)).shapes.find((s: any) => s.type === 'geo').props.fill).toBe('solid');
    const width = page.getByRole('spinbutton', { name: 'Width', exact: true });
    const before = Number(await width.inputValue());
    await width.fill('280'); await width.press('Escape');
    await expect(width).toHaveValue(String(before));
    await width.fill('280'); await width.press('Enter');
    await expect.poll(async () => (await scene(page)).shapes.find((s: any) => s.type === 'geo').props.w).toBeCloseTo(280);
    await page.getByTestId('drawing-undo').click();
    await expect.poll(async () => (await scene(page)).shapes.find((s: any) => s.type === 'geo').props.w).toBeCloseTo(before);
    await page.getByTestId('drawing-redo').click();
    await page.getByTestId('drawing-objects-toggle').click();
    const row = page.getByTestId('drawing-object-row').filter({ hasText: 'rectangle' });
    await row.getByRole('button', { name: 'Lock object', exact: true }).click();
    await expect(width).toBeDisabled();
    await row.getByRole('button', { name: 'Unlock object', exact: true }).click();
    await expect(width).toBeEnabled();
    const beforeReadonly = JSON.stringify((await scene(page)).shapes);
    await page.getByRole('button', { name: 'Toggle read only' }).click();
    await expect(page.getByTestId('drawing-tool-draw')).toBeDisabled();
    await expect(page.getByTestId('drawing-colour-red')).toBeDisabled();
    await expect(page.getByTestId('drawing-undo')).toBeDisabled();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect(JSON.stringify((await scene(page)).shapes)).toBe(beforeReadonly);
    if (mode === 'order') expect((await scene(page)).shapes.some((s: any) => s.type === 'order-details')).toBe(true);
  });
  test(`${mode} compact layout retains viewport and translated controls`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/drawing-workspace.html?mode=${mode}`);
    await expect(page.getByTestId('drawing-tool-select')).toBeVisible();
    const before = await page.locator('.drawing-viewport').boundingBox();
    await page.getByTestId('drawing-properties-toggle').click();
    await expect(page.getByRole('tabpanel', { name: 'Properties' })).toBeVisible();
    const after = await page.locator('.drawing-viewport').boundingBox();
    expect(after?.width).toBe(before?.width);
    await page.getByRole('button', { name: 'Close panel' }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('ru');
    await expect(page.getByTestId('drawing-properties-toggle')).toHaveAttribute('aria-label', 'Свойства');
    await expect(page.getByTestId('drawing-colour-red')).toHaveAttribute('aria-label', 'Цвет объекта: Красный');
    await page.getByLabel('Theme', { exact: true }).selectOption('DarkVim');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
