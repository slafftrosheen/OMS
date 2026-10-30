import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

async function shell(page: Page) {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:8000/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method: request.method(), body: request.postDataJSON() });
    if (path === '/api/auth') return route.fulfill({ json: { user: { id: 'account-a', username: 'first', displayName: 'First account', role: 'RD', stations: [] } } });
    if (path === '/api/preferences') return route.fulfill({ json: { theme: 'DarkVim', locale: 'en', density: 'cozy' } });
    if (path === '/api/chat') return route.fulfill({ json: [{ id: 'general', name: 'General', kind: 'channel' }] });
    if (path === '/api/users') return route.fulfill({ json: [{ id: 'account-a', name: 'First account', displayName: 'First account' }] });
    if (path === '/api/chat/messages') return route.fulfill({ json: { success: true, messages: [{ id: 'first-message', roomId: 'general', authorId: 'account-a', text: 'Existing conversation', ts: '2026-10-22T12:00:00Z' }] } });
    return route.fulfill({ status: 404, json: { error: `Unexpected fixture request: ${path}` } });
  });
  await page.goto('/app-shell.html');
  await expect(page.getByTestId('context-user')).toHaveText('account-a');
  return { requests, errors, count: (path: string, method = 'GET') => requests.filter(request => request.path === path && request.method === method).length };
}

test('shell owns one session check and opens chat on demand without eager order loading', async ({ page }) => {
  const observed = await shell(page);
  await expect(page.getByTestId('shared-auth')).toHaveText('true');
  await expect(page.getByTestId('context-role')).toHaveText('RD');
  expect(observed.count('/api/auth')).toBe(1);
  expect(observed.count('/api/draft-orders')).toBe(0);
  expect(observed.count('/api/updates')).toBe(0);
  expect(observed.count('/api/chat')).toBe(0);
  expect(observed.count('/api/users')).toBe(0);
  expect(observed.count('/api/chat/messages')).toBe(0);
  await expect.poll(() => observed.count('/api/preferences')).toBe(1);

  await page.locator('.rf-bottombar__chat').click();
  await expect(page.locator('.chat-drawer')).toBeVisible();
  await expect(page.getByTestId('message-text')).toHaveText('Existing conversation');
  expect(observed.count('/api/chat')).toBe(1);
  expect(observed.count('/api/users')).toBe(1);
  expect(observed.count('/api/chat/messages')).toBe(1);
  await page.getByRole('button', { name: 'Close Chat', exact: true }).click();

  await page.getByRole('button', { name: 'Switch account', exact: true }).click();
  await expect(page.getByTestId('context-user')).toHaveText('account-b');
  await expect(page.getByTestId('context-role')).toHaveText('Operator');
  await expect(page.getByTestId('room-count')).toHaveText('0');
  await expect(page.getByTestId('directory-count')).toHaveText('0');
  await expect(page.getByTestId('message-text')).toBeEmpty();
  expect(observed.count('/api/auth')).toBe(1);
  expect(observed.errors).toEqual([]);
});

test('theme controls share one value and an obsolete logout cannot delete a newer session', async ({ page }) => {
  const observed = await shell(page);
  await expect(page.getByTestId('ui-theme')).toHaveText('DarkVim');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitem', { name: 'High Contrast', exact: true }).click();
  await expect(page.getByTestId('ui-theme')).toHaveText('HighContrastVim');
  await expect(page.getByTestId('legacy-theme')).toHaveText('HighContrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'HighContrastVim');
  await expect.poll(() => observed.count('/api/preferences', 'PUT')).toBe(1);
  expect(observed.requests.filter(request => request.path === '/api/preferences' && request.method === 'PUT')[0]?.body).toMatchObject({ theme: 'HighContrastVim' });
  expect(observed.count('/api/settings', 'POST')).toBe(0);

  await page.getByRole('button', { name: 'Sign in during pending logout', exact: true }).click();
  await expect(page.getByTestId('logout-settled')).toHaveText('true');
  await expect(page.getByTestId('context-user')).toHaveText('account-b');
  expect(observed.count('/api/auth', 'DELETE')).toBe(0);
  expect(observed.errors).toEqual([]);
});
