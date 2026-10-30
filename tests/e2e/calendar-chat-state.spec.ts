import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block', viewport: { width: 1400, height: 1000 } });

const row = (id: string, message: string, userId = 'account-a') => ({ id, userId, username: 'Ann', message, timestamp: '2026-01-01T12:00:00Z' });

async function openFixture(page: Page, surface: string, override?: (route: Route, path: string) => Promise<boolean>) {
  const errors: string[] = [];
  const writes: Array<{ path: string; body: any }> = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:8000/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path === '/api/auth') {
      await route.fulfill({ json: { user: { id: 'account-a', username: 'Ann', displayName: 'Ann', role: 'RD', stations: [] } } }); return;
    }
    if (override && await override(route, path)) return;
    if (path === '/api/chat') { await route.fulfill({ json: [{ id: 'general', name: 'General', kind: 'channel' }, { id: 'other', name: 'Other', kind: 'channel' }] }); return; }
    if (path === '/api/users') { await route.fulfill({ json: [{ id: 'account-a', name: 'Ann', username: 'ann', displayName: 'Ann' }, { id: 'account-b', name: 'Bob', username: 'bob', displayName: 'Bob' }] }); return; }
    if (path === '/api/chat/messages') {
      const body = request.postDataJSON();
      await route.fulfill({ json: request.method() === 'GET' ? { success: true, messages: [] } : { success: true, message: { id: 'confirmed', roomId: body.roomId, authorId: 'account-a', text: body.text, mentions: body.mentions ?? [], ts: '2026-01-01T12:00:00Z' } } }); return;
    }
    if (path.startsWith('/api/calendar/')) { await route.fulfill({ json: request.postDataJSON() }); return; }
    await route.fulfill({ status: 404, json: { error: `Unexpected fixture request: ${path}` } });
  });
  await page.goto(`/calendar-chat-state.html?surface=${surface}`);
  await expect(page.getByLabel('Language', { exact: true })).toBeVisible();
  return { errors, writes };
}

test('event editor rerenders type fields, preserves same-event drafts and resets for a new event', async ({ page }) => {
  const observed = await openFixture(page, 'calendar');
  const opener = page.getByRole('button', { name: 'Open event editor', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Edit Event', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Type', exact: true })).toBeFocused();
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('note');
  await expect(dialog.getByLabel('Start time', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Title', { exact: true }).fill('My unsaved note');
  await page.evaluate(() => (window as any).__calendarChatFixture.refreshEvent());
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('My unsaved note');
  await page.evaluate(() => (window as any).__calendarChatFixture.eventB());
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Note B');
  await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue('2026-02-20');
  await dialog.getByLabel('Title', { exact: true }).fill('Saved B');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect.poll(() => observed.writes.length).toBe(1);
  expect(observed.writes[0]).toMatchObject({ path: '/api/calendar/event-b', body: { id: 'event-b', kind: 'note', title: 'Saved B', date: '2026-02-20' } });
  expect(observed.errors).toEqual([]);
});

test('month keyboard focus remains local and reachable after a shorter month; picker navigation and close are reactive', async ({ page }) => {
  const observed = await openFixture(page, 'calendar');
  const first = page.getByRole('region', { name: 'First month', exact: true });
  const second = page.getByRole('region', { name: 'Second month', exact: true });
  await first.getByRole('gridcell', { name: '2026-01-31' }).click();
  await page.keyboard.press('PageDown');
  await expect(first.getByRole('gridcell', { name: '2026-02-28' })).toBeFocused();
  await expect(first.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await second.getByRole('gridcell', { name: '2026-01-10' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(second.getByRole('gridcell', { name: '2026-01-11' })).toBeFocused();
  await expect(first.getByRole('gridcell', { name: '2026-02-28' })).not.toBeFocused();

  const opener = page.getByRole('button', { name: 'Open loading picker', exact: true });
  await opener.click();
  const picker = page.getByRole('dialog', { name: 'Loading date', exact: true });
  const oldMonth = await picker.locator('[aria-live="polite"]').textContent();
  await picker.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(picker.locator('[aria-live="polite"]')).not.toHaveText(oldMonth!);
  const selected = await picker.locator('.tile').first().getAttribute('aria-label');
  await picker.locator('.tile').first().click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByTestId('picked-date')).toHaveText(selected!);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(observed.errors).toEqual([]);
});

test('composer reacts to text, ignores composition Enter, keeps failed drafts and permits repeated file selections', async ({ page }) => {
  const observed = await openFixture(page, 'composer');
  const composer = page.getByRole('region', { name: 'Composer', exact: true });
  const input = composer.getByRole('textbox', { name: 'Message input', exact: true });
  const send = composer.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await input.fill('First draft');
  await expect(send).toBeEnabled();
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.getByTestId('send-count')).toHaveText('0');
  await expect(input).toHaveValue('First draft');
  await input.press('Enter');
  await expect(page.getByTestId('send-count')).toHaveText('1');
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Toggle failure', exact: true }).click();
  await input.fill('Retain this failed draft');
  await input.press('Enter');
  await expect(input).toHaveValue('Retain this failed draft');
  await expect(send).toBeEnabled();
  const file = { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('test') };
  await composer.locator('input[type="file"]').setInputFiles(file);
  await composer.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId('file-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Toggle failure', exact: true }).click();
  await page.evaluate(() => {
    (window as any).__calendarChatFixture.setReply('reply-a');
    (window as any).__calendarChatFixture.holdSend();
  });
  await input.fill('Send the first reply'); await input.press('Enter');
  await expect(input).toBeDisabled();
  await page.evaluate(() => (window as any).__calendarChatFixture.setReply('reply-b'));
  await page.evaluate(() => (window as any).__calendarChatFixture.resolveSend());
  await expect(input).toHaveValue('');
  await expect(input).toBeEnabled();
  await expect(composer.locator('.reply-preview')).toContainText('reply-b');
  for (const [language, name] of [['ru', 'Отправить'], ['lv', 'Sūtīt']]) {
    await page.getByLabel('Language', { exact: true }).selectOption(language);
    await expect(composer.getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(observed.errors).toEqual([]);
});

test('message actions are keyboard reachable and edit drafts follow the message identity', async ({ page }) => {
  const observed = await openFixture(page, 'composer');
  const region = page.getByRole('region', { name: 'Message', exact: true });
  const edit = region.getByRole('button', { name: 'Edit', exact: true });
  await edit.focus();
  await expect(edit).toBeVisible();
  await page.keyboard.press('Enter');
  const editor = region.getByRole('textbox', { name: 'Edit message', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('Private edit');
  await page.evaluate(() => (window as any).__calendarChatFixture.refreshMessage());
  await expect(editor).toHaveValue('Private edit');
  await page.evaluate(() => (window as any).__calendarChatFixture.messageB());
  await expect(editor).toHaveCount(0);
  await edit.focus(); await page.keyboard.press('Enter');
  await expect(editor).toHaveValue('Original B');
  await editor.fill('B draft');
  await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.getByTestId('edit-count')).toHaveText('0');
  await editor.press('Escape');
  await expect(edit).toBeFocused();
  await page.evaluate(() => (window as any).__calendarChatFixture.refreshMessage());
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue('Server message refresh');
  await page.getByRole('button', { name: 'Toggle failure', exact: true }).click();
  await editor.fill('Keep failed edit'); await editor.press('Enter');
  await expect(editor).toHaveValue('Keep failed edit');
  await expect(editor).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle failure', exact: true }).click();
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(region.locator('.message-text')).toHaveText('Keep failed edit');
  expect(observed.errors).toEqual([]);
});

test('drawer isolates room drafts and mention recipients and restores focus through nested dialogs', async ({ page }) => {
  const observed = await openFixture(page, 'sidebar');
  const opener = page.getByRole('button', { name: 'Open chat drawer', exact: true });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Team Chat', exact: true });
  const input = drawer.getByRole('textbox', { name: 'Message (use @name to mention)', exact: true });
  await input.fill('@Ann');
  await input.press('ArrowDown');
  await expect(drawer.getByRole('option', { name: '@Ann', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('@Ann ');
  await input.fill('General draft @Ann');
  await drawer.getByRole('button', { name: 'Channels', exact: true }).click();
  await drawer.getByRole('button', { name: 'Other Join conversation', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(drawer.locator('.mention-picked')).toHaveCount(0);
  await input.fill('Other draft');
  await drawer.getByRole('button', { name: 'Channels', exact: true }).click();
  await drawer.getByRole('button', { name: 'General Join conversation', exact: true }).click();
  await expect(input).toHaveValue('General draft @Ann');
  await expect(drawer.locator('.mention-picked')).toContainText('@Ann');
  await drawer.getByRole('button', { name: 'Channels', exact: true }).click();
  const newDirect = drawer.getByRole('button', { name: 'New direct message', exact: true });
  await newDirect.click();
  const direct = page.getByRole('dialog', { name: 'Start direct message', exact: true });
  await expect(direct.getByRole('textbox', { name: 'Search people…', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(direct).toHaveCount(0);
  await expect(newDirect).toBeFocused();
  const create = drawer.getByRole('button', { name: 'Create Channel', exact: true });
  await create.click();
  const channel = page.getByRole('dialog', { name: 'Create Channel', exact: true });
  await expect(channel.getByRole('textbox', { name: 'Channel Name', exact: true })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await channel.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(channel).toHaveCount(0);
  await expect(create).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(observed.errors).toEqual([]);
});

test('order sends use the API text contract, survive older reads and cannot mutate the next order or account', async ({ page }) => {
  let firstRead: Route | undefined;
  let lateA: Route | undefined;
  let lateB: Route | undefined;
  let readsB = 0;
  const observed = await openFixture(page, 'order', async (route, path) => {
    if (path !== '/api/chat/messages') return false;
    const request = route.request();
    if (request.method() === 'GET') {
      const orderId = new URL(request.url()).searchParams.get('orderId');
      if (orderId === 'order-a') { firstRead = route; return true; }
      readsB++;
      await route.fulfill({ json: { success: true, messages: [row(`b-${readsB}`, readsB === 1 ? 'Order B conversation' : 'New account conversation', readsB === 1 ? 'account-a' : 'account-b')] } });
      return true;
    }
    const body = request.postDataJSON();
    if (body.text === 'Late A') { lateA = route; return true; }
    if (body.text === 'Pending B') { lateB = route; return true; }
    await route.fulfill({ json: { success: true, message: row('sent-a', body.text) } });
    return true;
  });
  const input = page.getByRole('textbox', { name: 'Message input', exact: true });
  await expect.poll(() => !!firstRead).toBe(true);
  await input.fill('Sent during read'); await input.press('Enter');
  await expect(page.locator('.message-text')).toHaveText('Sent during read');
  const sentRequest = observed.writes.find(write => write.path === '/api/chat/messages');
  expect(sentRequest?.body).toMatchObject({ orderId: 'order-a', text: 'Sent during read' });
  expect(sentRequest?.body.message).toBeUndefined();
  await firstRead!.fulfill({ json: { success: true, messages: [row('old-a', 'Older history')] } });
  await expect(page.locator('.message-text')).toHaveCount(2);
  await expect(page.locator('.messages-container')).toContainText('Sent during read');

  await input.fill('Late A'); await input.press('Enter');
  await expect.poll(() => !!lateA).toBe(true);
  await page.getByRole('button', { name: 'Order B', exact: true }).click();
  await expect(page.locator('.message-text')).toHaveText('Order B conversation');
  await input.fill('Draft B');
  await lateA!.fulfill({ json: { success: true, message: row('late-a', 'Late A') } }).catch(() => {});
  await expect(page.locator('.message-text')).toHaveText('Order B conversation');
  await expect(input).toHaveValue('Draft B');

  await input.fill('Pending B'); await input.press('Enter');
  await expect.poll(() => !!lateB).toBe(true);
  await page.getByRole('button', { name: 'Switch account', exact: true }).click();
  await expect(page.locator('.message-text')).toHaveText('New account conversation');
  await input.fill('New account draft');
  await lateB!.fulfill({ json: { success: true, message: row('late-b', 'Pending B') } }).catch(() => {});
  await expect(page.locator('.message-text')).toHaveText('New account conversation');
  await expect(input).toHaveValue('New account draft');
  expect(observed.errors).toEqual([]);
});
