import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { sortTelegramOrdersByUrgency, telegramDigestLine, telegramDueBucket } from '../../src/lib/server/notifications/telegram-order-lines';
import { formatTelegramBotReply } from '../../src/lib/server/notifications/telegram-bot';
import { sortTodayOrders, todayGlance } from '../../src/lib/telegram/today-glance';

const day = '2026-11-22';
const order = (id: string, due: string | null, status = 'IN_PRODUCTION', loading: string | null = null) =>
  ({ id, po_number: `PO-${id}`, title: 'Sign', client: 'Acme', status, due_date: due, loading_date: loading });

describe('telegram digest', () => {
  it('buckets open orders by due day', () => {
    assert.equal(telegramDueBucket('2026-11-20', day, 'CONFIRMED').bucket, 'overdue');
    assert.equal(telegramDueBucket('2026-11-22', day, 'CONFIRMED').bucket, 'today');
    assert.equal(telegramDueBucket('2026-11-23', day, 'CONFIRMED').bucket, 'tomorrow');
    assert.equal(telegramDueBucket('2026-12-01', day, 'CONFIRMED').bucket, 'later');
    assert.equal(telegramDueBucket('2026-11-01', day, 'DISPATCHED').bucket, 'none');
  });
  it('sorts the most overdue first and keeps ties stable', () => {
    const sorted = sortTelegramOrdersByUrgency([order('a', '2026-12-01'), order('b', '2026-11-22'), order('c', '2026-11-18'),
      order('d', '2026-11-21'), order('e', null), order('f', '2026-11-22')], day);
    assert.deepEqual(sorted.map(o => o.id), ['c', 'd', 'b', 'f', 'a', 'e']);
  });
  it('writes one digest line in each language', () => {
    const list = [order('a', '2026-11-20'), order('b', '2026-11-22', 'CONFIRMED', '2026-11-22'), order('c', '2026-11-23'), order('d', '2026-11-01', 'ARCHIVED', '2026-11-22')];
    assert.equal(telegramDigestLine(list, day, 'en'), '⚠ 1 overdue · ● 1 due today · 1 due tomorrow · 🚚 1 loading today');
    assert.match(telegramDigestLine(list, day, 'lv'), /1 nokavēti/);
    assert.match(telegramDigestLine(list, day, 'ru'), /1 просрочено/);
    assert.equal(telegramDigestLine([order('x', '2026-12-30')], day, 'en'), '');
  });
  it('puts the digest and urgent buttons on /today', () => {
    const config = { options: { commandsEnabled: true, commands: ['today', 'order', 'help'], aiEnabled: false } } as any;
    const reply = formatTelegramBotReply({ kind: 'today', locale: 'en', date: day, timezone: 'Europe/Riga', events: [],
      orders: [order('11111111-1111-4111-8111-111111111111', '2026-12-30'), order('22222222-2222-4222-8222-222222222222', '2026-11-19')] }, config);
    assert.match(reply.text, /⚠ 1 overdue/);
    assert.ok(reply.text.indexOf('PO-2222') < reply.text.indexOf('PO-1111'));
    const urgent = reply.keyboard.flat().filter(b => 'callback_data' in b && String(b.callback_data).startsWith('oms:order:'));
    assert.equal(urgent.length, 1);
    assert.match(urgent[0].text, /^⚠ PO-2222/);
  });
});

describe('mini app glance', () => {
  it('counts loading, due and unread and sorts loading first', () => {
    const orders = [{ id: 'a' }, { id: 'b', due_today: true }, { id: 'c', loading_today: true }, { id: 'd', loading_today: true, due_today: true }];
    assert.deepEqual(todayGlance(orders, 3), { loading: 2, due: 2, unread: 3 });
    assert.deepEqual(todayGlance([], -1), { loading: 0, due: 0, unread: 0 });
    assert.deepEqual(sortTodayOrders(orders).map(o => o.id), ['c', 'd', 'b', 'a']);
  });
});
