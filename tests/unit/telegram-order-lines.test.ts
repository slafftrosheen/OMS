import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { telegramDueFlag, telegramStatusWord } from '../../src/lib/server/notifications/telegram-order-lines';
import { formatTelegramBotReply } from '../../src/lib/server/notifications/telegram-bot';

describe('telegram order lines', () => {
  it('turns status codes into words in each language', () => {
    assert.equal(telegramStatusWord('IN_PRODUCTION', 'en'), 'In production');
    assert.equal(telegramStatusWord('ready_to_load', 'lv'), 'Gatavs iekraušanai');
    assert.equal(telegramStatusWord('PENDING_REVIEW', 'ru'), 'На проверке');
    assert.equal(telegramStatusWord('SOMETHING_NEW', 'en'), 'SOMETHING_NEW');
  });
  it('flags late, today and tomorrow only for open orders', () => {
    assert.equal(telegramDueFlag('2026-11-19', '2026-11-22', 'IN_PRODUCTION', 'en'), '⚠ Overdue 3 d');
    assert.equal(telegramDueFlag('2026-11-22T00:00:00Z', '2026-11-22', 'CONFIRMED', 'lv'), '● Termiņš šodien');
    assert.equal(telegramDueFlag('2026-11-23', '2026-11-22', 'CONFIRMED', 'ru'), 'Срок завтра');
    assert.equal(telegramDueFlag('2026-11-30', '2026-11-22', 'CONFIRMED', 'en'), '');
    assert.equal(telegramDueFlag('2026-11-01', '2026-11-22', 'DISPATCHED', 'en'), '');
    assert.equal(telegramDueFlag(null, '2026-11-22', 'CONFIRMED', 'en'), '');
  });
  it('shows the words and flag in the today reply', () => {
    const reply = formatTelegramBotReply({ kind: 'today', locale: 'en', date: '2026-11-22', timezone: 'Europe/Riga', events: [],
      orders: [{ id: 'x', po_number: 'PO-7', title: 'Box letters', status: 'IN_PRODUCTION', client: 'Acme', due_date: '2026-11-21', loading_date: null }] },
      { options: undefined } as any);
    assert.match(reply.text, /In production · Acme/);
    assert.match(reply.text, /Overdue 1 d/);
    assert.match(reply.text, /Due: 2026-11-21/);
  });
});
