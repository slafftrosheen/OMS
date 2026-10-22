import { test, expect, type Page } from '@playwright/test';

const boardId = '7bced6d4-2789-4f76-b8be-10e8b49317b7';

async function mountDock(page: Page) {
  const board: any = {
    id: boardId, title: 'Dock study', revision: 0,
    created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z',
    payload: { version: 1, snapshot: null }
  };
  const errors: string[] = [];
  const previews: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (value: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(value)
    });
    if (path === '/api/toolkit/models') return reply({
      models: [{ id: 'openrouter/free', label: 'Free router', isDefault: true }], web: {}, media: {}
    });
    if (path === '/api/ai/canvas') return reply({ items: [board] });
    if (path === `/api/ai/canvas/${boardId}`) {
      if (request.method() === 'PATCH') { board.payload = request.postDataJSON().payload; board.revision++; }
      return reply({ canvas: board });
    }
    if (path === `/api/toolkit/conversations/${boardId}`) return reply({ messages: [], proposals: [], legacyThreads: {} });
    if (path === `/api/toolkit/assets/${boardId}/library`) return reply({ files: [] });
    if (path === '/api/toolkit/link-preview') {
      const url = request.postDataJSON().url;
      previews.push(url);
      return reply({ url, title: 'Corrected reference', description: 'A retained link draft', siteName: 'Example' });
    }
    return reply({ error: `Unmocked request ${path}` }, 404);
  });
  await page.goto('/canvas-media.html');
  await expect(page.getByRole('button', { name: 'Select / move', exact: true })).toBeEnabled({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Hide assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const shapes = () => Object.values(board.payload.snapshot?.document?.store ?? {})
    .filter((record: any) => record.typeName === 'shape') as any[];
  return { board, shapes, errors, previews };
}

async function more(page: Page) {
  await page.getByRole('button', { name: 'More tools', exact: true }).click();
  return page.getByRole('dialog', { name: 'More tools', exact: true });
}
async function dockAction(page: Page, name: string) {
  const panel = await more(page);
  const label = name === 'Undo' ? 'Undo last canvas edit' : name === 'Redo' ? 'Redo last canvas edit' : name;
  await panel.getByRole('button', { name: label, exact: true }).click();
}
async function drawRectangle(page: Page, x: number, y: number, tool = 'Rectangle') {
  await dockAction(page, tool);
  const bounds = await page.getByTestId('canvas').boundingBox();
  if (!bounds) throw new Error('Canvas not rendered');
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + x + 80, bounds.y + y + 60, { steps: 5 });
  await page.mouse.up();
}
const positions = (shapes: any[]) => shapes.filter(shape => shape.type === 'geo')
  .map(shape => ({ id: shape.id, x: shape.x, y: shape.y })).sort((a, b) => a.id.localeCompare(b.id));

test('the single dock exposes native styles on desktop and mobile without duplicate style panels', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { shapes, errors } = await mountDock(page);
  await dockAction(page, 'Ellipse');
  let panel = await more(page);
  await expect(panel.getByRole('button', { name: 'Ellipse', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Rectangle', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await panel.locator('summary').filter({ hasText: 'Style & appearance' }).click();
  await expect(page.getByTestId('canvas-native-styles')).toBeVisible();
  await expect(page.locator('.tlui-style-panel')).toHaveCount(1);
  await page.getByTestId('style.color.red').click();
  await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
  await expect(page.locator('.tlui-style-panel')).toHaveCount(1);
  const bounds = await page.getByTestId('canvas').boundingBox();
  if (!bounds) throw new Error('Canvas not rendered');
  await page.mouse.move(bounds.x + 80, bounds.y + 90); await page.mouse.down();
  await page.mouse.move(bounds.x + 180, bounds.y + 170, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => shapes().filter(shape => shape.type === 'geo').map(shape => shape.props))
    .toEqual([expect.objectContaining({ geo: 'ellipse', color: 'red' })]);
  await page.getByRole('button', { name: 'Select / move', exact: true }).click();
  await page.mouse.click(bounds.x + 30, bounds.y + 300);
  await page.keyboard.press('ControlOrMeta+a');

  await page.setViewportSize({ width: 320, height: 1000 });
  await expect(page.locator('.tlui-style-panel')).toHaveCount(0);
  panel = await more(page);
  await panel.locator('summary').filter({ hasText: 'Style & appearance' }).click();
  await expect(page.getByTestId('canvas-native-styles')).toBeInViewport();
  await expect(page.locator('.tlui-style-panel')).toHaveCount(1);
  await page.getByTestId('style.color.blue').click();
  await expect.poll(() => shapes().find(shape => shape.type === 'geo')?.props.color).toBe('blue');
  // The same native style property is edited through an in-panel select, so
  // a phone does not need space for a side submenu outside the canvas.
  await page.getByTestId('toolkit-style.geo').selectOption('rectangle');
  await expect(panel).toBeVisible();
  await expect.poll(() => shapes().find(shape => shape.type === 'geo')?.props.geo).toBe('rectangle');
  const panelBounds = await panel.boundingBox();
  const mobileCanvas = await page.getByTestId('canvas').boundingBox();
  expect(panelBounds?.x).toBeGreaterThanOrEqual(0);
  expect((panelBounds?.x ?? 0) + (panelBounds?.width ?? 0)).toBeLessThanOrEqual(320);
  expect(panelBounds?.y).toBeGreaterThanOrEqual(mobileCanvas?.y ?? 0);
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toHaveCount(1);
  await expect(page.locator('.tlui-toolbar')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
  await dockAction(page, 'Undo');
  await expect.poll(() => shapes().find(shape => shape.type === 'geo')?.props.geo).toBe('ellipse');
  expect(shapes().find(shape => shape.type === 'geo')?.props.color).toBe('blue');

  for (const [locale, label, theme] of [['ru', 'Фигура', 'HighContrastVim'], ['lv', 'Figūra', 'DarkVim']]) {
    await page.getByLabel('Language', { exact: true }).selectOption(locale);
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByTestId('canvas-dock').locator('[data-dock-item="5"]').click();
    panel = page.getByRole('dialog');
    await panel.locator('summary').first().click();
    await expect(page.getByTestId('toolkit-style.geo')).toHaveAttribute('aria-label', label);
    await expect(page.getByTestId('toolkit-style.geo')).toHaveValue('ellipse');
    await page.getByTestId('toolkit-style.geo').scrollIntoViewIfNeeded();
    const translatedBounds = await panel.boundingBox();
    expect(translatedBounds?.y).toBeGreaterThanOrEqual((await page.getByTestId('canvas').boundingBox())?.y ?? 0);
    if (locale === 'ru') await page.screenshot({ path: '/tmp/oms-canvas-dock-styles-320.png' });
    // selectOption changes the fixture value without an outside pointer event.
    // Close explicitly instead of assuming a locale/theme change dismissed it.
    await page.getByTestId('toolkit-style.geo').press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByLabel('Language', { exact: true }).selectOption('en');
  await page.getByLabel('Theme', { exact: true }).selectOption('LightVim');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.tlui-style-panel')).toHaveCount(1);
  panel = await more(page);
  await panel.locator('summary').first().click();
  await expect(page.locator('.tlui-style-panel')).toHaveCount(1);
  await expect(page.getByTestId('toolkit-style.geo')).toHaveAttribute('aria-label', 'Shape');
  await page.screenshot({ path: '/tmp/oms-canvas-dock-styles-1440.png' });
  expect(errors).toEqual([]);
});

test('selection alignment, distribution, grouping from Draw and ungrouping each remain a single Undo step', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { shapes, errors } = await mountDock(page);
  await drawRectangle(page, 70, 80);
  await drawRectangle(page, 270, 180);
  await drawRectangle(page, 610, 280, 'Ellipse');
  await expect.poll(() => shapes().filter(shape => shape.type === 'geo').length).toBe(3);
  const original = positions(shapes());
  await page.getByRole('button', { name: 'Select / move', exact: true }).click();
  const bounds = await page.getByTestId('canvas').boundingBox();
  if (!bounds) throw new Error('Canvas not rendered');
  await page.mouse.click(bounds.x + 40, bounds.y + 430);
  await page.keyboard.press('ControlOrMeta+a');
  let panel = await more(page);
  await expect(panel.getByRole('button', { name: 'Group', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Ungroup', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Fit selection', exact: true })).toBeEnabled();
  await panel.locator('summary').filter({ hasText: 'Style & appearance' }).click();
  await expect(page.getByTestId('toolkit-style.geo')).toHaveValue('');
  await page.getByTestId('toolkit-style.geo').selectOption('rectangle');
  await expect.poll(() => shapes().filter(shape => shape.type === 'geo' && shape.props.geo === 'rectangle').length).toBe(3);
  await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
  await dockAction(page, 'Undo');
  await expect.poll(() => shapes().filter(shape => shape.type === 'geo' && shape.props.geo === 'ellipse').length).toBe(1);
  panel = await more(page);
  await panel.locator('summary').filter({ hasText: 'Align & distribute' }).click();
  await panel.getByRole('button', { name: 'Align left', exact: true }).click();
  await expect.poll(() => new Set(positions(shapes()).map(shape => shape.x)).size).toBe(1);
  await dockAction(page, 'Undo');
  await expect.poll(() => positions(shapes())).toEqual(original);
  panel = await more(page);
  await panel.locator('summary').filter({ hasText: 'Align & distribute' }).click();
  await panel.getByRole('button', { name: 'Distribute horizontally', exact: true }).click();
  await expect.poll(() => {
    const xs = positions(shapes()).map(shape => shape.x).sort((a, b) => a - b);
    return Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1]));
  }).toBeLessThan(0.01);
  await dockAction(page, 'Undo');
  await expect.poll(() => positions(shapes())).toEqual(original);

  await page.getByRole('button', { name: 'Freehand drawing', exact: true }).click();
  await dockAction(page, 'Group');
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(1);
  await expect(page.getByRole('button', { name: 'Select / move', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const groupId = shapes().find(shape => shape.type === 'group').id;
  expect(shapes().filter(shape => shape.type === 'geo').every(shape => shape.parentId === groupId)).toBe(true);
  await dockAction(page, 'Undo');
  await expect.poll(() => shapes().length).toBe(3);
  expect(positions(shapes())).toEqual(original);
  await dockAction(page, 'Redo');
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(1);
  await dockAction(page, 'Ellipse');
  panel = await more(page);
  await expect(panel.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Ungroup', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Ungroup', exact: true }).click();
  await expect.poll(() => shapes().length).toBe(3);
  expect(positions(shapes())).toEqual(original);
  await dockAction(page, 'Undo');
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(1);
  await dockAction(page, 'Ask about selection');
  await expect(page.locator('#toolkit-prompt')).toBeFocused();
  await expect(page.locator('#toolkit-prompt')).toHaveValue('Help me understand or improve the selected objects.');
  expect(errors).toEqual([]);
});

test('dock keyboard navigation restores focus and an invalid link keeps its editable draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const { previews, shapes, errors } = await mountDock(page);
  const select = page.getByRole('button', { name: 'Select / move', exact: true });
  const draw = page.getByRole('button', { name: 'Freehand drawing', exact: true });
  const tools = page.getByRole('button', { name: 'More tools', exact: true });
  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  await select.focus();
  await select.press('ArrowRight'); await expect(draw).toBeFocused();
  await draw.press('End'); await expect(tools).toBeFocused();
  await tools.press('ArrowUp');
  await expect(page.getByRole('dialog', { name: 'More tools', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(tools).toBeFocused();
  await tools.press('Home'); await expect(select).toBeFocused();
  await select.press('ArrowLeft'); await expect(tools).toBeFocused();
  await tools.press('ArrowLeft'); await expect(insert).toBeFocused();
  await insert.press('Enter');
  const insertPanel = page.getByRole('dialog', { name: 'Insert', exact: true });
  const insertBounds = await insertPanel.boundingBox();
  const canvasBounds = await page.getByTestId('canvas').boundingBox();
  expect(insertBounds?.y).toBeGreaterThanOrEqual(canvasBounds?.y ?? 0);
  await expect(insertPanel.getByRole('button', { name: 'Close tools', exact: true })).toBeInViewport();
  const input = page.getByLabel('Website or media link');
  await input.fill('http://localhost/reference');
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a public HTTP or HTTPS website or media link.');
  await expect(input).toHaveValue('http://localhost/reference');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(previews).toEqual([]);
  await page.getByRole('dialog', { name: 'Insert', exact: true }).getByRole('button', { name: 'Close tools', exact: true }).click();
  await insert.click();
  await expect(input).toHaveValue('http://localhost/reference');
  await input.fill('https://example.com/corrected');
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Insert', exact: true })).toHaveCount(0);
  await expect.poll(() => shapes().some(shape => shape.type === 'document' && shape.props.url === 'https://example.com/corrected')).toBe(true);
  expect(previews).toEqual(['https://example.com/corrected']);
  await insert.click();
  await expect(input).toHaveValue('');
  expect(errors).toEqual([]);
});
