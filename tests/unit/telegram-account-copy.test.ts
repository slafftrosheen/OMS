import { describe, it, expect } from 'vitest';
import { telegramAccountCopy } from '../../src/lib/notifications/telegram-account-copy';

describe('Telegram personal account copy', () => {
  it('provides every security and preference label in English, Russian and Latvian', () => {
    const en = telegramAccountCopy('en');
    for (const lang of ['en', 'ru', 'lv']) {
      const copy = telegramAccountCopy(lang);
      expect(Object.keys(copy).sort()).toEqual(Object.keys(en).sort());
      expect(Object.keys(copy.categories).sort()).toEqual(['CHAT','INVENTORY','ORDER','SYSTEM']);
      expect(Object.values(copy).every(value => typeof value === 'object' || value.trim().length > 0)).toBe(true);
      expect(copy.aiHint.includes('/ask')).toBe(true);
      expect(copy.aiConsentRequired.includes('Telegram')).toBe(true);
    }
    expect(telegramAccountCopy('ru').approvalTitle === en.approvalTitle).toBe(false);
    expect(telegramAccountCopy('lv').approvalTitle === en.approvalTitle).toBe(false);
  });
  it('uses English for missing or unsupported locale values', () => {
    expect(telegramAccountCopy(null)).toEqual(telegramAccountCopy('en'));
    expect(telegramAccountCopy('de')).toEqual(telegramAccountCopy('en'));
  });
});
