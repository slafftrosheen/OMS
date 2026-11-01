import { expect, test, type Page, type Route } from '@playwright/test';
import { orderSheetBaseOrder, orderSheetIds, orderSheetLongNote, orderSheetMaterials,
  orderSheetSnapshot, orderSheetUsers } from '../ui/order-sheet-fixtures';
import type { OrderSheetSnapshot } from '../../src/lib/order/order-sheet';
import { readFileSync } from 'node:fs';

const en = JSON.parse(readFileSync(new URL('../../src/locales/en.json', import.meta.url), 'utf8')) as {
  productionReadiness: { profileSelect: string };
};

test.use({ serviceWorkers: 'block', viewport: { width: 1765, height: 1000 } });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

type Options = {
  manager?: boolean;
  status?: string;
  mode?: 'detail' | 'sheet' | 'packet' | 'editor';
  snapshot?: (snapshot: OrderSheetSnapshot) => unknown;
  draftResponder?: (route: Route, snapshot: OrderSheetSnapshot) => Promise<void>;
  writeResponder?: (route: Route) => Promise<void>;
};
async function fixture(page: Page, options: Options = {}) {
  let actor = options.manager ? orderSheetUsers.manager : orderSheetUsers.worker;
  const writes: string[] = [], unexpected: string[] = [], navigation: string[] = [];
  const savedRequests: Array<{path:string;body:any}> = [];
  page.on('console', message => {
    if (message.text().startsWith('[Mock navigation] goto: ')) navigation.push(message.text().replace('[Mock navigation] goto: ', ''));
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${path}`);
      savedRequests.push({path,body:request.postDataJSON()});
      if (options.writeResponder) return options.writeResponder(route);
      return route.fulfill({ status: 405, json: { error: 'No writes allowed in the saved-order fixture' } });
    }
    if (path === '/api/auth') return route.fulfill({ json: { user: actor } });
    if (path === '/api/materials') {
      const categories = (url.searchParams.get('categories') || url.searchParams.get('category'))?.split(',');
      return route.fulfill({ json: categories ? orderSheetMaterials.filter(item => categories.includes(item.category)) : orderSheetMaterials });
    }
    if (path === '/api/order/profile-choices') return route.fulfill({ json: { templates: [{ id: 'verified-template', code: 'LED', name: 'Verified channel letters' }], truncated: false } });
    if (/^\/api\/draft-orders\/[^/]+\/canvas-state$/.test(path)) return route.fulfill({ json: { snapshot: null } });
    if (/^\/api\/draft-orders\/[^/]+\/change-requests$/.test(path)) return route.fulfill({ json: [] });
    if (path === '/api/material-thickness-options') return route.fulfill({ json: [1.5, 2, 3, 5, 8].map(thickness => ({ thickness, unit: 'mm' })) });
    if (path === '/api/files') return route.fulfill({ headers: { 'X-Total-Count': '1' }, json: [{
      id: 'f6666666-6666-4666-8666-666666666666', originalName: 'approved-drawing.pdf', storedName: 'approved-drawing.pdf',
      mimeType: 'application/pdf', size: 2048, path: 'orders/approved-drawing.pdf', category: 'drawing',
      uploadedBy: orderSheetUsers.manager.id, uploadedAt: '2026-10-30T10:00:00Z'
    }] });
    if (path === '/api/chat/messages') return route.fulfill({ json: { success: true, messages: [{
      id: 'a7777777-7777-4777-8777-777777777777', userId: orderSheetUsers.manager.id, username: 'Production Manager',
      message: 'The signed drawing is attached for production.', timestamp: '2026-10-31T09:00:00Z'
    }], hasMore: false } });
    const match = path.match(/^\/api\/(draft-orders|orders)\/([^/]+)(?:\/(stages|consumption))?$/);
    if (match) {
      const snapshot = orderSheetSnapshot(match[2], options.status || 'CONFIRMED');
      if (match[1] === 'draft-orders') {
        if (options.draftResponder) return options.draftResponder(route, snapshot);
        return route.fulfill({ json: options.snapshot ? options.snapshot(snapshot) : snapshot });
      }
      if (match[3] === 'stages') return route.fulfill({ json: orderSheetBaseOrder(snapshot).stages });
      if (match[3] === 'consumption') return route.fulfill({ json: [{
        order_id: snapshot.id, station: 'cnc', item_id: 'material-one', sku: 'PLEXIGLAS_GS_1C33', name: 'Yellow acrylic',
        total_quantity: 2, first_logged_at: '2026-10-31T08:00:00Z', last_logged_at: '2026-10-31T08:00:00Z'
      }] });
      return route.fulfill({ json: orderSheetBaseOrder(snapshot) });
    }
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } });
  });
  await page.goto(`/order-sheet.html?mode=${options.mode || 'detail'}`);
  return { writes, savedRequests, unexpected, navigation, setActor: (next: typeof actor) => { actor = next; } };
}

async function ready(page: Page, title = 'Yellow channel letters') {
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('.order-specification .profile-form')).toHaveCount(1);
}
async function settleResize(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth, document: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll<HTMLElement>('body *')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1)
        ? [{ tag: element.tagName, class: element.className, x: rect.x, width: rect.width, right: rect.right, scroll: element.scrollWidth }]
        : [];
    }).slice(0, 30)
  }));
  expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
}

test('Head of Production opens the complete draft form before supporting tabs and retains review actions', async ({ page }, testInfo) => {
  const observed = await fixture(page, { manager: true, status: 'PENDING_REVIEW' });
  await ready(page);
  await expect(page.locator('.order-header').getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to review queue', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveCount(0);
  const form = page.locator('.order-specification');
  await expect(form.getByLabel('Profile name', { exact: true })).toHaveValue('Main yellow profile');
  await expect(form.getByRole('spinbutton', { name: 'Main yellow profile · Quantity', exact: true })).toHaveValue('2');
  await expect(form.locator('[data-material-badge]').filter({ hasText: 'PLEX 1C33/3mm' })).toHaveCSS('background-color', 'rgb(255, 215, 0)');
  await expect(form.locator('[data-material-badge]').filter({ hasText: 'FDM Fiberlogy ASA' })).toBeVisible();
  const print = form.getByRole('checkbox', { name: 'FRONT · FACE · Print on film', exact: true });
  await expect(print).toBeChecked(); await expect(print).toBeDisabled();
  await expect(form.getByText(orderSheetLongNote, { exact: true })).toBeVisible();
  expect(await form.evaluate(element => !!(element.compareDocumentPosition(document.querySelector('.supporting-work')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await form.getByRole('button', { name: 'Show CNC FREZER notes', exact: true }).click();
  await expect(form.getByRole('group', { name: 'CNC FREZER · Notes', exact: true })).toBeFocused();
  await page.locator('.order-header').getByRole('button', { name: 'Edit', exact: true }).click();
  expect(observed.navigation).toContain(`/orders/${orderSheetIds.first}/edit?section=details`);
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('hop-native-order-sheet.png'), fullPage: true });
});

test('ordinary workers see a locked form and can read files, station flow, chat and history', async ({ page }, testInfo) => {
  const observed = await fixture(page);
  await ready(page);
  await expect(page.locator('.order-header').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.locator('.sheet-status')).toContainText('Production specifications are locked');
  await expect(page.locator('.order-specification input:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('.order-specification .edit-selection')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.getByText('approved-drawing.pdf', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Discussion', exact: true }).click();
  await expect(page.getByText('The signed drawing is attached for production.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Consumption', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Yellow acrylic', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
  await expect(page.locator('.order-history-details')).toContainText(orderSheetIds.first);
  await page.getByRole('tab', { name: 'Production Stages', exact: true }).click();
  await expect(page.locator('.stage-card')).toContainText('cnc');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Fixture theme').selectOption('DarkVim');
  await settleResize(page);
  await noOverflow(page);
  const note = page.getByText(orderSheetLongNote, { exact: true });
  await expect(note).toBeVisible();
  expect(await note.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('worker-native-order-sheet-mobile.png'), fullPage: true });
});

for (const failure of ['denied', 'missing', 'wrong-order'] as const) {
  test(`a ${failure} production snapshot has a clear retry state without fabricated fields`, async ({ page }) => {
    let fail = true;
    const observed = await fixture(page, { draftResponder: async (route, snapshot) => {
      if (!fail) return route.fulfill({ json: snapshot });
      if (failure === 'denied') return route.fulfill({ status: 403, json: { error: 'Forbidden' } });
      return route.fulfill({ json: failure === 'missing' ? { ...snapshot, profiles: undefined }
        : { ...snapshot, id: orderSheetIds.second } });
    } });
    const alert = page.locator('.sheet-unavailable');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(failure === 'denied' ? 'This account cannot read the saved order form' : 'The saved order form could not be loaded');
    await expect(page.locator('.profile-form')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Files', exact: true })).toBeVisible();
    fail = false;
    await alert.getByRole('button', { name: 'Reload order form', exact: true }).click();
    await ready(page);
    expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
  });
}

test('a delayed first-order snapshot cannot replace the newly selected order', async ({ page }) => {
  let release: (() => void) | undefined;
  let held = false;
  const observed = await fixture(page, { draftResponder: async (route, snapshot) => {
    if (snapshot.id === orderSheetIds.first) {
      held = true; await new Promise<void>(resolve => release = resolve);
    }
    await route.fulfill({ json: snapshot }).catch(() => {});
  } });
  await expect.poll(() => held).toBe(true);
  await page.getByRole('button', { name: 'Switch order fixture', exact: true }).click();
  await ready(page, 'Second production sign');
  await expect(page.getByLabel('Profile name', { exact: true })).toHaveValue('Second resin profile');
  release?.();
  await expect(page.locator('.order-specification')).not.toContainText('Main yellow profile');
  await expect(page.locator('[data-material-badge]').filter({ hasText: 'Anycubic Resin Tough' })).toBeVisible();
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});

test('switching accounts clears the previous form before denied access resolves', async ({ page }) => {
  let deny = false, release: (() => void) | undefined, requested = false;
  const observed = await fixture(page, { draftResponder: async (route, snapshot) => {
    if (!deny) return route.fulfill({ json: snapshot });
    requested = true; await new Promise<void>(resolve => release = resolve);
    await route.fulfill({ status: 403, json: { error: 'Forbidden' } });
  } });
  await ready(page);
  deny = true; observed.setActor(orderSheetUsers.second);
  await page.getByRole('button', { name: 'Switch account fixture', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('.profile-form')).toHaveCount(0);
  release?.();
  await expect(page.locator('.sheet-unavailable')).toContainText('This account cannot read the saved order form');
  await expect(page.locator('.order-header').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out fixture', exact: true }).click();
  await expect(page.locator('.order-header')).toHaveCount(0);
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});

test('the shared inline editor synchronizes saved replacements without emitting hydration edits', async ({ page }) => {
  const observed = await fixture(page, { mode: 'sheet', manager: true });
  const profileName = page.getByLabel('Profile name', { exact: true });
  await expect(profileName).toHaveValue('Main yellow profile');
  await expect(page.getByTestId('order-sheet-changes')).toHaveText('0');
  await profileName.fill('Explicit user change');
  await expect(page.getByTestId('order-sheet-changes')).toHaveText('1');
  await page.getByRole('button', { name: 'Replace saved profile fixture', exact: true }).click();
  await expect(profileName).toHaveValue('Second resin profile');
  await expect(page.getByTestId('order-sheet-changes')).toHaveText('1');
  await page.getByRole('button', { name: 'View production form', exact: true }).click();
  await expect(page.locator('.order-profile-sheet .profile-form')).toHaveCount(0);
  const focused = page.getByRole('region', { name: 'Focused fixture editor' });
  await focused.getByLabel('Profile name', { exact: true }).fill('Discard this staged name');
  await focused.getByRole('button', { name: 'Discard focused fixture', exact: true }).click();
  await expect(profileName).toHaveValue('Second resin profile');
  await page.getByRole('button', { name: 'View production form', exact: true }).click();
  await focused.getByLabel('Profile name', { exact: true }).fill('Applied focused change');
  await focused.getByRole('button', { name: 'Apply focused fixture', exact: true }).click();
  await expect(profileName).toHaveValue('Applied focused change');
  await expect(page.getByTestId('order-sheet-changes')).toHaveText('1');
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});

test('the station packet immediately displays the same saved native form and changes with its order', async ({ page }, testInfo) => {
  const observed = await fixture(page, { mode: 'packet' });
  const packet = page.getByRole('region', { name: 'Production packet', exact: true });
  await expect(packet.locator('.profile-form')).toHaveCount(1);
  await expect(packet.getByLabel('Profile name', { exact: true })).toHaveValue('Main yellow profile');
  await expect(packet.getByRole('button', { name: 'View production form', exact: true })).toHaveCount(0);
  await expect(packet.getByText(orderSheetLongNote, { exact: true })).toBeVisible();
  await expect(packet.getByRole('link', { name: 'approved-drawing.pdf', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 700, height: 900 });
  await settleResize(page);
  await noOverflow(page);
  const material = packet.locator('[data-material-badge]').filter({ hasText: 'PLEX 1C33/3mm' });
  await material.scrollIntoViewIfNeeded();
  await expect(material).toBeInViewport();
  const note = packet.getByText(orderSheetLongNote, { exact: true });
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeInViewport();
  await packet.evaluate(element => element.scrollTop = 0);
  await settleResize(page);
  await expect(material).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('station-native-order-sheet.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch order fixture', exact: true }).click();
  await expect(packet.getByLabel('Profile name', { exact: true })).toHaveValue('Second resin profile');
  await page.getByRole('button', { name: 'Sign out fixture', exact: true }).click();
  await expect(packet.locator('.profile-form')).toHaveCount(0);
  await expect(packet.getByRole('alert')).toContainText('This account cannot read the saved order form');
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});

test('same-account role changes revalidate the main order form before exposing it again', async ({ page }) => {
  let denied = false;
  const observed = await fixture(page, { manager: true, status: 'PENDING_REVIEW', draftResponder: async (route, snapshot) => {
    await route.fulfill(denied ? { status: 403, json: { error: 'Forbidden' } } : { json: snapshot });
  } });
  await ready(page);
  denied = true;
  await page.getByRole('button', { name: 'Demote current account fixture', exact: true }).click();
  await expect(page.locator('.profile-form')).toHaveCount(0);
  await expect(page.locator('.sheet-unavailable')).toContainText('This account cannot read the saved order form');
  await expect(page.locator('.order-header').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});

async function editorReady(page: Page, profile = 'Main yellow profile') {
  const sheet = page.locator('.inline-order-specification');
  await expect(sheet.getByLabel('Profile name', { exact: true })).toHaveValue(profile);
  await expect(page.locator('.editor-load-state')).toHaveCount(0);
  return sheet;
}

test('the actual editor clears a legacy template alias and saves an explicit null through the versioned API', async ({ page }) => {
  const observed = await fixture(page, { manager: true, mode: 'editor', status: 'PENDING_REVIEW',
    snapshot: snapshot => ({ ...snapshot, profiles: snapshot.profiles.map(profile => ({
      ...profile, profileTemplateId: undefined, profile_template_id: 'verified-template'
    })) }),
    writeResponder: async route => route.fulfill({ json: { id: orderSheetIds.first, updatedAt: '2026-10-31T11:00:00Z' } })
  });
  const sheet = await editorReady(page);
  const template = sheet.getByLabel(en.productionReadiness.profileSelect);
  await expect(template).toHaveValue('verified-template');
  expect(observed.writes).toEqual([]);
  await template.selectOption('');
  await expect(template).toHaveValue('');
  await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
  await expect.poll(() => observed.savedRequests.filter(request => request.path === `/api/draft-orders/${orderSheetIds.first}`).length).toBe(1);
  const request = observed.savedRequests.find(request => request.path === `/api/draft-orders/${orderSheetIds.first}`)!;
  expect(request.body.expectedUpdatedAt).toBe('2026-10-31T10:00:00Z');
  expect(request.body.profiles[0].profileTemplateId).toBeNull();
  expect(request.body.profiles[0].configuration.CNC_FREZER.faceMaterials[0].value).toBe('PLEXIGLAS_GS_1C33');
  await expect(template).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save all changes', exact: true })).toBeEnabled();
  expect(observed.unexpected).toEqual([]);
});

test('a late editor save response cannot change the next order revision or profile', async ({ page }) => {
  let release: (() => void) | undefined, held = false;
  const observed = await fixture(page, { manager: true, mode: 'editor', status: 'PENDING_REVIEW', writeResponder: async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/draft-orders/${orderSheetIds.first}`) {
      held = true; await new Promise<void>(resolve => release = resolve);
    }
    await route.fulfill({ json: { updatedAt: path.includes(orderSheetIds.first) ? '2026-10-31T14:00:00Z' : '2026-10-31T12:00:00Z' } }).catch(() => {});
  } });
  const first = await editorReady(page);
  await first.getByLabel('Profile name', { exact: true }).fill('First order in-flight save');
  await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await page.getByRole('button', { name: 'Switch order fixture', exact: true }).click();
  const next = await editorReady(page, 'Second resin profile');
  release?.();
  await expect(next).not.toContainText('First order in-flight save');
  await next.getByLabel('Profile name', { exact: true }).fill('Second order explicit change');
  await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
  await expect.poll(() => observed.savedRequests.filter(request => request.path === `/api/draft-orders/${orderSheetIds.second}`).length).toBe(1);
  const request = observed.savedRequests.find(request => request.path === `/api/draft-orders/${orderSheetIds.second}`)!;
  expect(request.body.expectedUpdatedAt).toBe('2026-10-31T10:00:00Z');
  expect(request.body.profiles[0].configuration.profileName).toBe('Second order explicit change');
  expect(observed.unexpected).toEqual([]);
});

test('the actual editor discards stale account, role and station loads before enabling edits', async ({ page }) => {
  let call = 0, release: (() => void) | undefined;
  const observed = await fixture(page, { manager: true, mode: 'editor', status: 'PENDING_REVIEW', draftResponder: async (route, snapshot) => {
    const request = ++call;
    if (request === 2) await new Promise<void>(resolve => release = resolve);
    if (request === 3) return route.fulfill({ status: 403, json: { error: 'Forbidden' } });
    const ownerSnapshot = { ...snapshot, createdBy: orderSheetUsers.second.id,
      profiles: snapshot.profiles.map(profile => ({ ...profile, configuration: { ...profile.configuration,
        profileName: request >= 4 ? 'New account verified profile' : request === 2 ? 'Stale station response' : 'Main yellow profile'
      } })) };
    await route.fulfill({ json: ownerSnapshot }).catch(() => {});
  } });
  await editorReady(page);
  await page.getByRole('button', { name: 'Change station assignment fixture', exact: true }).click();
  await expect.poll(() => call).toBe(2);
  await expect(page.locator('.inline-order-specification')).toHaveCount(0);
  await page.getByRole('button', { name: 'Demote current account fixture', exact: true }).click();
  await expect(page.locator('.editor-load-state')).toContainText('This account cannot read the saved order form');
  release?.();
  await expect(page.locator('.inline-order-specification')).toHaveCount(0);
  observed.setActor(orderSheetUsers.second);
  await page.getByRole('button', { name: 'Switch account fixture', exact: true }).click();
  const sheet = await editorReady(page, 'New account verified profile');
  await expect(sheet.getByLabel('Profile name', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save all changes', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out fixture', exact: true }).click();
  await expect(page.locator('.inline-order-specification')).toHaveCount(0);
  await expect(page.locator('.editor-load-state')).toContainText('This account cannot read the saved order form');
  expect(observed.writes).toEqual([]); expect(observed.unexpected).toEqual([]);
});
