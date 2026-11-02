import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { telegramOnboardingLinks, copyTelegramCommand } from '../../src/lib/notifications/telegram-onboarding';

const bot = 'RecOMS_bot';
// Synthetic fixture, never a real pairing token or bot credential.
const token = 'A'.repeat(40) + '_-z';
const appUrl = `https://t.me/${bot}?start=${token}`;

describe('Telegram onboarding without a native protocol handler', () => {
  it('provides an HTTPS browser path instead of requiring a tg:// handler', () => {
    const links = telegramOnboardingLinks(appUrl, bot);
    assert.ok(links);
    const web = new URL(links.webUrl);
    assert.equal(web.origin, 'https://web.telegram.org');
    assert.equal(web.pathname, '/k/');
    assert.equal(web.search, '');
    const native = new URL(new URLSearchParams(web.hash.slice(2)).get('tgaddr')!);
    assert.equal(native.protocol, 'tg:');
    assert.equal(native.hostname, 'resolve');
    assert.equal(native.searchParams.get('domain'), bot);
    assert.equal(native.searchParams.get('start'), token);
  });

  it('preserves the same one-time token for app, QR and manual pairing', () => {
    const links = telegramOnboardingLinks(appUrl, bot);
    assert.ok(links);
    assert.equal(links.url, appUrl);
    assert.equal(links.botUsername, bot);
    assert.equal(links.command, `/start ${token}`);
  });

  const invalidLinks: Array<[string, unknown]> = [
    ['missing URL', null],
    ['object URL', { url: appUrl }],
    ['relative URL', `/RecOMS_bot?start=${token}`],
    ['native URI', `tg://resolve?domain=${bot}&start=${token}`],
    ['insecure URL', `http://t.me/${bot}?start=${token}`],
    ['lookalike hostname', `https://t.me.evil.example/${bot}?start=${token}`],
    ['credentials', `https://user:password@t.me/${bot}?start=${token}`],
    ['nonstandard port', `https://t.me:444/${bot}?start=${token}`],
    ['different bot', `https://t.me/Another_bot?start=${token}`],
    ['extra path', `https://t.me/${bot}/other?start=${token}`],
    ['missing token', `https://t.me/${bot}`],
    ['short token', `https://t.me/${bot}?start=abc`],
    ['long token', `https://t.me/${bot}?start=${'A'.repeat(64)}`],
    ['duplicate token', `${appUrl}&start=${'B'.repeat(43)}`],
    ['extra parameters', `${appUrl}&domain=Another_bot`],
    ['fragment', `${appUrl}#other`],
    ['command injection', `https://t.me/${bot}?start=${token}%0A%2Fstop`],
    ['whitespace', ` ${appUrl}`]
  ];
  for (const [name, value] of invalidLinks) {
    it(`rejects ${name} without disclosing the token in an error`, () => {
      assert.equal(telegramOnboardingLinks(value, bot), null);
    });
  }

  it('rejects an absent or invalid configured bot username', () => {
    for (const username of [null, undefined, '', '@RecOMS_bot', 'RecOMS', 'x'.repeat(33), 'bot/evil']) {
      assert.equal(telegramOnboardingLinks(appUrl, username), null);
    }
  });

  it('wires the browser and selectable command into the pending-link UI', () => {
    const source = readFileSync('src/lib/notifications/TelegramSettings.svelte', 'utf8');
    assert.ok(source.includes('href={link.webUrl}'), 'A browser-only user must have a visible HTTPS launch action');
    assert.ok(source.includes('value={link.command}'), 'The exact one-time command must be manually selectable');
    assert.ok(source.includes('onclick={copyCommand}'), 'Copy must be an explicit user action');
    assert.ok(source.includes('commandField?.select()'), 'Missing/denied clipboard must have a manual selection fallback');
  });
});


describe('Telegram command clipboard fallback', () => {
  it('copies exactly the one-time command on an explicit clipboard write', async () => {
    const written: string[] = [];
    const copied = await copyTelegramCommand(`/start ${token}`, {
      async writeText(text: string) { written.push(text); }
    });
    assert.equal(copied, true);
    assert.deepEqual(written, [`/start ${token}`]);
  });

  it('requests manual selection when Clipboard is unavailable on HTTP', async () => {
    assert.equal(await copyTelegramCommand(`/start ${token}`, undefined), false);
  });

  it('requests manual selection when the browser denies clipboard access', async () => {
    assert.equal(await copyTelegramCommand(`/start ${token}`, {
      async writeText() { throw new Error('NotAllowedError'); }
    }), false);
  });

  it('does not copy arbitrary or malformed commands', async () => {
    const written: string[] = [];
    const clipboard = { async writeText(text: string) { written.push(text); } };
    for (const command of ['/stop', '/start', `/start ${token}\n/stop`, '/start short']) {
      assert.equal(await copyTelegramCommand(command, clipboard), false);
    }
    assert.deepEqual(written, []);
  });
});
