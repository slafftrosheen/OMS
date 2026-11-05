import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ serviceWorkers: 'block', viewport: { width: 1180, height: 900 } });
const tone = readFileSync(new URL('../fixtures/chat/voice-tone.webm', import.meta.url));
type VoiceFields = { roomId?: string; orderId?: string; durationMs: string; clientRequestId: string; fileType: string; bytes: number };
type FixtureOptions = { surface?: string; mode?: string; failures?: number; history?: boolean; paging?: boolean; realtime?: boolean; onVoice?: (route: Route, fields: VoiceFields, result: any) => Promise<boolean> };

async function mediaFixture(page: Page, mode = 'ready') {
  await page.addInitScript(({ bytes, initialMode }) => {
    const metrics = { starts: 0, stops: 0, released: 0, requests: 0 };
    let selectedMode = initialMode;
    let hidden = false;
    const waiting: Array<(stream: any) => void> = [];
    const makeStream = () => {
      let stopped = false;
      const track = { onended: null, stop() { if (!stopped) { stopped = true; metrics.released++; } } };
      return { getTracks: () => [track] };
    };
    class Recorder {
      static isTypeSupported(value: string) { return value === 'audio/webm;codecs=opus'; }
      state = 'inactive';
      mimeType: string;
      ondataavailable: ((event: any) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: unknown, options: { mimeType: string }) { this.mimeType = options.mimeType; }
      start() { this.state = 'recording'; metrics.starts++; }
      stop() {
        if (this.state === 'inactive') throw new DOMException('Already stopped', 'InvalidStateError');
        this.state = 'inactive'; metrics.stops++;
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: initialMode === 'unsupported' ? undefined : Recorder });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => {
        metrics.requests++;
        if (selectedMode === 'denied') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
        if (selectedMode === 'hold') return new Promise(resolve => waiting.push(resolve));
        return Promise.resolve(makeStream());
      }
    } });
    if (initialMode === 'insecure') Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as any).__voiceMedia = {
      metrics,
      mode: (value: string) => selectedMode = value,
      release: () => waiting.shift()?.(makeStream()),
      hide: (value: boolean) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); }
    };
  }, { bytes: [...tone], initialMode: mode });
}

function multipart(request: Route['request'] extends () => infer R ? R : never): VoiceFields {
  const body = request.postData() || '';
  const field = (name: string) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r\\n]+)`))?.[1];
  return { roomId: field('roomId'), orderId: field('orderId'), durationMs: field('durationMs') || '', clientRequestId: field('clientRequestId') || '',
    fileType: body.match(/Content-Type: (audio\/[^\r\n]+)/i)?.[1] || '', bytes: request.postDataBuffer()?.byteLength || 0 };
}

async function openFixture(page: Page, options: FixtureOptions = {}) {
  await mediaFixture(page, options.mode);
  const errors: string[] = [], writes: VoiceFields[] = [], textWrites: any[] = [];
  const roomRows: Record<string, any[]> = { general: [], other: [] }, orderRows: Record<string, any[]> = { 'order-a': [], 'order-b': [] };
  const expiry = new Date(); expiry.setUTCMonth(expiry.getUTCMonth() + 3);
  const attachment = (id: string) => ({ id, fileName: 'voice.webm', fileType: 'audio/webm', fileSize: tone.length, kind: 'voice', duration: 1, url: `/api/chat/voice/${id}`, expiresAt: expiry.toISOString(), expired: false });
  if (options.history) {
    roomRows.general = [{ id: 'history-general', roomId: 'general', authorId: 'colleague', text: 'Saved general voice', ts: new Date().toISOString(), attachments: [attachment('saved-general'), '/files/brief.pdf', '/files/artwork.pdf', 'javascript:alert(1)'] }];
    roomRows.other = [{ id: 'history-other', roomId: 'other', authorId: 'colleague', text: 'Saved other voice', ts: new Date().toISOString(), attachments: [attachment('saved-other')] }];
  }
  if (options.paging) {
    const rows = Array.from({ length: 120 }, (_, index) => ({ id: `history-${index + 1}`, text: `Saved message ${String(index + 1).padStart(3, '0')}`, ts: new Date(Date.UTC(2026, 9, 1, 12, 0, index)).toISOString() }));
    roomRows.general = rows.map(row => ({ ...row, roomId: 'general', authorId: 'account-b', attachments: [] }));
    orderRows['order-a'] = rows.map(row => ({ id: row.id, userId: 'account-b', username: 'Bob', message: row.text, timestamp: row.ts }));
  }
  let failures = options.failures || 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:8000/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/auth') { await route.fulfill({ json: { user: { id: 'account-a', username: 'Ann', displayName: 'Ann', role: 'RD', stations: [] } } }); return; }
    if (path === '/api/chat') { await route.fulfill({ json: [{ id: 'general', name: 'General', kind: 'channel' }, { id: 'other', name: 'Other', kind: 'channel' }] }); return; }
    if (path === '/api/users') { await route.fulfill({ json: [{ id: 'account-a', name: 'Ann', username: 'ann', displayName: 'Ann' }, { id: 'account-b', name: 'Bob', username: 'bob', displayName: 'Bob' }] }); return; }
    if (path.startsWith('/api/chat/voice/')) { await route.fulfill({ contentType: 'audio/webm', body: tone, headers: { 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' } }); return; }
    if (path === '/api/chat/voice') {
      const fields = multipart(request); writes.push(fields);
      const audio = attachment(`audio-${fields.clientRequestId}`);
      const id = `message-${fields.clientRequestId}`;
      const message = fields.orderId
        ? { id, userId: 'account-a', username: 'Ann', message: '', timestamp: new Date().toISOString(), voiceAttachments: [audio] }
        : { id, roomId: fields.roomId, authorId: 'account-a', text: '', ts: new Date().toISOString(), attachments: [audio] };
      const result = { success: true, message, attachment: audio };
      if (options.onVoice && await options.onVoice(route, fields, result)) return;
      if (failures-- > 0) { await route.fulfill({ status: 503, json: { success: false, code: 'VOICE_TEMPORARILY_UNAVAILABLE', error: 'Unavailable' } }); return; }
      const collection = fields.orderId ? orderRows : roomRows, target = fields.orderId || fields.roomId!;
      collection[target] = [...(collection[target] || []).filter(row => row.id !== id), message];
      await route.fulfill({ json: result }); return;
    }
    if (path === '/api/chat/messages') {
      if (request.method() === 'GET') {
        const rows = url.searchParams.has('orderId') ? orderRows[url.searchParams.get('orderId')!] || [] : roomRows[url.searchParams.get('roomId')!] || [];
        const earlier = url.searchParams.has('cursor');
        const selected = options.paging ? earlier ? rows.slice(0, -100) : rows.slice(-100) : rows;
        const hasMore = !!options.paging && !earlier && rows.length > 100;
        await route.fulfill({ json: { success: true, messages: selected, hasMore, nextCursor: hasMore ? 'earlier-page' : null } }); return;
      }
      const body = request.postDataJSON(); textWrites.push(body);
      const id = `text-${textWrites.length}`;
      const message = body.orderId
        ? { id, userId: 'account-a', username: 'Ann', message: body.text, timestamp: new Date().toISOString() }
        : { id, roomId: body.roomId, authorId: 'account-a', text: body.text, mentions: body.mentions || [], ts: new Date().toISOString() };
      const collection = body.orderId ? orderRows : roomRows, target = body.orderId || body.roomId;
      collection[target] = [...(collection[target] || []), message];
      await route.fulfill({ json: { success: true, message } }); return;
    }
    await route.fulfill({ status: 404, json: { error: `Unexpected fixture request: ${path}` } });
  });
  await page.goto(`/voice-chat.html?surface=${options.surface || 'recorder'}${options.realtime ? '&realtime=1' : ''}`);
  await expect(page.getByLabel('Fixture language')).toBeVisible();
  return { errors, writes, textWrites, roomRows, orderRows };
}

async function recordPreview(page: Page) {
  await page.getByRole('button', { name: 'Record voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send voice message', exact: true })).toBeEnabled();
  await expect(page.locator('audio[aria-label="Recording preview"]')).toHaveAttribute('src', /^blob:/);
}

test('failed voice uploads retain playable drafts and retry one request identity; canonical playback uses the private endpoint', async ({ page }) => {
  const observed = await openFixture(page, { failures: 1 });
  await recordPreview(page);
  const preview = page.locator('audio[aria-label="Recording preview"]');
  await preview.evaluate((node: HTMLAudioElement) => node.play());
  await expect.poll(() => preview.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0);
  await preview.evaluate((node: HTMLAudioElement) => node.pause());
  await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('still here');
  await expect(preview).toHaveCount(1);
  await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
  await expect(page.getByText('Voice message sent.', { exact: true })).toBeVisible();
  expect(observed.writes).toHaveLength(2);
  expect(observed.writes[1].clientRequestId).toBe(observed.writes[0].clientRequestId);
  expect(observed.writes[0]).toMatchObject({ roomId: 'general', orderId: undefined });
  expect(observed.writes[0].clientRequestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(Number(observed.writes[0].durationMs)).toBeGreaterThan(0);
  expect(observed.writes[0].fileType).toContain('audio/webm');
  expect(observed.writes[0].bytes).toBeGreaterThan(tone.length);
  await expect(page.getByTestId('room-message')).toHaveCount(1);
  const playback = page.locator('audio[aria-label="Voice message"]');
  await expect(playback).toHaveAttribute('src', /^\/api\/chat\/voice\//);
  await playback.evaluate((node: HTMLAudioElement) => node.play());
  await expect.poll(() => playback.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0);
  expect(observed.errors).toEqual([]);
});

test('permission cancellation, hidden tabs, room changes and unmount release late microphone grants without recording', async ({ page }) => {
  const observed = await openFixture(page, { mode: 'hold' });
  for (const action of ['cancel', 'room', 'hidden', 'unmount']) {
    await page.getByRole('button', { name: 'Record voice', exact: true }).click();
    await expect(page.getByText('Waiting for microphone permission…', { exact: true })).toBeVisible();
    if (action === 'cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (action === 'room') await page.getByRole('button', { name: 'Switch fixture room' }).click();
    if (action === 'hidden') await page.evaluate(() => (window as any).__voiceMedia.hide(true));
    if (action === 'unmount') await page.getByRole('button', { name: 'Toggle fixture surface' }).click();
    await page.evaluate(() => (window as any).__voiceMedia.release());
    await expect.poll(() => page.evaluate(() => (window as any).__voiceMedia.metrics.released)).toBe(['cancel', 'room', 'hidden', 'unmount'].indexOf(action) + 1);
    expect(await page.evaluate(() => (window as any).__voiceMedia.metrics.starts)).toBe(0);
    if (action === 'hidden') await page.evaluate(() => (window as any).__voiceMedia.hide(false));
  }
  expect(observed.writes).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test('sending disables discard and an old upload response cannot attach to a changed room or account', async ({ page }) => {
  let pending: { route: Route; result: any } | undefined;
  const observed = await openFixture(page, { onVoice: async (route, _fields, result) => { pending = { route, result }; return true; } });
  for (const action of ['room', 'account']) {
    await recordPreview(page);
    await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
    await expect.poll(() => !!pending).toBe(true);
    await expect(page.getByRole('button', { name: 'Discard recording', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: action === 'room' ? 'Switch fixture room' : 'Switch fixture account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Record voice', exact: true })).toBeVisible();
    await pending!.route.fulfill({ json: pending!.result }).catch(() => {}); pending = undefined;
    await expect(page.getByTestId('room-message')).toHaveCount(0);
    await expect(page.locator('audio')).toHaveCount(0);
  }
  await expect(page.getByTestId('conversation-owner')).toHaveText('account-b:other');
  expect(observed.writes.map(write => write.roomId)).toEqual(['general', 'other']);
  expect(observed.errors).toEqual([]);
});

test('order discussion sends voice-only and text messages, receives remote voice, and honors a later server deletion', async ({ page }) => {
  const observed = await openFixture(page, { surface: 'order' });
  await recordPreview(page);
  await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
  await expect(page.getByText('Voice message sent.', { exact: true })).toBeVisible();
  expect(observed.writes[0]).toMatchObject({ orderId: 'order-a', roomId: undefined });
  await expect(page.locator('.messages-container audio')).toHaveCount(1);
  const input = page.getByRole('textbox', { name: 'Message input', exact: true });
  await input.fill('Text still works'); await input.press('Enter');
  await expect(page.locator('.message-text', { hasText: 'Text still works' })).toBeVisible();
  const first = observed.orderRows['order-a'][0];
  observed.orderRows['order-a'].push({ ...first, id: 'remote-voice', userId: 'colleague', username: 'Colleague', message: 'Remote voice caption', voiceAttachments: first.voiceAttachments.map((audio: any) => ({ ...audio, id: 'remote-audio', url: '/api/chat/voice/remote-audio' })) });
  await page.evaluate(() => (window as any).__voiceFixture.refreshOrder());
  await expect(page.locator('.messages-container audio')).toHaveCount(2);
  await expect(page.getByText('Remote voice caption', { exact: true })).toBeVisible();
  observed.orderRows['order-a'] = observed.orderRows['order-a'].filter(message => message.id !== first.id);
  await page.evaluate(() => (window as any).__voiceFixture.refreshOrder());
  await expect(page.locator('.messages-container audio')).toHaveCount(1);
  await expect(page.getByText('Text still works', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch fixture order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record voice', exact: true })).toBeVisible();
  await expect(page.locator('.messages-container audio')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__voiceMedia.metrics.released)).toBe(2);
  expect(observed.errors).toEqual([]);
});

test('expiry removes buffered playback, preserves text, and keeps safe legacy attachment links', async ({ page }) => {
  const observed = await openFixture(page, { history: true });
  await expect(page.getByText('Saved general voice', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'brief.pdf', exact: true })).toHaveAttribute('href', '/files/brief.pdf');
  await expect(page.getByRole('link', { name: 'artwork.pdf', exact: true })).toHaveAttribute('href', '/files/artwork.pdf');
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  const audio = await page.locator('audio[aria-label="Voice message"]').elementHandle();
  await audio!.evaluate((node: HTMLAudioElement) => node.play());
  await page.evaluate(() => (window as any).__voiceFixture.expire());
  await expect(page.getByText('Voice message expired', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved general voice', { exact: true })).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(0);
  expect(await audio!.evaluate((node: HTMLAudioElement) => node.paused && !node.getAttribute('src'))).toBe(true);
  expect(observed.errors).toEqual([]);
});

test('recording limits and permission errors have clear recovery without blocking text', async ({ page }) => {
  await openFixture(page, { mode: 'denied' });
  await page.getByRole('button', { name: 'Record voice', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await page.evaluate(() => (window as any).__voiceMedia.mode('ready'));
  await page.clock.install();
  await page.getByRole('button', { name: 'Record voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.clock.fastForward(299200);
  await expect(page.getByRole('button', { name: 'Send voice message', exact: true })).toBeEnabled();
  await expect(page.getByText(/5-minute limit was reached/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__voiceMedia.metrics.released)).toBe(1);
  await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(0);
});

for (const mode of ['unsupported', 'insecure']) {
  test(`${mode} recording has a specific explanation and leaves the text composer usable`, async ({ page }) => {
    const observed = await openFixture(page, { surface: 'order', mode });
    await expect(page.getByRole('button', { name: 'Record voice', exact: true })).toBeDisabled();
    await expect(page.getByText(mode === 'insecure' ? /secure connection \(HTTPS\)/ : /Voice recording is unavailable in this browser/)).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Message input', exact: true });
    await input.fill('Text without a microphone'); await input.press('Enter');
    await expect(page.getByText('Text without a microphone', { exact: true })).toBeVisible();
    expect(observed.errors).toEqual([]);
  });
}

test('all human chat surfaces expose recorder and persisted playback; station room changes load their own history', async ({ page }) => {
  for (const surface of ['pane', 'popover', 'sidebar', 'page']) {
    const observed = await openFixture(page, { surface, history: true });
    if (surface === 'popover') await page.getByRole('button', { name: 'Open chat', exact: true }).click();
    if (surface === 'sidebar') await page.getByRole('button', { name: 'Open chat drawer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Record voice', exact: true })).toBeEnabled();
    await expect(page.locator('audio[aria-label="Voice message"]')).toHaveCount(1);
    if (surface === 'pane') {
      await page.getByRole('button', { name: 'Other', exact: true }).click();
      await expect(page.getByText('Saved other voice', { exact: true })).toBeVisible();
      await expect(page.getByText('Saved general voice', { exact: true })).toHaveCount(0);
    }
    await recordPreview(page);
    await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
    expect(observed.errors).toEqual([]);
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('320px order recording and playback retain readable controls in each locale and theme', async ({ page }, testInfo) => {
  const observed = await openFixture(page, { surface: 'order' });
  await recordPreview(page);
  await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
  await expect(page.getByText('Voice message sent.', { exact: true })).toBeVisible();
  await recordPreview(page);
  await page.setViewportSize({ width: 320, height: 850 });
  for (const language of ['en', 'lv', 'ru']) {
    await page.getByLabel('Fixture language').selectOption(language);
    await expect(page.locator('.message-count')).toHaveText(`${({ en: 'Messages', lv: 'Ziņas', ru: 'Сообщения' } as Record<string, string>)[language]}: 1`);
    for (const theme of ['LightVim', 'DarkVim', 'HighContrastVim']) {
      await page.getByLabel('Fixture theme').selectOption(theme);
      const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
        overflowing: Array.from(document.querySelectorAll<HTMLElement>('main *')).filter(node => {
          const box = node.getBoundingClientRect(); return box.width > 1 && box.right > innerWidth + 1;
        }).slice(0, 8).map(node => ({ tag: node.tagName, class: node.className, text: node.textContent?.trim().slice(0, 80) })) }));
      expect(layout.width, `${language}/${theme}: ${JSON.stringify(layout.overflowing)}`).toBeLessThanOrEqual(layout.viewport + 1);
      await expect(page.locator('.voice-recorder .voice-send')).toBeVisible();
      await expect(page.locator('.voice-recorder .voice-send')).toBeEnabled();
      expect(await page.locator('.chat-container .messages-container').evaluate(node => node.clientHeight)).toBeGreaterThanOrEqual(160);
      for (const speed of await page.locator('.voice-speed select').all()) {
        await expect(speed).toHaveValue('1');
        expect(await speed.evaluate((node: HTMLSelectElement) => node.selectedOptions[0]?.textContent)).toBe('1×');
      }
      const composer = await page.locator('.input-wrapper').evaluate(node => {
        const field = node.querySelector('textarea')!, button = node.querySelector('.text-send button')!;
        const wrapper = node.getBoundingClientRect(), input = field.getBoundingClientRect(), send = button.getBoundingClientRect();
        return { fullWidth: Math.abs(wrapper.width - input.width) <= 1, controlsBelow: send.top >= input.bottom, disabledOpacity: getComputedStyle(button).opacity };
      });
      expect(composer).toEqual({ fullWidth: true, controlsBelow: true, disabledOpacity: '1' });
    }
  }
  await page.screenshot({ path: testInfo.outputPath('voice-order-mobile-high-contrast.png'), fullPage: true });
  expect(observed.errors).toEqual([]);
});

async function openChatSurface(page: Page, surface: string) {
  if (surface === 'sidebar') await page.getByRole('button', { name: 'Open chat drawer', exact: true }).click();
  if (surface === 'popover') await page.getByRole('button', { name: 'Open chat', exact: true }).click();
  const selector = surface === 'page' ? '.message-input-container textarea' : surface === 'sidebar' ? '.chat-drawer textarea'
    : surface === 'popover' ? '.sheet textarea' : surface === 'pane' ? '.chat-panel textarea' : '.chat-input-container textarea';
  await expect(page.locator(selector)).toBeVisible();
  return page.locator(selector);
}

for (const surface of ['page', 'sidebar', 'pane', 'popover', 'order']) {
  test(`confirmed text send keeps a failed draft and retries on ${surface}`, async ({ page }) => {
    const fixture = await openFixture(page, { surface });
    const input = await openChatSurface(page, surface);
    let failed = false;
    await page.route('**/api/chat/messages', async route => {
      if (route.request().method() === 'POST' && !failed) {
        failed = true; await route.fulfill({ status: 503, json: { success: false, error: 'Temporarily unavailable' } });
      } else await route.fallback();
    });
    const draft = 'Keep the sign details\nSecond line is important';
    await input.fill(draft);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(draft);
    if (surface !== 'order') await expect(page.getByRole('alert')).toContainText('draft is still here');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect.poll(() => fixture.textWrites.length).toBe(1);
    expect(fixture.textWrites[0].text).toBe(draft);
    expect(fixture.errors).toEqual([]);
  });
}

for (const surface of ['page', 'sidebar', 'order']) {
  test(`earlier chat history is accessible and retry keeps the reading position on ${surface}`, async ({ page }) => {
    const fixture = await openFixture(page, { surface, paging: true });
    await openChatSurface(page, surface);
    await expect(page.getByText('Saved message 021', { exact: true })).toBeAttached();
    await expect(page.getByText('Saved message 001', { exact: true })).toHaveCount(0);
    let failOlder = true;
    await page.route('**/api/chat/messages?**', async route => {
      if (new URL(route.request().url()).searchParams.has('cursor') && failOlder) {
        failOlder = false; await route.fulfill({ status: 503, json: { success: false, messages: [] } });
      } else await route.fallback();
    });
    const scroller = page.locator(surface === 'page' ? '.messages-container' : surface === 'sidebar' ? '.messages-scroll' : '.chat-container .messages-container');
    await scroller.evaluate(node => { node.scrollTop = 0; });
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await expect(page.getByText('Earlier messages could not be loaded.', { exact: true })).toBeVisible();
    await expect(page.getByText('Beginning of this conversation', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText('Saved message 001', { exact: true })).toBeAttached();
    await expect(page.getByText('Saved message 120', { exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Load earlier messages', exact: true })).toHaveCount(0);
    await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await expect(page.getByText('Beginning of this conversation', { exact: true })).toBeAttached();
    expect(fixture.errors).toEqual([]);
  });
}

test('mobile full chat switches rooms and preserves separate multiline drafts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 850 });
  const fixture = await openFixture(page, { surface: 'page' });
  const input = await openChatSurface(page, 'page');
  const picker = page.getByLabel('Conversation', { exact: true });
  await expect(picker).toBeVisible();
  await input.fill('General draft\nReady to cut');
  await picker.selectOption('other');
  await expect(input).toHaveValue('');
  await input.fill('Other room draft');
  await picker.selectOption('general');
  await expect(input).toHaveValue('General draft\nReady to cut');
  await page.getByLabel('Fixture language').selectOption('ru');
  await page.getByLabel('Fixture theme').selectOption('HighContrastVim');
  await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat-mobile-room-draft-high-contrast.png'), fullPage: true });
  expect(fixture.errors).toEqual([]);
});

test('voice playback pauses another recording and exposes speed with exact expiry', async ({ page }) => {
  const fixture = await openFixture(page, { history: true });
  fixture.roomRows.general.push({ id: 'second-voice', roomId: 'general', authorId: 'account-b', text: 'Second recording', ts: new Date().toISOString(),
    attachments: [{ ...fixture.roomRows.general[0].attachments[0], id: 'second-audio', url: '/api/chat/voice/second-audio' }] });
  await page.getByRole('button', { name: 'Switch fixture room', exact: true }).click();
  await page.getByRole('button', { name: 'Switch fixture room', exact: true }).click();
  const players = page.locator('audio');
  await expect(players).toHaveCount(2);
  await expect(page.getByLabel('Playback speed', { exact: true }).nth(1)).toHaveValue('1');
  await players.nth(0).evaluate(async (node: HTMLAudioElement) => { node.loop = true; await node.play(); });
  await expect.poll(() => players.nth(0).evaluate((node: HTMLAudioElement) => node.paused)).toBe(false);
  await page.getByLabel('Playback speed', { exact: true }).nth(1).selectOption('1.5');
  await expect(page.getByLabel('Playback speed', { exact: true }).nth(1)).toHaveValue('1.5');
  await players.nth(1).evaluate(async (node: HTMLAudioElement) => { node.loop = true; await node.play(); });
  await expect.poll(() => players.nth(0).evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
  expect(await players.nth(1).evaluate((node: HTMLAudioElement) => node.playbackRate)).toBe(1.5);
  await expect(page.locator('.voice-meta time').first()).toContainText(/\d{2}:\d{2}/);
  expect(fixture.errors).toEqual([]);
});

test('order history reopens pagination after a long offline gap', async ({ page }) => {
  const fixture = await openFixture(page, { surface: 'order' });
  await openChatSurface(page, 'order');
  let phase = 'old';
  const rows = (start: number, end: number) => Array.from({ length: end - start }, (_, index) => {
    const n = start + index;
    return { id: `gap-${String(n).padStart(3, '0')}`, userId: 'account-b', username: 'Bob', message: `Historical entry ${String(n).padStart(3, '0')}`, timestamp: new Date(Date.UTC(2026, 9, 1, 12, 0, n)).toISOString() };
  });
  await page.route('**/api/chat/messages?**', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    const selected = cursor === 'middle-page' ? rows(200, 300) : cursor === 'old-page' ? rows(0, 100) : phase === 'old' ? rows(100, 200) : rows(300, 400);
    const hasMore = cursor !== 'old-page';
    await route.fulfill({ json: { success: true, messages: selected, hasMore, nextCursor: hasMore ? cursor === 'middle-page' || phase === 'old' ? 'old-page' : 'middle-page' : null } });
  });
  await page.evaluate(() => (window as any).__voiceFixture.refreshOrder());
  await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
  await expect(page.getByText('Historical entry 000', { exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Load earlier messages', exact: true })).toHaveCount(0);
  phase = 'new';
  await page.evaluate(() => (window as any).__voiceFixture.refreshOrder());
  await expect(page.getByText('Historical entry 399', { exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Load earlier messages', exact: true })).toBeAttached();
  await expect(page.getByText('Beginning of this conversation', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
  await expect(page.getByText('Historical entry 250', { exact: true })).toBeAttached();
  expect(fixture.errors).toEqual([]);
});

for (const readerMoves of [false, true]) {
  test(`earlier history preserves the reading anchor with a concurrent arrival${readerMoves ? ' and reader scrolling' : ''}`, async ({ page }) => {
    const fixture = await openFixture(page, { surface: 'order', paging: true });
    await openChatSurface(page, 'order');
    await expect(page.getByText('Saved message 021', { exact: true })).toBeAttached();
    let pending: Route | undefined;
    await page.route('**/api/chat/messages?**', async route => {
      if (new URL(route.request().url()).searchParams.has('cursor')) pending = route;
      else await route.fallback();
    });
    const scroller = page.locator('.chat-container .messages-container');
    // Exercise the explicit fallback even in browsers without native anchoring.
    await scroller.evaluate(node => { node.style.overflowAnchor = 'none'; node.scrollTop = 0; });
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await expect.poll(() => !!pending).toBe(true);
    if (readerMoves) {
      await scroller.hover();
      await page.mouse.wheel(0, 320);
      await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(200);
    }
    const anchor = await scroller.evaluate(node => {
      const viewport = node.getBoundingClientRect();
      const message = Array.from(node.querySelectorAll<HTMLElement>('[data-chat-message-id]')).find(element => {
        const box = element.getBoundingClientRect(); return box.bottom > viewport.top && box.top < viewport.bottom;
      })!;
      return { id: message.dataset.chatMessageId!, offset: message.getBoundingClientRect().top - viewport.top };
    });
    fixture.orderRows['order-a'].push({ id: 'concurrent-arrival', userId: 'account-b', username: 'Bob',
      message: 'New delivery information. '.repeat(80), timestamp: '2026-10-02T12:00:00.000Z' });
    await page.evaluate(() => (window as any).__voiceFixture.refreshOrder());
    await expect(page.locator('[data-chat-message-id="concurrent-arrival"]')).toBeAttached();
    await pending!.fulfill({ json: { success: true, messages: fixture.orderRows['order-a'].slice(0, 20), hasMore: false, nextCursor: null } });
    await expect(page.getByText('Saved message 001', { exact: true })).toBeAttached();
    await expect.poll(() => scroller.evaluate((node, saved) => {
      const message = node.querySelector<HTMLElement>(`[data-chat-message-id="${CSS.escape(saved.id)}"]`)!;
      return Math.abs(message.getBoundingClientRect().top - node.getBoundingClientRect().top - saved.offset);
    }, anchor)).toBeLessThan(2);
    expect(fixture.errors).toEqual([]);
  });
}

test('room draft stays locked through A to B to A until its acknowledgement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const fixture = await openFixture(page, { surface: 'page' });
  const input = await openChatSurface(page, 'page');
  let release!: () => void, posts = 0;
  await page.route('**/api/chat/messages', async route => {
    if (route.request().method() === 'POST') { posts++; await new Promise<void>(resolve => release = resolve); }
    await route.fallback();
  });
  await input.fill('Message for General');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(input).toBeDisabled();
  await page.getByLabel('Conversation', { exact: true }).selectOption('other');
  await expect(input).toBeEnabled(); await input.fill('Keep Other draft');
  await page.getByLabel('Conversation', { exact: true }).selectOption('general');
  await expect(input).toHaveValue('Message for General');
  await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
  expect(posts).toBe(1); release();
  await expect(input).toHaveValue(''); await expect(input).toBeEnabled();
  await page.getByLabel('Conversation', { exact: true }).selectOption('other');
  await expect(input).toHaveValue('Keep Other draft');
  expect(fixture.textWrites).toHaveLength(1); expect(fixture.errors).toEqual([]);
});

for (const surface of ['popover', 'sidebar']) {
  test(`pending room send survives closing and reopening the ${surface}`, async ({ page }) => {
    const fixture = await openFixture(page, { surface });
    let input = await openChatSurface(page, surface);
    let release!: () => void, posts = 0;
    await page.route('**/api/chat/messages', async route => {
      if (route.request().method() === 'POST') { posts++; await new Promise<void>(resolve => release = resolve); }
      await route.fallback();
    });
    await input.fill('Pending while closed');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(input).toBeDisabled();
    if (surface === 'popover') await page.getByRole('button', { name: 'Close', exact: true }).click();
    else await page.locator('.chat-drawer .close-btn').click();
    await expect(input).toHaveCount(0);
    input = await openChatSurface(page, surface);
    await expect(input).toHaveValue('Pending while closed'); await expect(input).toBeDisabled();
    expect(posts).toBe(1); release();
    await expect(input).toHaveValue(''); await expect(input).toBeEnabled();
    expect(fixture.textWrites).toHaveLength(1); expect(fixture.errors).toEqual([]);
  });
}

test('a failed pending send reports failure after its popover is reopened', async ({ page }) => {
  const fixture = await openFixture(page, { surface: 'popover' });
  let input = await openChatSurface(page, 'popover'); let release!: () => void;
  await page.route('**/api/chat/messages', async route => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await new Promise<void>(resolve => release = resolve);
    await route.fulfill({ status: 503, json: { success: false, error: 'Unavailable' } });
  });
  await input.fill('Retry after reopening'); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(input).toBeDisabled(); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(input).toHaveCount(0); release();
  input = await openChatSurface(page, 'popover');
  await expect(input).toBeEnabled(); await expect(input).toHaveValue('Retry after reopening');
  await expect(page.getByRole('alert')).toContainText('draft is still here');
  expect(fixture.errors).toEqual([]);
});

for (const surface of ['page', 'order']) {
  test(`remote edits and deletes update loaded earlier history on ${surface}`, async ({ page }) => {
    const fixture = await openFixture(page, { surface, paging: true, realtime: true });
    await openChatSurface(page, surface);
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await expect(page.getByText('Saved message 001', { exact: true })).toBeAttached();
    await page.evaluate(target => {
      const scope = target === 'order' ? { order_id: 'order-a', room_id: null } : { room_id: 'general' };
      (window as any).__voiceRealtime.emit({ eventType: 'UPDATE', new: { id: 'history-1', ...scope, user_id: 'account-b', content: 'Edited older message', is_edited: true, created_at: '2026-10-01T12:00:00Z' } });
      (window as any).__voiceRealtime.emit({ eventType: 'DELETE', old: { id: 'history-2' } });
    }, surface);
    await expect(page.getByText('Edited older message', { exact: true })).toBeAttached();
    await expect(page.getByText('Saved message 001', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Saved message 002', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Saved message 120', { exact: true })).toBeAttached();
    expect(fixture.errors).toEqual([]);
  });
}
