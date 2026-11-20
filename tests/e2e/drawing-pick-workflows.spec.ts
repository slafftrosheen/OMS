import { expect, test, type Locator, type Page } from '@playwright/test';

const scene = (page: Page) => page.evaluate(() => (window as any).__drawingFixture.inspect());
const artwork = async (page: Page) => (await scene(page)).shapes.filter((shape: any) => shape.id.startsWith('shape:corel-')).sort((a: any, b: any) => a.id.localeCompare(b.id));
const screenPoint = (page: Page, point: { x: number; y: number }) => page.evaluate(point => (window as any).__drawingFixture.pagePoint(point), point);
async function center(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('Missing drawing control');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function pick(page: Page) {
  // This point stays outside the Order form, which begins at page x=24.
  const point = await page.evaluate(() => (window as any).__drawingFixture.point('shape:corel-a', .05, .2));
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await scene(page)).selected).toEqual(['shape:corel-a']);
}
async function load(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing=1`);
  await page.getByTestId('drawing-tool-select').waitFor();
  await page.getByRole('button', { name: 'Load Corel editing example', exact: true }).click();
}

for (const mode of ['idea', 'order']) {
  test(`${mode} ordinary repeated Pick clicks switch handles without editing artwork`, async ({ page }) => {
    await load(page, mode);
    const before = await artwork(page);
    await pick(page);
    await expect(page.getByTestId('drawing-skew-mode')).toHaveAttribute('aria-pressed', 'false');
    // A deliberate ordinary repeat, outside the native double-click interval.
    await page.waitForTimeout((await scene(page)).doubleClickDurationMs + 40);
    await pick(page);
    await expect(page.getByTestId('drawing-skew-mode')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('drawing-skew-handle-top')).toBeVisible();
    await expect(page.getByTestId('drawing-rotation-pivot')).toBeVisible();
    await pick(page);
    await expect(page.getByTestId('drawing-skew-mode')).toHaveAttribute('aria-pressed', 'false');
    expect(await artwork(page)).toEqual(before);
  });

  test(`${mode} moved rotation center previews a quarter turn with one undo`, async ({ page }) => {
    await load(page, mode); await pick(page);
    await page.getByTestId('drawing-skew-mode').click();
    const before = await artwork(page), handle = page.getByTestId('drawing-rotation-pivot');
    const initial = await center(handle), target = { x: initial.x - 90, y: initial.y - 65 };
    await page.mouse.move(initial.x, initial.y); await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    expect(await artwork(page)).toEqual(before);
    await page.mouse.up();
    await expect(handle).toHaveAttribute('data-custom', 'true');
    const pivot = { x: Number(await handle.getAttribute('data-page-x')), y: Number(await handle.getAttribute('data-page-y')) };
    const pivotScreen = await screenPoint(page, pivot);
    const corner = await center(page.locator('[data-drawing-rotate-corner="top_right_rotate"]'));
    const end = { x: pivotScreen.x - (corner.y - pivotScreen.y), y: pivotScreen.y + (corner.x - pivotScreen.x) };
    await page.mouse.move(corner.x, corner.y); await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await expect(page.getByTestId('drawing-pivot-rotation-preview')).toBeVisible();
    expect(await artwork(page)).toEqual(before);
    await page.mouse.up(); await page.keyboard.up('Control');
    const after = await artwork(page);
    expect(after[0].x).toBeCloseTo(pivot.x + pivot.y, 5);
    expect(after[0].y).toBeCloseTo(pivot.y - pivot.x, 5);
    expect(after[0].rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(after[0].props).toEqual(before[0].props);
    expect(after[0].meta).toEqual(before[0].meta);
    expect(after.slice(1)).toEqual(before.slice(1));
    await page.getByTestId('drawing-undo').click();
    expect(await artwork(page)).toEqual(before);
    await handle.dblclick();
    await expect(handle).toHaveAttribute('data-custom', 'false');
  });

  test(`${mode} ordinary Pick dragging snaps an edge to a guideline and reloads`, async ({ page }) => {
    await load(page, mode); await pick(page);
    await page.getByTestId('drawing-guides-toggle').click();
    await page.getByTestId('drawing-guide-add-axis').selectOption('x');
    await page.getByTestId('drawing-guide-add-position').fill('80');
    await page.getByTestId('drawing-guide-add').click();
    const guide = (await scene(page)).page.meta.omsGuides.guides[0];
    await page.getByTestId('drawing-status-snap-options').click();
    await page.getByTestId('drawing-snap-master').check();
    await page.getByTestId('drawing-snap-guidelines').check();
    await page.getByTestId('drawing-snap-toggle').click();
    const before = await artwork(page);
    const bounds = await page.evaluate(() => (window as any).__drawingFixture.bounds('shape:corel-a'));
    const startPage = { x: bounds.x + bounds.w * .05, y: bounds.y + bounds.h * .2 };
    const start = await screenPoint(page, startPage);
    const exact = await screenPoint(page, { x: startPage.x + guide.position - bounds.x - bounds.w, y: startPage.y });
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(exact.x + 3, exact.y, { steps: 12 });
    // Native snapping is deliberately suspended during fast pointer movement.
    await page.waitForTimeout(200);
    await page.mouse.move(exact.x + 4, exact.y);
    await expect(page.locator('[data-testid="drawing-pick-guide-snap"][data-guide-axis="x"]')).toHaveCount(1);
    await page.mouse.up();
    const moved = await page.evaluate(() => (window as any).__drawingFixture.bounds('shape:corel-a'));
    expect(moved.x + moved.w).toBeCloseTo(guide.position, 5);
    expect(moved.y).toBeCloseTo(bounds.y, 5);
    const after = await artwork(page);
    expect(after.slice(1)).toEqual(before.slice(1));
    await page.getByTestId('drawing-undo').click();
    expect(await artwork(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click();
    expect(await artwork(page)).toEqual(after);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(await artwork(page)).toEqual(after);
  });
}
