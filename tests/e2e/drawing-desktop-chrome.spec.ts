import { expect, test, type Page } from '@playwright/test';
import { drawingReadOnlyTools, drawingToolIds, drawingToolTargets } from '../../src/lib/components/canvas/drawing-command-map';

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
  test(`${mode} mounts without scheduler errors and synchronizes native grid snapping`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => { errors.push(error.message); console.log('Canvas page error:', error.stack); });
    await open(page, mode);
    expect(errors).toEqual([]);
    await page.getByTestId('drawing-status-snap-options').click();
    await page.getByTestId('drawing-snap-master').check();
    await page.getByTestId('drawing-snap-grid').check();
    await expect.poll(async () => (await scene(page)).gridSnapping).toBe(true);
    await page.getByTestId('drawing-snap-master').uncheck();
    await expect.poll(async () => (await scene(page)).gridSnapping).toBe(false);
    await page.getByTestId('drawing-snap-master').check();
    await expect.poll(async () => (await scene(page)).gridSnapping).toBe(true);
    await page.getByTestId('drawing-snap-grid').uncheck();
    await expect.poll(async () => (await scene(page)).gridSnapping).toBe(false);
    await page.reload();
    await expect(page.getByTestId('drawing-tool-rectangle')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${mode} configures page snapping and offers Page setup for a sizeless sheet`, async ({ page }) => {
    await open(page, mode);
    const view = page.locator('[data-drawing-menu="view"]');
    await view.locator(':scope > summary').click();
    const snapTo = view.locator('[data-drawing-submenu="snapTo"]');
    await snapTo.locator(':scope > summary').hover();
    await snapTo.locator('[data-command="snapPage"]').click();
    await page.getByTestId('drawing-status-snap-options').click();
    const options = page.getByTestId('drawing-snap-options');
    await expect(options.getByTestId('drawing-snap-page')).toBeChecked();
    await options.getByRole('button', { name: 'Page setup', exact: true }).click();
    const setup = page.getByTestId('drawing-page-setup');
    await setup.getByLabel('Size preset', { exact: true }).selectOption('A4');
    await setup.getByRole('button', { name: 'Apply page setup', exact: true }).click();
    await page.evaluate(() => (window as any).__drawingFixture.roundTrip());
    await page.getByTestId('drawing-status-snap-options').click();
    await expect(options.getByTestId('drawing-snap-page')).toBeChecked();
    await expect(options.getByRole('button', { name: 'Page setup', exact: true })).toHaveCount(0);
  });

  test(`${mode} uses one-shot F2, persistent Z and X for erasing`, async ({ page }) => {
    await open(page, mode);
    const viewport = await page.locator('.drawing-viewport').boundingBox();
    if (!viewport) throw new Error('Drawing viewport missing');
    const point = { x: viewport.x + 40, y: viewport.y + viewport.height - 40 };
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('F6');
    await expect.poll(async () => (await scene(page)).tool).toBe('cad-rectangle');
    await page.keyboard.press('F2');
    await expect.poll(async () => (await scene(page)).tool).toBe('zoom');
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await scene(page)).tool).toBe('cad-rectangle');
    await page.keyboard.press('F2');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await scene(page)).tool).toBe('cad-rectangle');
    await page.keyboard.press('z');
    await expect.poll(async () => (await scene(page)).tool).toBe('zoom');
    await page.keyboard.press('x');
    await expect.poll(async () => (await scene(page)).tool).toBe('eraser');
  });

  test(`${mode} opens the targeted paint controls and toggles grid snapping independently`, async ({ page }) => {
    await open(page, mode);
    await drawWith(page, 'F6');
    await page.keyboard.press('Control+q');
    await page.keyboard.press('F11');
    await expect(page.getByTestId('gradient-fill-section')).toHaveAttribute('open', '');
    await expect(page.getByTestId('gradient-fill-section').locator('summary')).toBeFocused();
    await page.keyboard.press('Shift+F11');
    await expect(page.getByTestId('vector-paint').locator('> summary')).toBeFocused();
    await page.keyboard.press('Shift+F12');
    await expect(page.getByTestId('drawing-outline-pen').locator('input[type=color]')).toBeFocused();
    await page.getByTestId('drawing-status-snap-options').click();
    await page.getByTestId('drawing-snap-master').check();
    await expect(page.getByTestId('drawing-snap-grid-show')).not.toBeChecked();
    await page.keyboard.press('Alt+y');
    await expect(page.getByTestId('drawing-snap-grid')).toBeChecked();
    await expect(page.getByTestId('drawing-snap-grid-show')).not.toBeChecked();
    await expect(page.getByTestId('drawing-snap-objects')).toBeChecked();
    await page.keyboard.press('Alt+z');
    await expect(page.getByTestId('drawing-snap-objects')).not.toBeChecked();
    await expect(page.getByTestId('drawing-snap-endpoints')).toBeDisabled();
    await expect(page.getByTestId('drawing-snap-grid')).toBeChecked();
    await expect(page.getByTestId('drawing-snap-guidelines')).toBeChecked();
    await page.keyboard.press('Alt+q');
    await expect(page.getByTestId('drawing-snap-master')).not.toBeChecked();
    await page.keyboard.press('Alt+z');
    await expect(page.getByTestId('drawing-snap-master')).not.toBeChecked();
    await expect(page.getByTestId('drawing-snap-objects')).toBeChecked();
    await expect(page.getByTestId('drawing-snap-grid')).toBeChecked();
  });

  test(`${mode} lists every instrument and activates every drawing mode`, async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, mode);
    const tools = page.locator('[data-drawing-menu="tools"] > summary');
    const directory = page.locator('[data-drawing-menu="tools"] .drawing-tool-directory');
    await tools.click();
    await expect(directory.locator('[data-drawing-tool]')).toHaveCount(drawingToolIds.length);
    for (const tool of drawingToolIds) {
      const target = drawingToolTargets[tool];
      if (target.kind === 'command') continue;
      const button = directory.locator(`[data-drawing-tool="${tool}"]`);
      // The preceding activation closed the menu and may have opened a docker.
      if (!await button.isVisible()) await tools.click();
      await button.click();
      await expect.poll(async () => (await scene(page)).tool).toBe(target.kind === 'geometry' ? 'geo' : target.tool);
      await expect(page.getByTestId(`drawing-tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'Toggle read only' }).click();
    await tools.click();
    for (const tool of drawingToolIds) {
      const button = directory.locator(`[data-drawing-tool="${tool}"]`);
      if (drawingReadOnlyTools.has(tool)) await expect(button).toBeEnabled();
      else await expect(button).toBeDisabled();
    }
  });

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

  test(`${mode} Quick Access opens the production layer inspector`, async ({ page }) => {
    await open(page, mode);
    await page.getByTestId('drawing-quick-trigger').click();
    await page.getByTestId('drawing-quick-input').fill('production layers');
    await page.getByRole('option', { name: /Production layers/ }).click();
    const layers = page.getByTestId('drawing-production-layers');
    await expect(layers).toHaveAttribute('open', '');
    await expect(layers.locator('summary')).toBeFocused();
  });

  test(`${mode} previews, creates and undoes editable copies along a guide`, async ({ page }) => {
    await open(page, mode);
    await page.evaluate(() => (window as any).__drawingFixture.pathRepeatSample());
    const before = (await scene(page)).shapes.length;
    await page.locator('[data-drawing-menu="effects"] > summary').click();
    await page.locator('[data-command="repeatPath"]').click();
    await page.getByTestId('drawing-path-repeat-count').fill('4');
    await page.getByTestId('drawing-path-repeat-preview').click();
    await expect(page.getByTestId('drawing-path-repeat-overlay').locator('polygon')).toHaveCount(4);
    expect((await scene(page)).shapes.length).toBe(before);
    await page.getByTestId('drawing-path-repeat-apply').click();
    await expect.poll(async () => (await scene(page)).shapes.length).toBe(before + 4);
    await expect.poll(async () => (await scene(page)).selected.length).toBe(4);
    await page.getByTestId('drawing-undo').click();
    await expect.poll(async () => (await scene(page)).shapes.length).toBe(before);
  });

  test(`${mode} clips artwork in place and can release or undo the mask`, async ({ page }) => {
    await open(page, mode);
    await page.evaluate(() => (window as any).__drawingFixture.artworkClipSample());
    const initial = await scene(page);
    const artwork = (shapes: any[]) => shapes.find(shape => shape.id === 'shape:clip-artwork');
    await page.getByTestId('drawing-quick-trigger').click();
    await page.getByTestId('drawing-quick-input').fill('clip artwork to shape');
    await page.getByRole('option', { name: /Clip artwork to shape/ }).click();
    await page.getByTestId('drawing-clip-guide').selectOption('shape:clip-guide');
    await page.getByTestId('drawing-clip-preview').click();
    await expect(page.getByTestId('drawing-clip-overlay').locator('path')).toBeVisible();
    await page.getByTestId('drawing-clip-apply').click();
    await expect.poll(async () => artwork((await scene(page)).shapes)?.meta.omsVectorPaint?.clips?.length).toBe(1);
    const clipped = await scene(page);
    expect(clipped.selected).toEqual(['shape:clip-artwork']);
    expect(clipped.shapes.length).toBe(initial.shapes.length);
    expect(artwork(clipped.shapes).props).toEqual(artwork(initial.shapes).props);
    await page.getByTestId('drawing-clip-release').click();
    await expect.poll(async () => artwork((await scene(page)).shapes)?.meta.omsVectorPaint?.clips).toBeUndefined();
    await page.getByTestId('drawing-undo').click();
    await expect.poll(async () => artwork((await scene(page)).shapes)?.meta.omsVectorPaint?.clips?.length).toBe(1);
  });

  test(`${mode} creates an editable mirror copy across a selected line`, async ({ page }) => {
    await open(page, mode);
    await page.evaluate(() => (window as any).__drawingFixture.pathRepeatSample());
    const before = (await scene(page)).shapes.length;
    await page.getByTestId('drawing-quick-trigger').click();
    await page.getByTestId('drawing-quick-input').fill('mirror copy across line');
    await page.getByRole('option', { name: /Mirror copy across line/ }).click();
    await expect(page.getByTestId('drawing-mirror-guide')).toHaveValue('shape:path-repeat-guide');
    await page.getByTestId('drawing-mirror-preview').click();
    await expect(page.getByTestId('drawing-mirror-copy-overlay').locator('path')).toBeVisible();
    expect((await scene(page)).shapes.length).toBe(before);
    await page.getByTestId('drawing-mirror-apply').click();
    await expect.poll(async () => (await scene(page)).shapes.length).toBe(before + 1);
    const { shapes, selected } = await scene(page);
    expect(shapes.find((shape: any) => shape.id === selected[0])?.type).toBe('cad-bezier');
    await page.getByTestId('drawing-undo').click();
    await expect.poll(async () => (await scene(page)).shapes.length).toBe(before);
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

test('Previous view restores a wheel gesture on its own page in read-only mode', async ({page}) => {
  await open(page,'idea');
  const zoom = page.locator('.drawing-zoom select');
  await zoom.selectOption('0.1');
  const centre = () => page.locator('.tl-canvas').evaluate(node => {
    const b = node.getBoundingClientRect();
    return (window as any).__drawingFixture.screenPoint({x:b.x+b.width/2,y:b.y+b.height/2});
  });
  const previousCentre = await centre();
  await page.locator('.tl-canvas').evaluate(async node => {
    const bounds = node.getBoundingClientRect();
    for (let i=0;i<4;i++) {
      node.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-90,clientX:bounds.x+100,clientY:bounds.y+100}));
      await new Promise(requestAnimationFrame);
    }
  });
  await expect(zoom).toHaveValue('current');
  const firstPage = (await scene(page)).page.id;
  await page.locator('[data-drawing-menu="tools"] > summary').click();
  await page.locator('[data-drawing-menu="tools"]').getByRole('button',{name:'Page setup',exact:true}).click();
  await page.getByTestId('drawing-page-setup').getByRole('button',{name:'Add page'}).click();
  await expect.poll(async () => (await scene(page)).page.id).not.toBe(firstPage);
  await expect(zoom.locator('option[value="previous"]')).toBeDisabled();
  await page.getByTestId('drawing-page-navigator').selectOption(firstPage);
  await page.getByRole('button',{name:'Toggle read only'}).click();
  await page.setViewportSize({width:1280,height:850});
  await zoom.selectOption('previous');
  await expect(zoom).toHaveValue('0.1');
  const restored = await centre();
  expect(restored.x).toBeCloseTo(previousCentre.x,3);
  expect(restored.y).toBeCloseTo(previousCentre.y,3);
});

for (const mode of ['idea','order']) {
  test(`${mode} centres overview zoom and uses the order catalog for fill and outline`, async ({page}) => {
    await page.route('**/api/materials?**',route=>route.fulfill({json:[{
      id: 'swatch-9010', category:'PAINT_RAL', code:'RAL_9010', name_en:'RAL 9010 Pure white', metadata:{hex:'#F1ECE1'}
    }]}));
    await page.setViewportSize({width:1440,height:950});
    await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing`);
    await expect(page.locator('.tl-canvas')).toBeVisible({timeout:20000});
    await page.getByRole('button',{name:'Load Corel editing example'}).click();
    const zoom=page.locator('.drawing-zoom select');
    const center=()=>page.locator('.tl-canvas').evaluate(node=>{
      const b=node.getBoundingClientRect();
      return (window as any).__drawingFixture.screenPoint({x:b.x+b.width/2,y:b.y+b.height/2});
    });
    const before=await center();
    for(const value of ['0.025','8','1']){
      await zoom.selectOption(value);await expect(zoom).toHaveValue(value);
      const after=await center();expect(after.x).toBeCloseTo(before.x,3);expect(after.y).toBeCloseTo(before.y,3);
    }
    const point=await page.evaluate(()=>(window as any).__drawingFixture.point('shape:corel-a',.05,.2));
    await page.mouse.click(point.x,point.y);
    await expect.poll(async()=>(await scene(page)).selected).toEqual(['shape:corel-a']);
    for(const kind of ['fill','outline']){
      await page.getByTestId('drawing-status-'+kind).click();
      const panel=page.getByTestId(kind==='fill'?'vector-paint':'drawing-outline-pen');
      await panel.getByText('Catalog paint',{exact:true}).click();
      await panel.getByRole('searchbox').fill(kind==='fill'?'RAL9010':'9010');
      await panel.getByRole('button',{name:'RAL 9010 Pure white'}).click();
      await panel.getByRole('button',{name:kind==='fill'?'Apply fill':/Apply (?:outline )?colou?r/i,exact:kind==='fill'}).click();
      const field=kind==='fill'?'fill':'stroke';
      await expect.poll(async()=>(await scene(page)).shapes.find((s:any)=>s.id==='shape:corel-a').meta.omsVectorPaint[field].toUpperCase()).toBe('#F1ECE1');
    }
    await page.getByTestId('drawing-undo').click();
    const paint=(await scene(page)).shapes.find((s:any)=>s.id==='shape:corel-a').meta.omsVectorPaint;
    expect(paint.stroke).toBe('#172554');expect(paint.fill.toUpperCase()).toBe('#F1ECE1');
  });
}
