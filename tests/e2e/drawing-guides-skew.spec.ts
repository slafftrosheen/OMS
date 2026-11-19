import { expect, test, type Locator, type Page } from '@playwright/test';

const scene = (page: Page) => page.evaluate(() => (window as any).__drawingFixture.inspect());
const guides = async (page: Page) => (await scene(page)).page.meta.omsGuides?.guides ?? [];
const artwork = async (page: Page) => (await scene(page)).shapes.filter((shape: any) => shape.id.startsWith('shape:corel-')).sort((a: any, b: any) => a.id.localeCompare(b.id));
async function center(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('The drawing control has no visible bounds');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function pick(page: Page, id = 'shape:corel-a') {
  // Order forms begin at page x=24 and own native input hits. Use the filled
  // left strip of Letter A (x=8), outside the form underneath its artwork.
  const point = await page.evaluate(id => (window as any).__drawingFixture.point(id, .05, .2), id);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await scene(page)).selected).toEqual([id]);
}
async function load(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing=1`);
  await page.getByTestId('drawing-tool-select').waitFor();
  await page.getByRole('button', { name: 'Load Corel editing example', exact: true }).click();
  await expect.poll(async () => (await artwork(page)).length).toBe(3);
}

for (const mode of ['idea', 'order']) {
  test(`${mode} ruler guidelines preview without writes and undo in one step`, async ({ page }) => {
    await load(page, mode);
    const before = await artwork(page);
    const viewport = await page.getByTestId('drawing-workspace').locator('.tl-canvas').boundingBox();
    if (!viewport) throw new Error('Missing drawing viewport');
    const target = { x: Math.round(viewport.x + viewport.width * .48), y: Math.round(viewport.y + viewport.height * .72) };
    const expected = await page.evaluate(point => (window as any).__drawingFixture.screenPoint(point), target);
    const ruler = await center(page.getByTestId('drawing-ruler-horizontal'));
    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    // A horizontal SVG line has a zero-height geometric box, so Playwright's
    // positive-area visibility check does not describe whether its stroke draws.
    const preview = page.getByTestId('drawing-guide-preview');
    await expect(preview).toHaveCount(1);
    await expect.poll(async () => Number(await preview.getAttribute('y1'))).toBeCloseTo(expected.y, 4);
    expect(await guides(page)).toEqual([]);
    expect(await artwork(page)).toEqual(before);
    await page.mouse.up();
    await expect.poll(async () => (await guides(page)).length).toBe(1);
    const [guide] = await guides(page);
    expect(guide.axis).toBe('y');
    expect(guide.position).toBeCloseTo(expected.y, 4);
    expect(await artwork(page)).toEqual(before);
    await expect(page.getByTestId('drawing-guide-overlay').locator('[data-guide-id]')).toHaveCount(1);
    await page.getByTestId('drawing-undo').click();
    expect(await guides(page)).toEqual([]);
    expect(await artwork(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click();
    expect(await guides(page)).toEqual([guide]);
  });

  test(`${mode} numeric guidelines align artwork and retain locks after reload`, async ({ page }) => {
    await load(page, mode);
    await pick(page);
    const before = await artwork(page);
    await page.getByTestId('drawing-guides-toggle').click();
    await page.getByTestId('drawing-guide-add-axis').selectOption('x');
    await page.getByTestId('drawing-guide-add-position').fill('50');
    await page.getByTestId('drawing-guide-add').click();
    const [guide] = await guides(page);
    expect(guide.axis).toBe('x');
    await expect(page.getByTestId('drawing-guide-align-start')).toBeEnabled();
    await page.getByTestId('drawing-guide-align-start').click();
    const bounds = await page.evaluate(() => (window as any).__drawingFixture.bounds('shape:corel-a'));
    expect(bounds.x).toBeCloseTo(guide.position, 5);
    await page.getByTestId('drawing-undo').click();
    expect(await artwork(page)).toEqual(before);
    expect(await guides(page)).toEqual([guide]);
    await page.getByTestId('drawing-guide-locked').check();
    await expect(page.getByTestId('drawing-guide-move-position')).toBeDisabled();
    await expect(page.getByTestId('drawing-guide-delete')).toBeDisabled();
    const saved = await guides(page);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(await guides(page)).toEqual(saved);
    expect(await artwork(page)).toEqual(before);
    await page.getByRole('button', { name: 'Toggle read only', exact: true }).click();
    await expect(page.getByTestId('drawing-guide-add')).toBeDisabled();
    await expect(page.getByTestId('drawing-guides-visible')).toBeDisabled();
    if (mode === 'order') expect((await scene(page)).shapes.some((shape: any) => shape.type === 'order-details')).toBe(true);
  });

  test(`${mode} Pick skew previews exact curves and commits a single undo`, async ({ page }) => {
    await load(page, mode);
    await pick(page);
    const before = await artwork(page);
    await page.getByTestId('drawing-skew-mode').click();
    const handle = await center(page.getByTestId('drawing-skew-handle-top'));
    const opposite = await center(page.getByTestId('drawing-skew-handle-bottom'));
    const delta = Math.abs(opposite.y - handle.y) * Math.tan(18 * Math.PI / 180);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + delta, handle.y, { steps: 8 });
    await expect(page.getByTestId('drawing-pick-skew-preview')).toBeVisible();
    expect(await artwork(page)).toEqual(before);
    await page.keyboard.down('Shift');
    await expect(page.getByTestId('drawing-pick-skew-angle')).toContainText('15');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('drawing-pick-skew-preview')).not.toBeVisible();
    const after = await artwork(page);
    expect(after[0].props.contours).not.toEqual(before[0].props.contours);
    expect(after[0].props.contours).toHaveLength(2);
    expect(after[0].meta).toEqual(before[0].meta);
    expect(after.slice(1)).toEqual(before.slice(1));
    await page.getByTestId('drawing-undo').click();
    expect(await artwork(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click();
    expect(await artwork(page)).toEqual(after);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(await artwork(page)).toEqual(after);
  });

  test(`${mode} Pick skew Escape and read-only changes discard the preview`, async ({ page }) => {
    await load(page, mode);
    await pick(page);
    const before = await artwork(page);
    await page.getByTestId('drawing-skew-mode').click();
    const handle = await center(page.getByTestId('drawing-skew-handle-right'));
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x, handle.y - 45, { steps: 8 });
    await expect(page.getByTestId('drawing-pick-skew-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId('drawing-pick-skew-preview')).not.toBeVisible();
    expect(await artwork(page)).toEqual(before);
    const nextHandle = await center(page.getByTestId('drawing-skew-handle-right'));
    await page.mouse.move(nextHandle.x, nextHandle.y);
    await page.mouse.down();
    await page.mouse.move(nextHandle.x, nextHandle.y - 45, { steps: 8 });
    await expect(page.getByTestId('drawing-pick-skew-preview')).toBeVisible();
    // Permission can change externally while the pointer is still captured.
    await page.getByRole('button', { name: 'Toggle read only', exact: true }).dispatchEvent('click');
    await expect(page.getByTestId('drawing-pick-skew')).not.toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('drawing-skew-mode')).toBeDisabled();
    expect(await artwork(page)).toEqual(before);
  });
}
