import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { telegramOnboardingCopy } from '../../src/lib/notifications/telegram-onboarding-copy';

describe('Telegram onboarding translations', () => {
  for (const locale of ['en', 'ru', 'lv']) {
    it(`provides browser, manual and security instructions in ${locale}`, () => {
      const copy = telegramOnboardingCopy(locale);
      assert.deepEqual(Object.keys(copy).sort(), Object.keys(telegramOnboardingCopy('en')).sort());
      assert.ok(Object.values(copy).every(value => typeof value === 'string' && value.trim().length > 0));
      assert.ok(copy.openWeb.includes('Telegram Web'));
      assert.ok(copy.manualAfter.includes('/start'));
      assert.ok(copy.launchHint.includes('tg://'));
      assert.ok(copy.manualCopy.includes('Ctrl+C'));
      if (locale !== 'en') {
        for (const key of Object.keys(copy) as Array<keyof typeof copy>) {
          assert.notEqual(copy[key], telegramOnboardingCopy('en')[key], `${locale}.${key} must be translated`);
        }
      }
    });
  }
  it('falls back to English for missing or unsupported locales', () => {
    for (const locale of [null, undefined, '', 'de']) {
      assert.deepEqual(telegramOnboardingCopy(locale), telegramOnboardingCopy('en'));
    }
  });
});
