import { test, expect, type Page } from '@playwright/test';

const day = '2026-10-22';
const orderId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const loadingId = '20000000-0000-4000-8000-000000000001';
const user = { id: orderId(99), username: 'calendar-manager', displayName: 'Calendar Manager', role: 'Boss', stations: [] };
const calendarOrders = [
  { id: orderId(1), poNumber: 'PO-1001', title: 'Storefront letters', clientName: 'North Studio', deadline: day, loadingDate: day, status: 'IN_PRODUCTION' },
  { id: orderId(2), poNumber: 'PO-1002', title: 'Reception sign', clientName: 'West Office', deadline: '2026-10-23', loadingDate: day, status: 'READY_TO_LOAD' },
  { id: orderId(3), poNumber: 'PO-1003', title: 'Long translated production title — согласование вывески и готовности заказа', clientName: 'Studio with a deliberately long company name', deadline: '2026-10-21', loadingDate: null, status: 'IN_PRODUCTION' },
  { id: orderId(4), poNumber: 'PO-1004', title: 'Completed work', clientName: 'East Office', deadline: '2026-10-21', loadingDate: null, status: 'COMPLETED' }
];

let runtimeErrors: string[];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
  await page.route('**/api/auth', route => route.fulfill({ json: { user } }));
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));

async function calendarFixture(page: Page, options: { failEvents?: boolean; rejectAssignment?: boolean; role?: string } = {}) {
  const orders = structuredClone(calendarOrders);
  const assignmentRequests: { method: string; url: string; body: unknown }[] = [];
  if (options.role) await page.route('**/api/auth', route => route.fulfill({ json: { user: { ...user, role: options.role } } }));
  await page.route('**/api/draft-orders?*', route => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ json: { data: orders.slice((currentPage - 1) * 2, currentPage * 2), pagination: { page: currentPage, totalPages: 2, hasMore: currentPage < 2 } } });
  });
  await page.route('**/api/loading-days', route => route.fulfill({ json: [
    { id: loadingId, date: day, max_capacity: 10, is_blocked: false, notes: 'Carrier: Local transport — fragile finished signs' },
    { id: '20000000-0000-4000-8000-000000000002', date: '2026-10-23', max_capacity: 10, is_blocked: true, notes: 'Warehouse closed' }
  ] }));
  await page.route('**/api/calendar?*', route => route.fulfill(options.failEvents ? { status: 503, json: [] } : { json: [
    { id: 'meeting-1', kind: 'meeting', date: day, title: 'Production review', start: '09:30', end: '10:00', location: 'Workshop', createdAt: `${day}T08:00:00Z` },
    { id: 'note-1', kind: 'note', date: day, title: 'Bring approval samples', note: 'Keep the signed colour sample with the order.', createdAt: `${day}T08:00:00Z` }
  ] }));
  await page.route('**/api/loading-days/*/orders*', async route => {
    const request = route.request();
    assignmentRequests.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    if (options.rejectAssignment) return route.fulfill({ status: 409, json: { error: 'Complete the quality check before loading.' } });
    const id = request.method() === 'DELETE' ? new URL(request.url()).searchParams.get('orderId') : request.postDataJSON().orderId;
    const order = orders.find(item => item.id === id);
    if (order) order.loadingDate = request.method() === 'DELETE' ? null : day;
    await route.fulfill({ json: { success: true } });
  });
  return assignmentRequests;
}

test('calendar day badges count actual orders, deadlines, meetings and notes across every order page', async ({ page }) => {
  await calendarFixture(page);
  await page.goto('/calendar-notifications.html?surface=calendar');
  const today = page.locator(`[data-date="${day}"]`);
  await expect(today.locator('[data-badge="loading"]')).toContainText('2');
  await expect(today.locator('[data-badge="due"]')).toContainText('1');
  await expect(today.locator('[data-badge="meeting"]')).toContainText('1');
  await expect(today.locator('[data-badge="note"]')).toContainText('1');
  await expect(page.locator('[data-date="2026-10-21"] [data-badge="overdue"]')).toContainText('1');
  await expect(page.locator('[data-date="2026-10-23"] [data-badge="closed"]')).toBeVisible();
  await expect(page.locator('.day-agenda')).toContainText('Production review');
  await expect(page.locator('.day-agenda')).toContainText('Bring approval samples');
  // A tentative IN_PRODUCTION loading date is visible, but only a confirmed
  // READY_TO_LOAD assignment can be removed through the existing server API.
  await expect(page.locator('.agenda-order .order-footer button')).toHaveCount(1);
  await expect(page.locator('.day-agenda a').filter({ hasText: 'PO-1001' }).first()).toHaveAttribute('href', `/orders/${orderId(1)}`);
  await today.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-date="2026-10-21"]')).toBeFocused();
  await expect(page.locator('.day-agenda')).toContainText('PO-1003');
});

test('calendar shows partial-data failure with recovery instead of claiming an empty agenda', async ({ page }) => {
  await calendarFixture(page, { failEvents: true });
  await page.goto('/calendar-notifications.html?surface=calendar');
  await expect(page.getByRole('alert')).toContainText('incomplete');
  await expect(page.locator('.agenda-warning')).toBeVisible();
  await expect(page.locator('.empty-agenda')).toHaveCount(0);
  await page.route('**/api/calendar?*', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('calendar assignment uses the loading-day endpoint and preserves the dialog on rejection', async ({ page }) => {
  const requests = await calendarFixture(page, { rejectAssignment: true });
  await page.goto('/calendar-notifications.html?surface=calendar');
  await page.locator('.day-agenda').getByRole('button', { name: /Add order/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /PO-1003/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Complete the quality check');
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].url).toContain(`/api/loading-days/${loadingId}/orders`);
  expect(requests[0].body).toEqual({ orderId: orderId(3) });
  await expect(page.locator(`[data-date="${day}"] [data-badge="loading"]`)).toContainText('2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('calendar read-only users can inspect badges without assignment controls', async ({ page }) => {
  await calendarFixture(page, { role: 'Operator' });
  await page.goto('/calendar-notifications.html?surface=calendar');
  await expect(page.locator(`[data-date="${day}"] [data-badge="loading"]`)).toContainText('2');
  await expect(page.locator('.day-agenda').getByRole('button', { name: /Add order/i })).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`calendar remains readable in three themes and languages at ${viewport.width}px`, async ({ page }) => {
    // Three theme/locale passes and a full-page capture need more time than a
    // single interaction in software-rendered CI.
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await calendarFixture(page);
    await page.goto('/calendar-notifications.html?surface=calendar');
    for (const [theme, language] of [['LightVim', 'en'], ['DarkVim', 'ru'], ['HighContrastVim', 'lv']]) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.getByLabel('Language', { exact: true }).selectOption(language);
      await expect(page.locator(`[data-date="${day}"] [data-badge="loading"]`)).toContainText('2');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await expect(page.locator('.calendar-legend')).toBeVisible();
      await expect(page.locator('.calendar-page')).not.toContainText('calendar.agenda.');
      await expect(page.locator('.calendar-page')).not.toContainText('calendar.badges.');
    }
    if (viewport.width !== 768) await page.screenshot({ path: `/tmp/oms-calendar-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
  });
}

const initialTelegram = { configured: true, available: true, connected: false, enabled: false, username: null as string | null, linkedAt: null as string | null, pendingUntil: null as string | null, botUsername: 'OMS_test_bot' };

test('Telegram setup is honest when the bot is not configured and recovers after refresh', async ({ page }) => {
  let configured = false;
  await page.route('**/api/notifications/telegram', route => route.fulfill({ json: { ...initialTelegram, configured, available: configured } }));
  await page.goto('/calendar-notifications.html?surface=telegram');
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'notConfigured');
  await expect(page.getByRole('button', { name: 'Connect Telegram', exact: true })).toHaveCount(0);
  configured = true;
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect Telegram', exact: true })).toBeEnabled();
});

test('Telegram creates a private QR link, links, pauses, resumes and disconnects without sending a message', async ({ page }) => {
  let status = { ...initialTelegram };
  const methods: string[] = [];
  await page.route('**/api/notifications/telegram', async route => {
    const request = route.request();
    methods.push(request.method());
    if (request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ action: 'connect' });
      status.pendingUntil = '2026-10-22T12:10:00Z';
      return route.fulfill({ json: { url: `https://t.me/OMS_test_bot?start=${'a'.repeat(43)}`, expiresAt: status.pendingUntil } });
    }
    if (request.method() === 'PATCH') status.enabled = request.postDataJSON().enabled;
    if (request.method() === 'DELETE') status = { ...initialTelegram };
    await route.fulfill({ json: request.method() === 'GET' ? status : { success: true } });
  });
  await page.goto('/calendar-notifications.html?surface=telegram');
  await page.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Telegram' })).toHaveAttribute('href', /https:\/\/t\.me\/OMS_test_bot\?start=/);
  await expect(page.getByRole('link', { name: 'Open Telegram' })).toBeFocused();
  status = { ...status, connected: true, enabled: true, username: 'my_phone', linkedAt: `${day}T12:00:00Z`, pendingUntil: null };
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'connected');
  await expect(page.locator('.account')).toContainText('@my_phone');
  await expect(page.getByRole('img', { name: /QR code/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause notifications', exact: true }).click();
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: 'Resume notifications', exact: true }).click();
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'connected');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'notLinked');
  expect(methods.filter(method => method === 'POST')).toHaveLength(1);
  expect(methods.filter(method => method === 'PATCH')).toHaveLength(2);
  expect(methods.filter(method => method === 'DELETE')).toHaveLength(1);
});

test('Telegram failed pause preserves the connected state and offers recovery', async ({ page }) => {
  await page.route('**/api/notifications/telegram', route => route.fulfill(route.request().method() === 'PATCH'
    ? { status: 503, json: { code: 'unavailable' } }
    : { json: { ...initialTelegram, connected: true, enabled: true, username: 'my_phone' } }));
  await page.goto('/calendar-notifications.html?surface=telegram');
  await page.getByRole('button', { name: 'Pause notifications', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'connected');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
});

test('Telegram checks the final server state when a successful link crosses its expiry', async ({ page }) => {
  let status = { ...initialTelegram };
  await page.route('**/api/notifications/telegram', route => {
    if (route.request().method() === 'POST') {
      status.pendingUntil = '2026-10-22T12:10:00Z';
      return route.fulfill({ json: { url: `https://t.me/OMS_test_bot?start=${'b'.repeat(43)}`, expiresAt: status.pendingUntil } });
    }
    return route.fulfill({ json: status });
  });
  await page.goto('/calendar-notifications.html?surface=telegram');
  await page.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Telegram' })).toBeVisible();
  status = { ...status, connected: true, enabled: true, username: 'last_second_link', pendingUntil: null };
  await page.clock.setFixedTime(new Date('2026-10-22T12:10:01Z'));
  await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'connected', { timeout: 10000 });
  await expect(page.locator('.account')).toContainText('@last_second_link');
  await expect(page.getByRole('link', { name: 'Open Telegram' })).toHaveCount(0);
});

test('Telegram hides a revoked QR when another tab replaces the pending link', async ({ page }) => {
  let status = { ...initialTelegram };
  await page.setViewportSize({ width: 320, height: 850 });
  await page.route('**/api/notifications/telegram', route => {
    if (route.request().method() === 'POST') {
      status.pendingUntil = '2026-10-22T12:10:00Z';
      return route.fulfill({ json: { url: `https://t.me/OMS_test_bot?start=${'c'.repeat(43)}`, expiresAt: status.pendingUntil } });
    }
    return route.fulfill({ json: status });
  });
  await page.goto('/calendar-notifications.html?surface=telegram');
  await page.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/oms-telegram-link-320.png', fullPage: true });
  status.pendingUntil = '2026-10-22T12:11:00Z';
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open Telegram' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create new link', exact: true })).toBeEnabled();
});

test('Telegram connected settings reflow in translated phone layouts and all themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.route('**/api/notifications/telegram', route => route.fulfill({ json: { ...initialTelegram, connected: true, enabled: true, username: 'long_private_telegram_username' } }));
  await page.goto('/calendar-notifications.html?surface=telegram');
  for (const [theme, language] of [['LightVim', 'en'], ['DarkVim', 'ru'], ['HighContrastVim', 'lv']]) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByLabel('Language', { exact: true }).selectOption(language);
    await expect(page.locator('.telegram-settings')).toHaveAttribute('data-state', 'connected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator('.telegram-settings')).not.toContainText('settings.telegram.');
  }
  await page.screenshot({ path: '/tmp/oms-telegram-320.png', fullPage: true });
});
