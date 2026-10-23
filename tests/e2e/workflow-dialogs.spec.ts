import { test, expect, type Page, type Route } from '@playwright/test';

const materialId = '8b823b29-7994-4a22-badb-347796eea333';
async function mountInventory(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth', route => route.fulfill({ json: { user: {
    id: '8b823b29-7994-4a22-badb-347796eea222', username: 'manager',
    displayName: 'Inventory manager', role: 'Boss', stations: []
  } } }));
  await page.route('**/api/inventory/consistency?*', route => route.fulfill({ json: {
    asOf: '2026-10-22T12:00:00Z', page: 1, totalPages: 1, totalMaterials: 1,
    unmappedLegacyCount: 0, divergentOnPage: 1, ambiguousOnPage: 0,
    rows: [{ materialId, sku: 'ACRYLIC-VERY-LONG-MATERIAL-CODE', name: 'Acrylic panel',
      canonicalStock: 10, legacyStock: 8, legacyItemId: 'legacy-1', linkedCount: 1, state: 'DIVERGENT' }]
  } }));
  await page.goto('/workflow-dialogs.html');
  await expect(page.getByRole('button', { name: 'Record physical count', exact: true })).toBeVisible();
  return errors;
}

test('inventory reconciliation keeps its native dialog and draft through a failed busy request', async ({ page }) => {
  const requests: any[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/inventory/consistency', async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await pending;
    await route.fulfill({ status: 503, json: { error: 'Temporary stock service failure' } });
  });
  const errors = await mountInventory(page);
  const trigger = page.getByRole('button', { name: 'Record physical count', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Record physical count/ });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.matches(':modal'))).toBe(true);
  await dialog.getByLabel('Verified physical count', { exact: true }).fill('7');
  const reason = dialog.getByLabel('Evidence and adjustment reason (at least 10 characters)', { exact: true });
  await reason.fill('Counted seven panels in the storage rack.');
  const submit = dialog.getByRole('button', { name: 'Save audited reconciliation', exact: true });
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(submit).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole('alert')).toContainText('Temporary stock service failure');
  await expect(reason).toHaveValue('Counted seven panels in the storage rack.');
  await submit.click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(submit).toBeEnabled();
  expect(requests[0]).toEqual({ materialId, physicalCount: 7, expectedCanonicalStock: 10,
    expectedLegacyStock: 8, reason: 'Counted seven panels in the storage rack.', requestId: expect.any(String) });
  expect(requests[1]).toEqual(requests[0]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('an overflowing table gains keyboard scrolling and drops its extra tab stop when it fits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const errors = await mountInventory(page);
  const region = page.getByRole('region', { name: 'Canonical inventory consistency', exact: true });
  await expect(region).toHaveAttribute('tabindex', '0');
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('inventory-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(region).not.toHaveAttribute('tabindex');
  expect(errors).toEqual([]);
});

const stationOrderId = '8b823b29-7994-4a22-badb-347796eea444';
const stationStageVersion = '2026-10-22T11:30:00Z';

async function mountStation(page: Page, progressWrite?: (route: Route) => Promise<void>,
  progressRead?: (route: Route) => Promise<void>) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth', route => route.fulfill({ json: { user: {
    id: '8b823b29-7994-4a22-badb-347796eea222', username: 'manager',
    displayName: 'Station manager', role: 'Boss', stations: []
  } } }));
  await page.route('**/api/station/CNC/orders', route => route.fulfill({ json: [{
    id: stationOrderId, po_number: 'PO-STATION-42', title: 'Reception lettering', client: 'Fixture client',
    priority: 'NORMAL', due_date: '2026-11-01',
    stage: { station: 'CNC', state: 'IN_PROGRESS', updated_at: stationStageVersion }
  }] }));
  await page.route(`**/api/station/CNC/orders/${stationOrderId}/progress`, async route => {
    if (route.request().method() === 'GET') {
      if (progressRead) await progressRead(route);
      else await route.fulfill({ json: [] });
    }
    else if (progressWrite) await progressWrite(route);
    else await route.fulfill({ status: 405, json: { error: 'Unexpected progress write' } });
  });
  await page.route('**/api/chat', route => route.fulfill({ json: {
    success: true, room: { id: 'station-cnc', name: 'CNC' }
  } }));
  await page.route('**/api/chat/messages?*', route => route.fulfill({ json: { success: true, messages: [] } }));
  await page.route('**/api/users', route => route.fulfill({ json: [] }));
  // Keep the real subscription lifecycle, without connecting to a Supabase service.
  await page.routeWebSocket(/\/realtime\/v1\//, socket => { socket.onMessage(() => {}); });
  await page.route('http://localhost:8000/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js', route => route.fulfill({
    contentType: 'application/javascript', body: 'window.jsQR = () => null;'
  }));
  await page.goto('/workflow-dialogs.html?surface=station');
  await expect(page.getByRole('heading', { name: 'Reception lettering', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log progress', exact: true })).toBeEnabled();
  return errors;
}

test('station progress protects its write and failed draft but allows dismissal while saved history refreshes', async ({ page }) => {
  const requests: unknown[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let releaseHistory!: () => void;
  const historyPending = new Promise<void>(resolve => { releaseHistory = resolve; });
  let holdHistory = false;
  let historyRefreshes = 0;
  let abortedHistory = 0;
  page.on('requestfailed', request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname ===
        `/api/station/CNC/orders/${stationOrderId}/progress`) abortedHistory++;
  });
  const errors = await mountStation(page, async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await pending;
      await route.fulfill({ status: 503, json: { error: 'Temporary progress service failure' } });
    } else {
      holdHistory = true;
      await route.fulfill({ json: { success: true } });
    }
  }, async route => {
    if (!holdHistory) {
      await route.fulfill({ json: [] });
      return;
    }
    historyRefreshes++;
    await historyPending;
    try { await route.fulfill({ json: [] }); }
    catch { /* Closing the saved dialog aborts this deliberately held read. */ }
  });
  const opener = page.getByRole('button', { name: 'Log progress', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Production progress', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.matches(':modal'))).toBe(true);
  await expect(dialog.getByText('No progress reports yet', { exact: true })).toBeVisible();
  const percent = dialog.getByLabel('Progress (%)', { exact: true });
  const note = dialog.getByLabel('Progress note', { exact: true });
  await percent.fill('40');
  await note.fill('First lettering sheet cut; remaining pieces are queued.');
  await dialog.getByRole('button', { name: 'Save progress', exact: true }).click();
  try {
    await expect.poll(() => requests.length).toBe(1);
    await expect(percent).toBeDisabled();
    await expect(note).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    const closeButtons = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(closeButtons).toHaveCount(2);
    await expect(closeButtons.nth(0)).toBeDisabled();
    await expect(closeButtons.nth(1)).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(dialog.getByRole('alert')).toHaveText('Temporary progress service failure');
  await expect(note).toHaveValue('First lettering sheet cut; remaining pieces are queued.');
  await expect(percent).toHaveValue('40');
  await expect(dialog.getByRole('button', { name: 'Save progress', exact: true })).toBeEnabled();
  expect(requests).toEqual([{
    note: 'First lettering sheet cut; remaining pieces are queued.',
    progressPercent: 40, expectedUpdatedAt: stationStageVersion
  }]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(dialog.getByText('No progress reports yet', { exact: true })).toBeVisible();
  await percent.fill('40');
  await note.fill('First lettering sheet cut; remaining pieces are queued.');
  await dialog.getByRole('button', { name: 'Save progress', exact: true }).click();
  try {
    await expect.poll(() => historyRefreshes).toBe(1);
    await expect(dialog.getByRole('status')).toHaveText('Progress saved');
    await expect(dialog.getByText('Loading history…', { exact: true })).toBeVisible();
    await expect(note).toHaveValue('');
    await expect(percent).toHaveValue('');
    const closeButtons = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(closeButtons.nth(0)).toBeEnabled();
    await expect(closeButtons.nth(1)).toBeEnabled();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect.poll(() => abortedHistory).toBe(1);
    expect(requests).toHaveLength(2);
  } finally {
    releaseHistory();
  }
  expect(errors).toEqual([]);
});

test('station Scan QR opens one camera dialog and offers a retry after camera denial', async ({ page }) => {
  await page.addInitScript(() => {
    const cameraRequests: MediaStreamConstraints[] = [];
    Object.assign(window, { __stationCameraRequests: cameraRequests });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        cameraRequests.push(constraints);
        throw new DOMException('Fixture camera denied', 'NotAllowedError');
      }
    } });
  });
  const errors = await mountStation(page);
  const opener = page.getByRole('button', { name: 'Scan Order QR Code', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Scan QR Code', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.matches(':modal'))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__stationCameraRequests)).toEqual([
    { video: { facingMode: 'environment' } }
  ]);
  await expect(dialog.getByText('Camera access denied or not available', { exact: false })).toBeVisible();
  const retry = dialog.getByRole('button', { name: 'Try Again', exact: true });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect.poll(() => page.evaluate(() => (window as any).__stationCameraRequests.length)).toBe(2);
  await expect(dialog.getByText('Camera access denied or not available', { exact: false })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});
