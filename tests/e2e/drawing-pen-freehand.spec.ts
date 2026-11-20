import { expect, test, type Locator, type Page } from '@playwright/test';

type Point = { x: number; y: number };
type PenPoint = Point & { pressure: number; tiltX?: number; tiltY?: number };
const scene = (page: Page) => page.evaluate(() => (window as any).__drawingFixture.inspect());
const documentState = async (page: Page) => {
  const state = await scene(page);
  return { page: state.page, shapes: state.shapes.sort((a: any, b: any) => a.id.localeCompare(b.id)) };
};
const canvas = (page: Page) => page.getByTestId('drawing-workspace').locator('.tl-canvas');
const toPage = (page: Page, point: Point) => page.evaluate(point => (window as any).__drawingFixture.screenPoint(point), point);
const addedShapes = (before: any, after: any) => after.shapes.filter((shape: any) => !before.shapes.some((old: any) => old.id === shape.id));
const protectedForms = (state: any) => state.shapes.filter((shape: any) => ['order-details', 'order-address', 'profile-7st'].includes(shape.type));

async function load(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing=1`);
  await expect(page.getByTestId('drawing-tool-select')).toBeVisible();
  if (mode === 'order') await expect.poll(async () => protectedForms(await documentState(page)).length).toBe(3);
  // This existing fixture button provides ordinary artwork, document units and
  // the JSON reload action. Test code only reads its inspector afterwards.
  await page.getByRole('button', { name: 'Load Corel editing example', exact: true }).click();
  await expect.poll(async () => (await scene(page)).shapes.filter((shape: any) => shape.id.startsWith('shape:corel-')).length).toBe(3);
}

async function canvasBounds(page: Page) {
  const bounds = await canvas(page).boundingBox();
  if (!bounds) throw new Error('Missing drawing canvas');
  return bounds;
}

/** Move to empty space with the public Hand tool. No fixture camera setter or
 * direct document/editor mutation is used to prepare a freehand interaction. */
async function panToEmptySpace(page: Page) {
  await page.getByTestId('drawing-tool-hand').click();
  const bounds = await canvasBounds(page), start = { x: bounds.x + 12, y: bounds.y + 12 };
  const end = { x: bounds.x + bounds.width - 24, y: start.y };
  expect(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.canvas-form-sheet'), start)).toBe(false);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  // Let native pointer velocity settle before releasing the Hand tool, avoiding
  // a camera slide that would correctly invalidate a new freehand stroke.
  await page.waitForTimeout(200); await page.mouse.up();
}

async function chooseFreehand(page: Page) {
  await page.getByTestId('drawing-workspace').locator('.tl-container').focus();
  await page.keyboard.press('F5');
  await expect.poll(async () => (await scene(page)).tool).toBe('cad-freehand');
  await expect(page.getByTestId('drawing-freehand-property')).toBeVisible();
  await expect(page.getByTestId('drawing-tool-cad-freehand')).toHaveAttribute('aria-pressed', 'true');
}

async function strokePoints(page: Page, y = .35): Promise<Point[]> {
  const b = await canvasBounds(page);
  return [
    { x: b.x + b.width * .2, y: b.y + b.height * y },
    { x: b.x + b.width * .36, y: b.y + b.height * (y + .09) },
    { x: b.x + b.width * .52, y: b.y + b.height * (y - .06) },
    { x: b.x + b.width * .68, y: b.y + b.height * y },
  ];
}

async function startMouseCurve(page: Page) {
  const points = await strokePoints(page);
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 6 });
  await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(1);
}

/** Synthetic DOM PointerEvents exercise the production bridge and controller.
 * They do not emulate a USB tablet, driver, trusted capture, or hardware timing. */
async function penEvent(target: Locator, type: string, point: PenPoint, pointerId = 41, coalesced: PenPoint[] = []) {
  await target.evaluate((element, value) => {
    const make = (type: string, point: PenPoint) => new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: value.pointerId, pointerType: 'pen', isPrimary: true,
      button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: point.x, clientY: point.y, pressure: point.pressure, tiltX: point.tiltX ?? 0, tiltY: point.tiltY ?? 0,
    });
    const event = make(value.type, value.point);
    if (value.coalesced.length) Object.defineProperty(event, 'getCoalescedEvents', {
      value: () => value.coalesced.map(point => make('pointermove', point)),
    });
    element.dispatchEvent(event);
  }, { type, point, pointerId, coalesced });
}

function verticalSpan(shape: any, pageX: number): number {
  const intersections: number[] = [], x = pageX - shape.x;
  for (const contour of shape.props.contours) for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x))
      intersections.push(a.y + (x - a.x) * (b.y - a.y) / (b.x - a.x));
  }
  if (intersections.length < 2) throw new Error('Ink contour does not cross the inspected position');
  return Math.max(...intersections) - Math.min(...intersections);
}

for (const mode of ['idea', 'order']) {
  test(`${mode} F5 mouse Freehand previews, edits nodes, undoes once and reloads as a CAD curve`, async ({ page }) => {
    await load(page, mode); await panToEmptySpace(page); await chooseFreehand(page);
    const before = await documentState(page), url = page.url();
    await startMouseCurve(page);
    expect(await documentState(page)).toEqual(before);
    await expect(page.getByTestId('drawing-freehand-property-width')).toBeDisabled();
    await page.mouse.up();
    await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    await expect.poll(async () => addedShapes(before, await documentState(page)).length).toBe(1);
    const after = await documentState(page), [curve] = addedShapes(before, after);
    expect(page.url()).toBe(url); expect(curve.type).toBe('cad-bezier');
    expect(curve.props.contours).toHaveLength(1); expect(curve.props.contours[0].closed).toBe(false);
    expect(curve.props.contours[0].nodes.length).toBeGreaterThan(2);
    expect(curve.meta.omsVectorPaint.fill).toBe('none'); expect(curve.meta.omsVectorPaint.strokeWidth).toBeGreaterThan(0);
    expect((await scene(page)).selected).toEqual([curve.id]); expect((await scene(page)).tool).toBe('cad-freehand');
    expect(protectedForms(after)).toEqual(protectedForms(before));

    await page.keyboard.press('F10');
    const nodes = page.getByTestId('drawing-cad-nodes');
    await expect(nodes.getByRole('button', { name: 'Split next segment', exact: true })).toBeEnabled();
    await nodes.getByRole('button', { name: 'Split next segment', exact: true }).click();
    await expect.poll(async () => (await scene(page)).shapes.find((shape: any) => shape.id === curve.id).props.contours[0].nodes.length)
      .toBe(curve.props.contours[0].nodes.length + 1);
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(after);
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click(); expect(await documentState(page)).toEqual(after);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(await documentState(page)).toEqual(after);
  });

  test(`${mode} synthetic coalesced pen pressure saves an editable variable-width ink outline`, async ({ page }) => {
    await load(page, mode); await panToEmptySpace(page); await chooseFreehand(page);
    await page.getByTestId('drawing-freehand-property-mode').selectOption('ink');
    const width = page.getByTestId('drawing-freehand-property-width');
    await width.fill(String(20 * 25.4 / 96)); await width.press('Enter');
    await expect(width).toHaveAttribute('aria-invalid', 'false');
    await page.getByTestId('drawing-freehand-property-smoothing').focus();
    await page.getByTestId('drawing-freehand-property-smoothing').press('Home');
    await expect(page.getByTestId('drawing-freehand-property-smoothing')).toHaveValue('0');
    await page.getByTestId('drawing-freehand-property-close').uncheck();
    await page.getByTestId('drawing-workspace').locator('.tl-container').focus();
    const b = await canvasBounds(page), y = b.y + b.height * .35;
    const start = { x: b.x + b.width * .2, y, pressure: .2 }, middle = { x: b.x + b.width * .4, y, pressure: .4 };
    const peak = { x: b.x + b.width * .6, y, pressure: 1 }, end = { x: b.x + b.width * .75, y, pressure: 0 };
    const pageStart = await toPage(page, start), pagePeak = await toPage(page, peak), before = await documentState(page);
    await penEvent(canvas(page), 'pointerdown', start);
    await penEvent(canvas(page), 'pointermove', peak, 41, [middle, peak]);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-mode', 'ink');
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-sample-count', '3');
    expect(await documentState(page)).toEqual(before);
    await penEvent(canvas(page), 'pointerup', end);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    await expect.poll(async () => addedShapes(before, await documentState(page)).length).toBe(1);
    const after = await documentState(page), [ink] = addedShapes(before, after);
    expect(ink.type).toBe('cad-bezier'); expect(ink.props.fillRule).toBe('nonzero');
    expect(ink.props.contours.every((contour: any) => contour.closed)).toBe(true);
    expect(ink.meta.omsVectorPaint.fill).not.toBe('none'); expect(ink.meta.omsVectorPaint.stroke).toBe('none');
    const light = verticalSpan(ink, pageStart.x + (pagePeak.x - pageStart.x) / 8), firm = verticalSpan(ink, pagePeak.x);
    expect(firm).toBeCloseTo(20, 3); expect(firm).toBeGreaterThan(light * 1.7);
    expect(protectedForms(after)).toEqual(protectedForms(before));
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click(); expect(await documentState(page)).toEqual(after);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
    expect(await documentState(page)).toEqual(after);
  });

  test(`${mode} Escape, pen cancellation, blur and permission changes discard only the pending stroke`, async ({ page }) => {
    await load(page, mode); await panToEmptySpace(page); await chooseFreehand(page);
    const before = await documentState(page);
    await startMouseCurve(page); await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0); expect(await documentState(page)).toEqual(before);
    const points = await strokePoints(page), start = { ...points[0], pressure: .3 }, end = { ...points.at(-1)!, pressure: .8 };
    for (const interruption of ['pointercancel', 'blur', 'readonly']) {
      await penEvent(canvas(page), 'pointerdown', start);
      await penEvent(canvas(page), 'pointermove', end);
      await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(1);
      expect(await documentState(page)).toEqual(before);
      if (interruption === 'pointercancel') await penEvent(canvas(page), 'pointercancel', { ...end, pressure: 0 });
      else if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else await page.getByRole('button', { name: 'Toggle read only', exact: true }).click();
      await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
      await penEvent(canvas(page), 'pointerup', { ...end, pressure: 0 });
      expect(await documentState(page)).toEqual(before);
    }
    await expect(page.getByTestId('drawing-tool-cad-freehand')).toBeDisabled();
    await expect(page.getByTestId('drawing-freehand-property-mode')).toBeDisabled();
    await penEvent(canvas(page), 'pointerdown', start); await penEvent(canvas(page), 'pointerup', end);
    expect(await documentState(page)).toEqual(before);
  });

  test(`${mode} pen diagnostics stay outside the drawing and preferences survive a browser reload`, async ({ page }) => {
    await load(page, mode); await page.getByTestId('drawing-pen-toggle').click();
    await expect(page.getByTestId('drawing-pen-panel')).toBeVisible();
    const before = await documentState(page);
    await page.getByTestId('drawing-pen-mode').selectOption('pen-only');
    await page.getByTestId('drawing-pen-response').selectOption('firm');
    await page.getByTestId('drawing-pen-barrel').selectOption('pan');
    await page.getByTestId('drawing-pen-pressure').uncheck();
    await expect(page.getByTestId('drawing-pen-response')).toBeDisabled();
    await page.getByTestId('drawing-pen-pressure').check();
    const pad = page.getByTestId('drawing-pen-test'), b = await pad.boundingBox();
    if (!b) throw new Error('Missing pen diagnostic pad');
    const point = { x: b.x + b.width * .3, y: b.y + b.height * .5, pressure: .25, tiltX: 18, tiltY: -12 };
    await penEvent(pad, 'pointerdown', point, 73);
    await expect(page.getByTestId('drawing-pen-detected')).toHaveText('Pen input received');
    await expect(page.getByTestId('drawing-pen-pressure-value')).toHaveText('25%');
    await expect(page.getByTestId('drawing-pen-tilt')).toHaveText('18° / -12°');
    await expect(page.getByTestId('drawing-pen-buttons')).toHaveText('1');
    await expect(page.getByTestId('drawing-pen-mode')).toBeDisabled();
    await penEvent(pad, 'pointermove', { ...point, x: b.x + b.width * .7, pressure: .75 }, 73);
    await expect(page.getByTestId('drawing-pen-pressure-value')).toHaveText('75%');
    await expect(pad.locator('.drawing-pen-test-dot')).toHaveCount(2);
    expect(await documentState(page)).toEqual(before); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    await penEvent(pad, 'pointerup', { ...point, pressure: 0 }, 73);
    await expect(page.getByTestId('drawing-pen-mode')).toBeEnabled();
    await page.getByTestId('drawing-pen-test-clear').click();
    await expect(pad.locator('.drawing-pen-test-dot')).toHaveCount(0);
    await expect(page.getByTestId('drawing-pen-detected')).toHaveText('No pen input received yet');
    expect(await documentState(page)).toEqual(before);

    await page.reload(); await expect(page.getByTestId('drawing-tool-select')).toBeVisible();
    await page.getByTestId('drawing-pen-toggle').click();
    await expect(page.getByTestId('drawing-pen-mode')).toHaveValue('pen-only');
    await expect(page.getByTestId('drawing-pen-response')).toHaveValue('firm');
    await expect(page.getByTestId('drawing-pen-barrel')).toHaveValue('pan');
    await expect(page.getByTestId('drawing-pen-pressure')).toBeChecked();
    await page.getByTestId('drawing-pen-reset').click();
    await expect(page.getByTestId('drawing-pen-mode')).toHaveValue('auto');
    await expect(page.getByTestId('drawing-pen-response')).toHaveValue('linear');
    await expect(page.getByTestId('drawing-pen-barrel')).toHaveValue('context');
    await page.getByRole('button', { name: 'Toggle read only', exact: true }).click();
    await expect(page.getByTestId('drawing-pen-freehand')).toBeDisabled();
    await expect(page.getByTestId('drawing-freehand-mode')).toBeDisabled();
    const readonlyDocument = await documentState(page), readOnlyPad = page.getByTestId('drawing-pen-test');
    const readOnlyBounds = await readOnlyPad.boundingBox();
    if (!readOnlyBounds) throw new Error('Read-only pen diagnostic pad missing');
    const testPoint = { x: readOnlyBounds.x + 40, y: readOnlyBounds.y + 35, pressure: .6 };
    await penEvent(readOnlyPad, 'pointerdown', testPoint, 74);
    await expect(page.getByTestId('drawing-pen-pressure-value')).toHaveText('60%');
    await penEvent(readOnlyPad, 'pointerup', { ...testPoint, pressure: 0 }, 74);
    expect(await documentState(page)).toEqual(readonlyDocument);
  });

  test(`${mode} Pen only rejects mouse drawing while retaining ordinary OMS form input`, async ({ page }) => {
    await load(page, mode); await panToEmptySpace(page);
    await page.getByTestId('drawing-pen-toggle').click();
    await page.getByTestId('drawing-pen-mode').selectOption('pen-only');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click(); await chooseFreehand(page);
    const before = await documentState(page), points = await strokePoints(page);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    await page.mouse.move(points[3].x, points[3].y, { steps: 10 }); await page.mouse.up();
    await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0); expect(await documentState(page)).toEqual(before);
    if (mode === 'order') {
      await page.getByTestId('drawing-workspace').locator('.tl-container').focus(); await page.keyboard.press('F4');
      const title = page.locator('.canvas-form-sheet input[id$="-title"]');
      await expect(title).toBeVisible(); await title.fill('Pen-only order title');
      await title.press('End'); await title.pressSequentially(' remains editable');
      await expect(title).toHaveValue('Pen-only order title remains editable');
      await expect.poll(async () => (await scene(page)).shapes.find((shape: any) => shape.type === 'order-details').props.title)
        .toBe('Pen-only order title remains editable');
      const after = await documentState(page);
      expect(after.shapes.filter((shape: any) => shape.type !== 'order-details')).toEqual(before.shapes.filter((shape: any) => shape.type !== 'order-details'));
      expect(addedShapes(before, after)).toEqual([]); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    } else expect(protectedForms(before)).toEqual([]);
  });
}
