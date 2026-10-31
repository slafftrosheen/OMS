import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ serviceWorkers: 'block', viewport: { width: 1180, height: 900 } });
const tone = readFileSync(new URL('../fixtures/chat/voice-tone.webm', import.meta.url));
type VoiceFields = { roomId?: string; orderId?: string; durationMs: string; clientRequestId: string; fileType: string; bytes: number };
type FixtureOptions = { surface?: string; mode?: string; failures?: number; history?: boolean; onVoice?: (route: Route, fields: VoiceFields, result: any) => Promise<boolean> };

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
      if (request.method() === 'GET') { await route.fulfill({ json: { success: true, messages: url.searchParams.has('orderId') ? orderRows[url.searchParams.get('orderId')!] || [] : roomRows[url.searchParams.get('roomId')!] || [] } }); return; }
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
  await page.goto(`/voice-chat.html?surface=${options.surface || 'recorder'}`);
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
      await page.getByRole('tab', { name: 'Other', exact: true }).click();
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
