import { expect, test, type Page } from '@playwright/test';

const scene = (page: Page) => page.evaluate(() => (window as any).__drawingFixture.inspect());
const artwork = async (page: Page) => (await scene(page)).shapes.filter((shape: any) => shape.id.startsWith('shape:corel-'));
async function pick(page: Page, id: string, button: 'left' | 'right' = 'left') {
  const point = await page.evaluate(id => (window as any).__drawingFixture.point(id), id);
  await page.mouse.click(point.x, point.y, { button });
}
async function load(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing=1`);
  await page.getByTestId('drawing-tool-select').waitFor();
  await page.getByRole('button', { name: 'Load Corel editing example', exact: true }).click();
}

for (const mode of ['idea', 'order']) {
  test(`${mode} context menu edits the clicked object and uses one undo`, async ({ page }) => {
    await load(page, mode);
    await pick(page, 'shape:corel-a', 'right');
    await expect(page.getByTestId('context-menu')).toBeVisible();
    await expect.poll(async () => (await scene(page)).selected).toEqual(['shape:corel-a']);
    const before = await artwork(page);
    await page.getByTestId('context-menu.oms-duplicate').click();
    await expect(page.getByTestId('context-menu')).not.toBeVisible();
    await expect.poll(async () => (await scene(page)).shapes.filter((shape: any) => shape.type === 'cad-bezier').length).toBe(2);
    await page.getByTestId('drawing-undo').click();
    expect(await artwork(page)).toEqual(before);
    expect((await scene(page)).shapes.filter((shape: any) => shape.type === 'cad-bezier')).toHaveLength(1);
    if (mode === 'order') expect((await scene(page)).shapes.some((shape: any) => shape.type === 'order-details')).toBe(true);
  });

  test(`${mode} context keyboard navigation never moves selected artwork`, async ({ page }) => {
    await load(page, mode);
    await pick(page, 'shape:corel-a');
    const before = await artwork(page);
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('context-menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    expect(await artwork(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('context-menu')).not.toBeVisible();
    expect((await scene(page)).selected).toEqual(['shape:corel-a']);
    expect((await scene(page)).tool).toBe('select');
  });

  test(`${mode} relative object order persists and reverses selected slots`, async ({ page }) => {
    await load(page, mode);
    await pick(page, 'shape:corel-a', 'right');
    await page.getByTestId('context-menu-sub-trigger.oms-order').hover();
    await page.getByTestId('context-menu.oms-relative-order').click();
    const reference = page.getByTestId('drawing-object-order-reference');
    await expect(reference).toBeFocused();
    await reference.selectOption('shape:corel-c');
    await page.getByTestId('drawing-object-in-front').click();
    const stack = (shapes: any[]) => shapes.sort((a, b) => a.index.localeCompare(b.index)).map(shape => shape.id);
    expect(stack(await artwork(page))).toEqual(['shape:corel-b', 'shape:corel-c', 'shape:corel-a']);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(stack(await artwork(page))).toEqual(['shape:corel-b', 'shape:corel-c', 'shape:corel-a']);
    const tree = page.getByTestId('drawing-object-tree');
    await tree.getByRole('treeitem', { name: 'Letter A', exact: true }).click();
    await tree.getByRole('treeitem', { name: 'Panel B', exact: true }).click({ modifiers: ['Control'] });
    const unchanged = (await artwork(page)).find((shape: any) => shape.id === 'shape:corel-c');
    await page.getByTestId('drawing-object-reverse-order').click();
    expect(stack(await artwork(page))).toEqual(['shape:corel-a', 'shape:corel-c', 'shape:corel-b']);
    expect((await artwork(page)).find((shape: any) => shape.id === 'shape:corel-c')).toEqual(unchanged);
    await page.getByTestId('drawing-undo').click();
    expect(stack(await artwork(page))).toEqual(['shape:corel-b', 'shape:corel-c', 'shape:corel-a']);
  });

  test(`${mode} skews compound curves with stale preview and read-only guards`, async ({ page }) => {
    await load(page, mode);
    await pick(page, 'shape:corel-a', 'right');
    await page.getByTestId('context-menu-sub-trigger.oms-transform').hover();
    await page.getByTestId('context-menu.oms-transform').click();
    await page.getByTestId('drawing-transform-mode').selectOption('skew');
    const before = (await artwork(page)).find((shape: any) => shape.id === 'shape:corel-a');
    await page.getByTestId('drawing-skew-angle').fill('15');
    await page.getByTestId('drawing-skew-preview').click();
    await page.getByTestId('drawing-skew-angle').fill('25');
    await expect(page.getByTestId('drawing-skew-apply')).toBeDisabled();
    await page.getByTestId('drawing-skew-preview').click();
    await page.getByTestId('drawing-skew-apply').click();
    const after = (await artwork(page)).find((shape: any) => shape.id === before.id);
    expect(after.props.contours).not.toEqual(before.props.contours);
    expect(after.props.contours).toHaveLength(2);
    expect(after.meta.omsVectorPaint).toEqual(before.meta.omsVectorPaint);
    expect(after.parentId).toBe(before.parentId);
    await page.getByTestId('drawing-undo').click();
    expect((await artwork(page)).find((shape: any) => shape.id === before.id)).toEqual(before);
    await page.getByRole('button', { name: 'Toggle read only', exact: true }).click();
    await expect(page.getByTestId('drawing-skew-preview')).toBeDisabled();
    await pick(page, 'shape:corel-a', 'right');
    await expect(page.getByTestId('context-menu.oms-delete')).not.toBeVisible();
    await expect(page.getByTestId('context-menu.oms-properties')).toBeVisible();
  });
}
