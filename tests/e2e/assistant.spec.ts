import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

type ObservedRequest = { method: string; path: string; body: any };
type Provider = (route: Route, request: ObservedRequest, call: number) => Promise<void>;
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

async function assistantFixture(page: Page, provider?: Provider, toolProvider?: Provider, url = '/assistant.html') {
  const requests: ObservedRequest[] = [];
  const abortedPosts: string[] = [];
  page.on('requestfailed', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/ai/assistant') {
      abortedPosts.push(request.failure()?.errorText ?? 'failed');
    }
  });
  await page.route('**/api/ai/assistant**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const observed = {
      method: request.method(),
      path: url.searchParams.get('path') ?? url.pathname,
      body: request.method() === 'POST' ? request.postDataJSON() : null
    };
    requests.push(observed);
    const call = requests.filter(item => item.method === observed.method).length;
    if (observed.method === 'GET') {
      if (toolProvider) return toolProvider(route, observed, call);
      return route.fulfill({ json: { tools: observed.path === '/inventory'
        ? [{ id: 'data.low_stock', label: 'Recorded low stock' }]
        : [{ id: 'catalog.search', label: 'Material catalog' }] } });
    }
    if (provider) return provider(route, observed, call);
    return route.fulfill({ json: { reply: 'Use the selected Mean Well model and confirm its voltage.', toolsUsed: ['catalog.search'] } });
  });
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Open assistant', exact: true })).toBeVisible();
  return {
    requests,
    abortedPosts,
    posts: () => requests.filter(request => request.method === 'POST'),
    gets: () => requests.filter(request => request.method === 'GET')
  };
}

async function openScreenHelp(page: Page) {
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Screen help', exact: true }).click();
  await expect(page.getByLabel('Question for the assistant', { exact: true })).toBeVisible();
}

async function sendQuestion(page: Page, question: string) {
  await page.getByLabel('Question for the assistant', { exact: true }).fill(question);
  await page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.' }).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

test('one floating launcher stays dormant and opens the native tools for the current screen', async ({ page }) => {
  const observed = await assistantFixture(page);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Open assistant', exact: true })).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('native-mounts')).toHaveText('0');
  expect(observed.requests).toEqual([]);

  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Order checks', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Attachment analysis', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review the selected order' })).toBeVisible();
  await page.getByRole('button', { name: 'Run native order check' }).click();
  await expect(page.getByTestId('native-actions')).toHaveText('1');
  expect(observed.requests).toEqual([]);

  await page.getByRole('button', { name: 'Change route' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stock checks', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Order checks', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Check recorded stock' })).toBeVisible();
  expect(observed.posts()).toHaveLength(0);
});

test('native drafts survive hiding, reopening, native-tool switching and general conversation', async ({ page }) => {
  const observed = await assistantFixture(page);
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await page.getByLabel('Native review draft', { exact: true }).fill('Keep my unsaved technical review');
  await expect(page.getByTestId('native-mounts')).toHaveText('1');
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await expect(page.getByLabel('Native review draft', { exact: true })).toHaveValue('Keep my unsaved technical review');

  await page.getByRole('button', { name: 'Attachment analysis', exact: true }).click();
  await page.getByLabel('Native file note', { exact: true }).fill('Drawing needs a mounting detail');
  await page.getByRole('button', { name: 'Screen help', exact: true }).click();
  await expect.poll(() => observed.gets().length).toBe(1);
  await page.getByRole('button', { name: 'Order checks', exact: true }).click();
  await expect(page.getByLabel('Native review draft', { exact: true })).toHaveValue('Keep my unsaved technical review');
  await page.getByRole('button', { name: 'Attachment analysis', exact: true }).click();
  await expect(page.getByLabel('Native file note', { exact: true })).toHaveValue('Drawing needs a mounting detail');
  await expect(page.getByTestId('native-mounts')).toHaveText('1');
  await expect(page.getByTestId('native-disposals')).toHaveText('0');
  expect(observed.posts()).toHaveLength(0);
});

test('sending requires consent and reads the current unsaved screen context at the moment of send', async ({ page }) => {
  const observed = await assistantFixture(page);
  await openScreenHelp(page);
  await expect.poll(() => observed.gets().length).toBe(1);
  await page.getByLabel('Question for the assistant', { exact: true }).fill('Check the latest selected supply');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.' }).check();
  expect(observed.posts()).toHaveLength(0);

  // The drawer is already open. A captured-on-open snapshot would fail this.
  await page.getByLabel('Current draft notes', { exact: true }).fill('Latest unsaved requirement: 12V outdoor sign');
  await page.getByLabel('Selected material', { exact: true }).fill('Mean Well XLG-150-12');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Use the selected Mean Well model');
  expect(observed.posts()).toHaveLength(1);
  expect(observed.posts()[0].body).toMatchObject({
    question: 'Check the latest selected supply', consent: true, language: 'en', history: [],
    screen: { path: '/orders/new', title: 'Window-sign draft', data: {
      notes: 'Latest unsaved requirement: 12V outdoor sign', selectedMaterial: 'Mean Well XLG-150-12', unsaved: true
    } }
  });
  expect(JSON.stringify(observed.posts()[0].body)).not.toContain('fixture-secret');
  expect(JSON.stringify(observed.posts()[0].body)).not.toContain('fixture-file-bytes');
  await expect(page.getByLabel('Question for the assistant', { exact: true })).toBeEmpty();
  await expect(page.getByRole('log')).toContainText('Material catalog');
});

test('a provider error preserves the question and a deliberate retry succeeds without duplicate history', async ({ page }) => {
  const observed = await assistantFixture(page, async (route, _request, call) => {
    await route.fulfill(call === 1
      ? { status: 503, json: { error: 'Provider unavailable' } }
      : { json: { reply: 'Retry completed with the current draft.', toolsUsed: [] } });
  });
  await openScreenHelp(page);
  await sendQuestion(page, 'Keep this question through a provider failure');
  await expect(page.getByRole('alert')).toContainText('Your question is kept here');
  await expect(page.getByLabel('Question for the assistant', { exact: true })).toHaveValue('Keep this question through a provider failure');
  await expect(page.getByRole('log')).not.toContainText('Keep this question through a provider failure');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Retry completed with the current draft.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(observed.posts()).toHaveLength(2);
  expect(observed.posts()[0].body.history).toEqual([]);
  expect(observed.posts()[1].body.history).toEqual([]);
  await expect(page.getByRole('log').getByText('Keep this question through a provider failure', { exact: true })).toHaveCount(1);
});

test('tool-list recovery does not send the pending question', async ({ page }) => {
  const observed = await assistantFixture(page, undefined, async (route, _request, call) => {
    await route.fulfill(call === 1
      ? { status: 503, json: { error: 'Tools temporarily unavailable' } }
      : { json: { tools: [{ id: 'catalog.search', label: 'Material catalog' }] } });
  });
  await openScreenHelp(page);
  await page.getByLabel('Question for the assistant', { exact: true }).fill('Question waiting for me');
  await page.getByText('Context and tools', { exact: false }).click();
  await expect(page.getByText('Tools could not be loaded.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Material catalog', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Question for the assistant', { exact: true })).toHaveValue('Question waiting for me');
  expect(observed.gets()).toHaveLength(2);
  expect(observed.posts()).toHaveLength(0);
});

for (const boundary of ['route', 'account'] as const) {
  test(`${boundary} changes clear the conversation, close the drawer and abort an obsolete request`, async ({ page }) => {
    let release!: () => void;
    let settled!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const completed = new Promise<void>(resolve => { settled = resolve; });
    const observed = await assistantFixture(page, async (route, _request, call) => {
      if (call === 1) return route.fulfill({ json: { reply: 'Private answer from the first screen and account.', toolsUsed: [] } });
      await held;
      try { await route.fulfill({ json: { reply: 'Obsolete response must not appear.', toolsUsed: [] } }); }
      catch { /* Chromium may have already canceled the intercepted request. */ }
      finally { settled(); }
    });
    try {
      await openScreenHelp(page);
      await sendQuestion(page, 'First private question');
      await expect(page.getByRole('log')).toContainText('Private answer from the first screen');
      await sendQuestion(page, 'Wait for a slow answer');
      await expect.poll(() => observed.posts().length).toBe(2);
      await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
      await page.getByRole('button', { name: boundary === 'route' ? 'Change route' : 'Change account', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByTestId(boundary)).toHaveText(boundary === 'route' ? '/inventory' : 'account-two');
      release();
      await completed;
      await expect.poll(() => observed.abortedPosts.length).toBe(1);
      await openScreenHelp(page);
      await expect(page.getByRole('log')).not.toContainText('Private answer from the first screen');
      await expect(page.getByRole('log')).not.toContainText('Obsolete response');
      await expect(page.getByLabel('Question for the assistant', { exact: true })).toBeEmpty();
      await expect(page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.' })).not.toBeChecked();
      expect(observed.posts()).toHaveLength(2);
      if (boundary === 'route') {
        await expect(page.getByRole('button', { name: 'Stock checks', exact: true })).toBeVisible();
        await expect.poll(() => observed.gets().at(-1)?.path).toBe('/inventory');
      }
    } finally { release(); }
  });
}

test('context preview reflects current selections and never exposes hidden context keys', async ({ page }) => {
  const observed = await assistantFixture(page);
  await openScreenHelp(page);
  await page.getByText('Context and tools', { exact: false }).click();
  const details = page.getByRole('dialog', { name: 'Assistant', exact: true }).locator('.context-details');
  await expect(details).toContainText('Mean Well LRS-100-12');
  await page.getByLabel('Selected material', { exact: true }).fill('Mean Well HDR-60-24');
  await expect(details).toContainText('Mean Well HDR-60-24');
  await expect(details).not.toContainText('fixture-secret');
  await expect(details).not.toContainText('fixture-file-bytes');
  expect(observed.posts()).toHaveLength(0);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 568 }]) {
  test(`screen-help composer remains reachable before and after long replies at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await assistantFixture(page, route => route.fulfill({ json: { reply: 'Check the selected product model against the recorded catalog specifications.\n\n'.repeat(45), toolsUsed: [] } }));
    await openScreenHelp(page);
    const panel = page.getByRole('dialog', { name: 'Assistant', exact: true });
    const withinPanel = async () => {
      const bounds = await panel.boundingBox();
      for (const control of [page.getByLabel('Question for the assistant', { exact: true }), page.getByRole('button', { name: 'Send', exact: true })]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(bounds!.y);
        expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      }
      expect(await panel.locator('.messages').evaluate(element => element.clientHeight)).toBeGreaterThan(75);
    };
    await withinPanel();
    await sendQuestion(page, 'Review the current selections.');
    await expect(page.getByRole('log')).toContainText('recorded catalog specifications');
    await withinPanel();
    expect(await panel.locator('.messages').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`assistant-composer-${viewport.width}.png`) });
  });
}

test('workflow offers open a current native tool only on click and disappear when the tool is removed', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  await page.route('**/api/files?*', route => route.fulfill({ headers: { 'X-Total-Count': '0' }, json: [] }));
  const observed = await assistantFixture(page, route => route.fulfill({ json: {
    reply: 'Choose drawing intake to review the file.', toolsUsed: [], suggestedWorkflows: ['intake', 'save-order', 'canvas']
  } }), undefined, '/assistant.html?native=order');
  await openScreenHelp(page);
  await sendQuestion(page, 'Where should I analyze my drawing?');
  const panel = page.getByRole('dialog', { name: 'Assistant', exact: true });
  const offer = panel.getByRole('button', { name: 'Open Drawing intake', exact: true });
  await expect(offer).toBeVisible();
  await expect(panel.locator('.intake')).toBeHidden();
  await expect(panel.locator('.workflow-suggestions button')).toHaveCount(1);
  expect(observed.posts()[0].body.screen.workflows.map((tool: any) => tool.id)).toEqual(['discuss', 'intake', 'readiness']);
  await offer.click();
  await expect(panel.locator('.intake')).toBeVisible();
  await expect(panel.getByRole('navigation').getByRole('button', { name: 'Drawing intake', exact: true })).toBeFocused();
  expect(posts).toEqual(['/api/ai/assistant']);
  await panel.getByRole('button', { name: 'Screen help', exact: true }).click();
  await page.getByRole('button', { name: 'Disable intake tool', exact: true }).click();
  await expect(offer).toHaveCount(0);
  await expect(panel.getByRole('navigation').getByRole('button', { name: 'Drawing intake', exact: true })).toHaveCount(0);
});

test('one assistant follows an opted-in native profile dialog and leaves confirmation dialogs modal', async ({ page }) => {
  const observed = await assistantFixture(page);
  await page.getByRole('button', { name: 'Edit profile in dialog', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Profile editor fixture', exact: true });
  await expect(editor.locator('.assistant-layer')).toHaveCount(1);
  await page.getByLabel('Pending profile material', { exact: true }).fill('WAGO 221-413 pending choice');
  await openScreenHelp(page);
  await sendQuestion(page, 'Review this staged profile.');
  await expect(page.getByRole('log')).toContainText('selected Mean Well');
  expect(observed.posts()[0].body.screen.data.nativeProfileDraft).toMatchObject({ material: 'WAGO 221-413 pending choice', appliedToOrder: false });
  await page.getByRole('button', { name: 'Close assistant', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Close profile editor', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.assistant-layer')).toHaveCount(1);
  expect(await page.locator('.assistant-layer').evaluate(element => !!element.closest('dialog'))).toBe(false);
  await openScreenHelp(page);
  await sendQuestion(page, 'Now review the whole order.');
  await expect.poll(() => observed.posts().length).toBe(2);
  expect(observed.posts()[1].body.screen.data.nativeProfileDraft).toBeNull();
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Open confirmation', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirmation fixture', exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator('.assistant-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel confirmation', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancel confirmation', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  expect(observed.posts()).toHaveLength(2);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`assistant fits ${viewport.width}px, keeps navigation clear and returns keyboard focus on Escape`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await assistantFixture(page);
    const launcher = page.getByRole('button', { name: 'Open assistant', exact: true });
    const launcherBox = await launcher.boundingBox();
    const navBox = await page.getByTestId('bottom-navigation').boundingBox();
    expect(launcherBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(launcherBox!.y + launcherBox!.height).toBeLessThanOrEqual(navBox!.y);
    await launcher.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: 'Assistant', exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close assistant', exact: true })).toBeFocused();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(navBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`real native order panes fit the shared drawer at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const calls: string[] = [];
    const drawingName = 'Customer_approved_outdoor_illuminated_channel_letters_mounting_and_power_supply_revision_C.pdf';
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      calls.push(`${request.method()} ${path}`);
      if (path === '/api/files') return route.fulfill({
        headers: { 'X-Total-Count': '1' },
        json: [{ id: 'drawing-one', originalName: drawingName, mimeType: 'application/pdf', size: 2048 }]
      });
      if (path === '/api/ai/order-readiness') return route.fulfill({ json: {
        orderId: '11111111-1111-4111-8111-111111111111', status: 'DRAFT',
        updatedAt: '2026-10-30T10:00:00.000Z', capturedAt: '2026-10-30T10:05:00.000Z',
        state: 'needs-review', issues: [{ code: 'stock-shortfall', severity: 'blocker' }],
        materials: [{ orderMaterialId: 'material-one',
          materialType: 'Mean Well XLG-150-12 outdoor power supply for illuminated channel letters',
          match: 'exact-sku', status: 'insufficient', required: 3, available: 2,
          unit: 'PCS', sku: 'XLG-150-12', inventoryUnit: 'PCS' }],
        profiles: [{ id: 'profile-one', templateCode: '7ST',
          templateName: 'Outdoor illuminated channel letters with aluminium returns',
          quantity1: 3, quantity2: 0, quantity3: 0, quantity4: 0 }],
        fileCount: 1, stageCodes: ['ASSEMBLY'], inventoryChecked: true,
        ai: null, aiWarning: 'Provider unavailable'
      } });
      return route.fulfill({ status: 404, json: { error: `Unexpected fixture request: ${path}` } });
    });
    await page.goto('/assistant.html?native=order');
    await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Assistant', exact: true });
    const tools = panel.getByRole('navigation', { name: 'Tools for this screen' });
    for (const tool of ['Order discussion', 'Drawing intake', 'Production readiness']) {
      await expect(tools.getByRole('button', { name: tool, exact: true })).toBeVisible();
    }
    const verifyAndCapture = async (name: string) => {
      const bounds = await panel.evaluate(element => {
        const body = element.querySelector('.assistant-body') as HTMLElement;
        return {
          panelClient: element.clientWidth, panelScroll: element.scrollWidth,
          bodyClient: body.clientWidth, bodyScroll: body.scrollWidth,
          viewport: window.innerWidth, document: document.documentElement.scrollWidth
        };
      });
      expect(bounds.panelScroll).toBeLessThanOrEqual(bounds.panelClient + 1);
      expect(bounds.bodyScroll).toBeLessThanOrEqual(bounds.bodyClient + 1);
      expect(bounds.document).toBeLessThanOrEqual(bounds.viewport);
      await panel.screenshot({ path: testInfo.outputPath(`native-${name}-${viewport.width}.png`) });
    };
    await expect(panel.locator('.assistant').getByRole('heading', { name: 'Order assistant', exact: true })).toBeVisible();
    await verifyAndCapture('discussion');

    await tools.getByRole('button', { name: 'Drawing intake', exact: true }).click();
    await expect(panel.locator('.intake')).toBeVisible();
    await expect(panel.locator('.intake').getByRole('combobox', { name: 'Source file', exact: true })).toHaveValue('drawing-one');
    await expect(panel.locator('.intake').locator('option', { hasText: drawingName })).toHaveCount(1);
    await verifyAndCapture('intake');
    expect(calls.filter(call => call.startsWith('POST'))).toHaveLength(0);

    await tools.getByRole('button', { name: 'Production readiness', exact: true }).click();
    const readiness = panel.locator('.readiness');
    await expect(readiness).toBeVisible();
    await readiness.getByRole('checkbox').check();
    await readiness.getByRole('button', { name: 'Run readiness check', exact: true }).click();
    await expect(readiness.getByText('XLG-150-12', { exact: false }).first()).toBeVisible();
    await expect(readiness.getByText('Needs manual review', { exact: true })).toBeVisible();
    await readiness.getByRole('heading', { name: 'Production readiness', exact: true }).scrollIntoViewIfNeeded();
    await verifyAndCapture('readiness');
    expect(calls.filter(call => call.startsWith('POST'))).toEqual(['POST /api/ai/order-readiness']);
  });
}
