import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { telegramReceiverCopy } from '../../src/lib/notifications/telegram-receiver-copy';
describe('Telegram receiver localization', () => {
  it('provides all controls and status/error translations in English, Russian and Latvian', () => {
    const en = telegramReceiverCopy('en');
    for (const language of ['ru', 'lv']) {
      const copy = telegramReceiverCopy(language);
      assert.deepEqual(Object.keys(copy).sort(), Object.keys(en).sort());
      assert.deepEqual(Object.keys(copy.states).sort(), Object.keys(en.states).sort());
      assert.deepEqual(Object.keys(copy.errors).sort(), Object.keys(en.errors).sort());
      assert.notEqual(copy.mode, en.mode);
    }
  });
  it('resolves regional locale names and falls back to English', () => {
    assert.equal(telegramReceiverCopy('ru-LV').mode, telegramReceiverCopy('ru').mode);
    assert.equal(telegramReceiverCopy(null).mode, telegramReceiverCopy('en').mode);
    assert.equal(telegramReceiverCopy('unknown').mode, telegramReceiverCopy('en').mode);
  });
});
