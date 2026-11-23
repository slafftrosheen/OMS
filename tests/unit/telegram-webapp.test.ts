import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { paintTelegramChrome, telegramHaptic, telegramInsets, telegramScheme } from '../../src/lib/telegram/webapp';
import { telegramPlace } from '../../src/lib/state/place';

describe('telegram mini app presentation', () => {
  it('follows the Telegram scheme unless the URL pins a place', () => {
    assert.equal(telegramPlace('/orders', '', 'dark'), 'floor');
    assert.equal(telegramPlace('/station/CNC', '', 'light'), 'office');
    assert.equal(telegramPlace('/orders', '?place=office', 'dark'), 'office');
    assert.equal(telegramScheme({ colorScheme: 'dark' }), 'dark');
    assert.equal(telegramScheme(null), null);
  });
  it('paints chrome only on clients that support it and with a valid colour', () => {
    const calls: string[] = [];
    const app = { isVersionAtLeast: (v: string) => v <= '7.0', setHeaderColor: (c: string) => calls.push('h' + c), setBackgroundColor: (c: string) => calls.push('b' + c), setBottomBarColor: () => calls.push('bar') };
    paintTelegramChrome(app, '#121316');
    paintTelegramChrome(app, 'red');
    assert.deepEqual(calls, ['h#121316', 'b#121316']);
  });
  it('uses haptics when available and never throws', () => {
    const seen: string[] = [];
    const app = { isVersionAtLeast: () => true, HapticFeedback: { selectionChanged: () => seen.push('select'), notificationOccurred: (k: string) => seen.push(k), impactOccurred: () => { throw new Error('x'); } } };
    telegramHaptic('select', app); telegramHaptic('success', app); telegramHaptic('light', app);
    telegramHaptic('select', null);
    assert.deepEqual(seen, ['select', 'success']);
  });
  it('clamps safe-area insets', () => {
    assert.deepEqual(telegramInsets({ contentSafeAreaInset: { top: 40, bottom: -3 }, safeAreaInset: { top: 500 } }), { '--tg-inset-top': '240px', '--tg-inset-bottom': '0px' });
  });
});
