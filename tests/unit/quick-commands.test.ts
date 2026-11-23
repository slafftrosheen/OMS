import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  fold, orderJump, quickCommands, rankCommands, readRecentOrders, recentCommands, rememberRecentOrder, scoreText,
} from '../../src/lib/search/quick-commands';

const label = (c: { fallback: string; title?: string }) => c.title ?? c.fallback;

describe('quick commands', () => {
  it('shows nothing signed out and admin pages only to admins', () => {
    assert.deepEqual(quickCommands(null, true), []);
    const worker = quickCommands({ role: 'Worker' }, false).map(c => c.id);
    assert.ok(!worker.includes('users') && !worker.includes('newOrder'));
    assert.ok(worker.includes('orders') && worker.includes('urgent'));
    const boss = quickCommands({ role: 'Boss' }, true).map(c => c.id);
    assert.ok(boss.includes('users') && boss.includes('materials') && boss.includes('newOrder'));
  });
  it('matches accents, word starts and other languages', () => {
    assert.equal(fold('Ražošanā'), 'razosana');
    assert.ok(scoreText('cal', 'Calendar') > scoreText('dar', 'Calendar'));
    assert.equal(scoreText('zzz', 'Calendar'), 0);
    const commands = quickCommands({ role: 'Boss' }, true);
    assert.equal(rankCommands('cal', commands, label)[0].id, 'calendar');
    assert.equal(rankCommands('kalend', commands, label)[0].id, 'calendar');
    assert.equal(rankCommands('склад', commands, label)[0].id, 'inventory');
    assert.equal(rankCommands('new', commands, label)[0].id, 'newOrder');
    assert.equal(rankCommands('dxf', commands, label)[0].id, 'canvas');
    assert.equal(rankCommands('', commands, label, 3).length, 3);
  });
  it('turns order numbers into a direct search link', () => {
    assert.deepEqual(orderJump('PO-2611'), { number: 'PO-2611', href: '/orders?q=PO-2611' });
    assert.deepEqual(orderJump('po 2611'), { number: 'PO-2611', href: '/orders?q=PO-2611' });
    assert.deepEqual(orderJump('#2611'), { number: 'PO-2611', href: '/orders?q=PO-2611' });
    assert.equal(orderJump('2611')?.number, 'PO-2611');
    assert.equal(orderJump('PO-26/B')?.number, 'PO-26/B');
    assert.equal(orderJump('calendar'), null);
    assert.equal(orderJump('12'), null);
  });
  it('keeps six recent orders per user, newest first, without duplicates', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    for (let i = 0; i < 8; i++) rememberRecentOrder(storage, 'u1', { id: `o${i}`, title: `PO-${i}` }, i);
    rememberRecentOrder(storage, 'u1', { id: 'o3', title: 'PO-3 · Box letters' }, 99);
    const recent = readRecentOrders(storage, 'u1');
    assert.equal(recent.length, 6);
    assert.equal(recent[0].id, 'o3');
    assert.equal(recent[0].title, 'PO-3 · Box letters');
    assert.equal(new Set(recent.map(r => r.id)).size, 6);
    assert.deepEqual(readRecentOrders(storage, 'u2'), []);
    assert.deepEqual(readRecentOrders(storage, null), []);
    rememberRecentOrder(storage, 'u1', { id: '../evil', title: 'x' });
    assert.ok(!readRecentOrders(storage, 'u1').some(r => r.id === '../evil'));
    assert.equal(recentCommands(recent)[0].href, '/orders/o3');
  });
});
