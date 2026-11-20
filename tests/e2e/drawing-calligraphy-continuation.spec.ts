import { expect, test, type Locator, type Page } from '@playwright/test';

type Point = { x: number; y: number };
type PenPoint = Point & { pressure: number; tiltX: number; tiltY: number; twist?: number };
const scene = (page: Page) => page.evaluate(() => (window as any).__drawingFixture.inspect());
const documentState = async (page: Page) => {
  const state = await scene(page);
  return { page: state.page, shapes: state.shapes.sort((a: any, b: any) => a.id.localeCompare(b.id)) };
};
const canvas = (page: Page) => page.getByTestId('drawing-workspace').locator('.tl-canvas');
const toPage = (page: Page, point: Point) => page.evaluate(point => (window as any).__drawingFixture.screenPoint(point), point);
const toScreen = (page: Page, point: Point) => page.evaluate(point => (window as any).__drawingFixture.pagePoint(point), point);
const addedShapes = (before: any, after: any) => after.shapes.filter((shape: any) => !before.shapes.some((old: any) => old.id === shape.id));
const protectedForms = (state: any) => state.shapes.filter((shape: any) => ['order-details', 'order-address', 'profile-7st'].includes(shape.type));

async function canvasBounds(page: Page) {
  const bounds = await canvas(page).boundingBox();
  if (!bounds) throw new Error('Missing drawing canvas');
  return bounds;
}

async function prepare(page: Page, mode: string) {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/drawing-workspace.html?mode=${mode}&corel-editing=1`);
  await expect(page.getByTestId('drawing-tool-select')).toBeVisible();
  if (mode === 'order') await expect.poll(async () => protectedForms(await documentState(page)).length).toBe(3);
  await page.getByRole('button', { name: 'Load Corel editing example', exact: true }).click();
  await expect.poll(async () => (await scene(page)).shapes.filter((shape: any) => shape.id.startsWith('shape:corel-')).length).toBe(3);
  // Prepare empty space through the public Hand tool. Fixture access throughout
  // this spec is read-only: no camera setter or document/editor mutation hook.
  await page.getByTestId('drawing-tool-hand').click();
  const b = await canvasBounds(page), start = { x: b.x + 12, y: b.y + 12 };
  expect(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.canvas-form-sheet'), start)).toBe(false);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(b.x + b.width - 24, start.y, { steps: 12 });
  await page.waitForTimeout(200); await page.mouse.up();
  await chooseFreehand(page);
}

async function chooseFreehand(page: Page) {
  await page.getByTestId('drawing-workspace').locator('.tl-container').focus();
  await page.keyboard.press('F5');
  await expect.poll(async () => (await scene(page)).tool).toBe('cad-freehand');
  await expect(page.getByTestId('drawing-freehand-property')).toBeVisible();
}

async function numeric(page: Page, name: string, value: number) {
  const field = page.getByTestId(`drawing-freehand-property-${name}`);
  await field.fill(String(value)); await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
}

async function setColor(page: Page, value: string) {
  // Exercise the actual color input's public change event; native color-dialog
  // automation is not portable. This never calls the editor or an app setter.
  await page.getByTestId('drawing-freehand-property-color').evaluate((element, color) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, color);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(page.getByTestId('drawing-freehand-property-color')).toHaveValue(value);
}

async function configure(page: Page, mode: 'curve' | 'calligraphy', width: number) {
  await page.getByTestId('drawing-freehand-property-mode').selectOption(mode);
  // The public example uses scale 1 and millimetres; assert saved widths in
  // canvas units so this oracle is independent of the geometry implementation.
  await numeric(page, 'width', width * 25.4 / 96);
  const smoothing = page.getByTestId('drawing-freehand-property-smoothing');
  await smoothing.focus(); await smoothing.press('Home'); await expect(smoothing).toHaveValue('0');
  await page.getByTestId('drawing-freehand-property-close').uncheck();
  if (mode === 'calligraphy') {
    await numeric(page, 'nib-angle', 0); await numeric(page, 'nib-tilt', 15);
    await page.getByTestId('drawing-freehand-property-use-tilt').uncheck();
    await page.getByTestId('drawing-freehand-property-use-bearing').uncheck();
  }
}

async function drag(page: Page, points: Point[], release = true) {
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 6 });
  await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(1);
  if (release) { await page.mouse.up(); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0); }
}

/** Synthetic DOM events cover the production sample bridge and controller,
 * not a physical tablet, its driver, trusted capture, or hardware timing. */
async function penEvent(target: Locator, type: string, point: PenPoint, coalesced: PenPoint[] = [], pointerId = 95) {
  await target.evaluate((element, value) => {
    const make = (type: string, point: PenPoint) => new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: value.pointerId, pointerType: 'pen', isPrimary: true,
      button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: point.x, clientY: point.y, pressure: point.pressure,
      tiltX: point.tiltX, tiltY: point.tiltY, twist: point.twist ?? 0,
    });
    const event = make(value.type, value.point);
    if (value.coalesced.length) Object.defineProperty(event, 'getCoalescedEvents', {
      value: () => value.coalesced.map(point => make('pointermove', point)),
    });
    element.dispatchEvent(event);
  }, { type, point, coalesced, pointerId });
}

function verticalSpan(shape: any, pageX: number): number {
  // Calligraphic output is a literal polygon. Intersect its saved edges without
  // importing or reusing the application's nib resolver or bounds functions.
  expect(shape.rotation).toBe(0);
  const intersections: number[] = [], x = pageX - shape.x;
  for (const contour of shape.props.contours) for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    expect([a.inX, a.inY, a.outX, a.outY]).toEqual([0, 0, 0, 0]);
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x))
      intersections.push(a.y + (x - a.x) * (b.y - a.y) / (b.x - a.x));
  }
  if (intersections.length < 2) throw new Error('Calligraphic contour does not cross the inspected position');
  return Math.max(...intersections) - Math.min(...intersections);
}

function expectFilledCalligraphy(shape: any) {
  expect(shape.type).toBe('cad-bezier'); expect(shape.props.fillRule).toBe('nonzero');
  expect(shape.props.contours.length).toBeGreaterThan(0);
  expect(shape.props.contours.every((contour: any) => contour.closed)).toBe(true);
  expect(shape.meta.omsVectorPaint.fill).not.toBe('none'); expect(shape.meta.omsVectorPaint.stroke).toBe('none');
}

async function endpoint(page: Page, shape: any, end: 'start' | 'end'): Promise<Point> {
  const nodes = shape.props.contours[0].nodes, point = end === 'start' ? nodes[0] : nodes.at(-1);
  // Sources in this spec are created in page space through Freehand. The read-
  // only fixture maps their saved endpoint to screen space without changing it.
  expect(shape.parentId).toBe((await scene(page)).page.id); expect(shape.rotation).toBe(0);
  return toScreen(page, { x: shape.x + point.x, y: shape.y + point.y });
}

async function createOpenCurve(page: Page) {
  await configure(page, 'curve', 4); await setColor(page, '#2563eb');
  const before = await documentState(page), b = await canvasBounds(page);
  await drag(page, [
    { x: b.x + b.width * .2, y: b.y + b.height * .35 },
    { x: b.x + b.width * .32, y: b.y + b.height * .44 },
    { x: b.x + b.width * .45, y: b.y + b.height * .35 },
  ]);
  await expect.poll(async () => addedShapes(before, await documentState(page)).length).toBe(1);
  const after = await documentState(page), [curve] = addedShapes(before, after);
  expect(curve.props.contours[0].closed).toBe(false); expect((await scene(page)).selected).toEqual([curve.id]);
  return { before, after, curve };
}

async function undoRedoReload(page: Page, before: any, after: any) {
  await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(before);
  await page.getByTestId('drawing-redo').click(); expect(await documentState(page)).toEqual(after);
  await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click();
  expect(await documentState(page)).toEqual(after);
}

async function expectSourcePreview(page: Page, source: any) {
  const preview = page.getByTestId('cad-freehand-source-preview');
  await expect(preview).toHaveCount(1); await expect(preview).toHaveAttribute('data-shape-id', source.id);
  // Inspect the full graft's actual painted path in the source shape container.
  // The separate overlay owns guides only, so no second stroke may composite.
  const stroke = preview.locator('path[stroke]:not([stroke="none"])'), paint = source.meta.omsVectorPaint;
  await expect(stroke).toHaveCount(1);
  for (const [attribute, value] of [
    ['stroke', paint.stroke], ['stroke-width', paint.strokeWidth], ['stroke-opacity', paint.strokeOpacity],
    ['stroke-linecap', paint.lineCap], ['stroke-linejoin', paint.lineJoin],
  ]) await expect(stroke).toHaveAttribute(attribute, String(value));
  await expect(page.getByTestId('cad-freehand-result')).toHaveCount(0);
}

for (const mode of ['idea', 'order']) {
  test(`${mode} fixed calligraphic nib produces directional widths and literal reloadable outlines`, async ({ page }) => {
    await prepare(page, mode); await configure(page, 'calligraphy', 20);
    const before = await documentState(page), b = await canvasBounds(page), shapes: any[] = [];
    for (const [angle, fraction] of [[0, .3], [90, .65]]) {
      await numeric(page, 'nib-angle', angle);
      const preview = page.getByTestId('drawing-freehand-property-nib-preview');
      await expect(preview).toHaveAttribute('aria-hidden', 'true');
      await expect(preview.locator('ellipse')).toHaveAttribute('transform', `rotate(${angle} 32 24)`);
      const start = { x: b.x + b.width * .2, y: b.y + b.height * fraction };
      const end = { x: b.x + b.width * .75, y: start.y }, pending = await documentState(page);
      await drag(page, [start, end], false);
      await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-mode', 'calligraphy');
      await expect(page.getByTestId('drawing-freehand-property-nib-angle')).toBeDisabled();
      expect(await documentState(page)).toEqual(pending);
      await page.mouse.up(); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
      await expect.poll(async () => addedShapes(pending, await documentState(page)).length).toBe(1);
      const [shape] = addedShapes(pending, await documentState(page)); expectFilledCalligraphy(shape); shapes.push(shape);
      const middle = await toPage(page, { x: (start.x + end.x) / 2, y: start.y });
      const expected = angle === 0 ? 20 * Math.sin(15 * Math.PI / 180) : 20;
      expect(Math.abs(verticalSpan(shape, middle.x) - expected)).toBeLessThan(.15);
    }
    const after = await documentState(page); expect(addedShapes(before, after)).toHaveLength(2);
    expect(protectedForms(after)).toEqual(protectedForms(before));
    await page.getByTestId('drawing-undo').click();
    expect(addedShapes(before, await documentState(page)).map((shape: any) => shape.id)).toEqual([shapes[0].id]);
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(before);
    await page.getByTestId('drawing-redo').click(); await page.getByTestId('drawing-redo').click();
    expect(await documentState(page)).toEqual(after);
    await page.getByRole('button', { name: 'Reload saved drawing', exact: true }).click(); expect(await documentState(page)).toEqual(after);
  });

  test(`${mode} synthetic coalesced tilt and bearing change calligraphy while barrel twist does not`, async ({ page }) => {
    await prepare(page, mode); await configure(page, 'calligraphy', 20);
    await page.getByTestId('drawing-freehand-property-use-tilt').check();
    await page.getByTestId('drawing-freehand-property-use-bearing').check();
    const before = await documentState(page), b = await canvasBounds(page), y = b.y + b.height * .4;
    const point = (x: number, tiltX: number, tiltY: number, twist = 0): PenPoint => ({ x: b.x + b.width * x, y, pressure: 1, tiltX, tiltY, twist });
    const start = point(.2, 60, 0), samples = [
      point(.3, 60, 0), point(.4, 60, 0, 90), point(.5, 60, 0, 180),
      point(.5, 0, 60, 180), point(.65, 0, 60, 90), point(.8, 0, 60),
    ];
    await penEvent(canvas(page), 'pointerdown', start);
    await penEvent(canvas(page), 'pointermove', samples.at(-1)!, samples);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-sample-count', '7');
    await expect(page.getByTestId('drawing-freehand-property-use-bearing')).toBeDisabled();
    expect(await documentState(page)).toEqual(before);
    await penEvent(canvas(page), 'pointerup', { ...samples.at(-1)!, pressure: 0 });
    await expect.poll(async () => addedShapes(before, await documentState(page)).length).toBe(1);
    const after = await documentState(page), [shape] = addedShapes(before, after); expectFilledCalligraphy(shape);
    // Tilt 60° from vertical gives altitude 30°. Along +X its minor-axis width
    // is 20*sin(30°)=10, even as barrel twist changes. A +Y bearing gives 20.
    for (const fraction of [.32, .43]) {
      const probe = await toPage(page, point(fraction, 60, 0));
      expect(Math.abs(verticalSpan(shape, probe.x) - 10)).toBeLessThan(.15);
    }
    const broad = await toPage(page, point(.7, 0, 60));
    expect(Math.abs(verticalSpan(shape, broad.x) - 20)).toBeLessThan(.15);
    expect(protectedForms(after)).toEqual(protectedForms(before));
    await undoRedoReload(page, before, after);
  });

  test(`${mode} Freehand continues the selected endpoint, inherits its paint and closes the same curve`, async ({ page }) => {
    await prepare(page, mode); const { after: original, curve } = await createOpenCurve(page);
    await numeric(page, 'width', 12 * 25.4 / 96); await setColor(page, '#e11d48');
    expect(await documentState(page)).toEqual(original);
    await page.getByTestId('drawing-tool-select').click(); await chooseFreehand(page);
    await expect(page.getByTestId('drawing-freehand-property-continue')).toBeChecked();
    const start = await endpoint(page, curve, 'end'), b = await canvasBounds(page);
    await drag(page, [start,
      { x: b.x + b.width * .57, y: b.y + b.height * .45 },
      { x: b.x + b.width * .73, y: b.y + b.height * .35 },
    ], false);
    expect(await documentState(page)).toEqual(original);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-continuation', curve.id);
    await expectSourcePreview(page, curve);
    await expect(page.getByTestId('drawing-freehand-property-continue')).toBeDisabled();
    await page.mouse.up(); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    await expect(page.getByTestId('cad-freehand-source-preview')).toHaveCount(0);
    const extended = await documentState(page), continued = extended.shapes.find((shape: any) => shape.id === curve.id);
    expect(addedShapes(original, extended)).toEqual([]); expect(extended.shapes).toHaveLength(original.shapes.length);
    expect(continued.meta).toEqual(curve.meta); expect(continued.opacity).toBe(curve.opacity);
    expect(continued.props.contours[0].nodes.length).toBeGreaterThan(curve.props.contours[0].nodes.length);
    expect(continued.props.contours[0].nodes.slice(0, curve.props.contours[0].nodes.length - 1)).toEqual(curve.props.contours[0].nodes.slice(0, -1));
    expect((await scene(page)).selected).toEqual([curve.id]);
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(original);
    await page.getByTestId('drawing-redo').click(); expect(await documentState(page)).toEqual(extended);

    await page.getByTestId('drawing-tool-select').click();
    const selectedEnd = await endpoint(page, continued, 'end'); await page.mouse.click(selectedEnd.x, selectedEnd.y);
    await expect.poll(async () => (await scene(page)).selected).toEqual([curve.id]); await chooseFreehand(page);
    await page.getByTestId('drawing-freehand-property-close').check();
    const from = await endpoint(page, continued, 'end'), target = await endpoint(page, continued, 'start');
    await drag(page, [from, { x: (from.x + target.x) / 2, y: b.y + b.height * .65 }, target], false);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-continuation', curve.id);
    await expectSourcePreview(page, curve);
    await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-close-candidate', 'true');
    expect(await documentState(page)).toEqual(extended);
    await page.mouse.up(); await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
    await expect(page.getByTestId('cad-freehand-source-preview')).toHaveCount(0);
    const closed = await documentState(page), result = closed.shapes.find((shape: any) => shape.id === curve.id);
    expect(result.props.contours[0].closed).toBe(true); expect(result.meta).toEqual(curve.meta);
    expect(addedShapes(original, closed)).toEqual([]); expect(protectedForms(closed)).toEqual(protectedForms(original));
    await undoRedoReload(page, extended, closed);
  });

  test(`${mode} disabling continuation creates a separate curve and canceled extensions leave their source intact`, async ({ page }) => {
    await prepare(page, mode); const { after: original, curve } = await createOpenCurve(page);
    await page.getByTestId('drawing-freehand-property-continue').uncheck();
    const start = await endpoint(page, curve, 'end'), b = await canvasBounds(page);
    const end = { x: b.x + b.width * .72, y: b.y + b.height * .56 };
    await drag(page, [start, end]);
    const separate = await documentState(page); expect(addedShapes(original, separate)).toHaveLength(1);
    expect(separate.shapes.find((shape: any) => shape.id === curve.id)).toEqual(curve);
    await page.getByTestId('drawing-undo').click(); expect(await documentState(page)).toEqual(original);
    // Enable before re-entering Freehand: entry with continuation disabled
    // deliberately clears selection and would make these new-stroke checks.
    await page.getByTestId('drawing-freehand-property-continue').check();
    await page.getByTestId('drawing-tool-select').click(); await page.mouse.click(start.x, start.y);
    await expect.poll(async () => (await scene(page)).selected).toEqual([curve.id]); await chooseFreehand(page);
    const penStart = { ...start, pressure: .8, tiltX: 20, tiltY: 0 }, penEnd = { ...end, pressure: .8, tiltX: 20, tiltY: 0 };
    for (const interruption of ['Escape', 'pointercancel', 'readonly']) {
      await penEvent(canvas(page), 'pointerdown', penStart); await penEvent(canvas(page), 'pointermove', penEnd);
      await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(1); expect(await documentState(page)).toEqual(original);
      await expect(page.getByTestId('cad-freehand-preview')).toHaveAttribute('data-continuation', curve.id);
      await expectSourcePreview(page, curve);
      if (interruption === 'Escape') await page.keyboard.press('Escape');
      else if (interruption === 'pointercancel') await penEvent(canvas(page), 'pointercancel', { ...penEnd, pressure: 0 });
      else await page.getByRole('button', { name: 'Toggle read only', exact: true }).click();
      await expect(page.getByTestId('cad-freehand-preview')).toHaveCount(0);
      await expect(page.getByTestId('cad-freehand-source-preview')).toHaveCount(0);
      await penEvent(canvas(page), 'pointerup', { ...penEnd, pressure: 0 }); expect(await documentState(page)).toEqual(original);
    }
    await expect(page.getByTestId('drawing-freehand-property-continue')).toBeDisabled();
    await penEvent(canvas(page), 'pointerdown', penStart); await penEvent(canvas(page), 'pointerup', penEnd);
    await expect(page.getByTestId('cad-freehand-source-preview')).toHaveCount(0);
    expect(await documentState(page)).toEqual(original);
  });
}
