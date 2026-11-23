import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIST_VIEW, mergeListSearch, orderNeighbours, parseListView, readOrderSequence, rememberOrderSequence, serializeListView, stepKey,
} from '../../src/lib/order/list-view-state';

describe('orders list view in the URL', () => {
  it('round-trips search, filter, sort, direction and page', () => {
    const view = { q: 'PO-2611', status: 'urgent' as const, sort: 'client' as const, asc: false, page: 3 };
    const search = serializeListView(view);
    assert.equal(search, '?q=PO-2611&status=urgent&sort=client&dir=desc&page=3');
    assert.deepEqual(parseListView(search), view);
    assert.equal(serializeListView({ ...DEFAULT_LIST_VIEW }), '');
  });
  it('accepts the Round 5 deep links and ignores junk', () => {
    assert.deepEqual(parseListView('?q=PO-2611&status=urgent'), { ...DEFAULT_LIST_VIEW, q: 'PO-2611', status: 'urgent' });
    assert.deepEqual(parseListView('?status=nope&sort=drop&page=-4'), DEFAULT_LIST_VIEW);
    assert.equal(parseListView('?q=' + 'x'.repeat(300)).q.length, 120);
  });
  it('keeps unrelated parameters like ?place=', () => {
    assert.equal(mergeListSearch('?place=floor&page=9', { ...DEFAULT_LIST_VIEW, status: 'active' }), '?place=floor&status=active');
  });
});

describe('order stepper', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  it('finds neighbours in the remembered list', () => {
    rememberOrderSequence(storage, ['a', 'b', 'c', '../x'], '/orders?status=urgent');
    const seq = readOrderSequence(storage);
    assert.deepEqual(seq, { ids: ['a', 'b', 'c'], listHref: '/orders?status=urgent' });
    assert.deepEqual(orderNeighbours(seq, 'b'), { index: 1, total: 3, prev: 'a', next: 'c', listHref: '/orders?status=urgent' });
    assert.equal(orderNeighbours(seq, 'a')?.prev, null);
    assert.equal(orderNeighbours(seq, 'zzz'), null);
  });
  it('never trusts a foreign list link', () => {
    rememberOrderSequence(storage, ['a', 'b'], '//evil.example/orders');
    assert.equal(readOrderSequence(storage)?.listHref, '/orders');
    store.set('oms.orderSequence.v1', '{bad');
    assert.equal(readOrderSequence(storage), null);
  });
  it('maps [ and ] and stays quiet while typing', () => {
    assert.equal(stepKey({ key: '[' }), -1);
    assert.equal(stepKey({ key: ']' }), 1);
    assert.equal(stepKey({ key: ']', ctrlKey: true }), 0);
    assert.equal(stepKey({ key: ']', target: { tagName: 'INPUT' } as unknown as EventTarget }), 0);
    assert.equal(stepKey({ key: ']', target: { closest: (selector: string) => selector.includes('.drawing-workspace') } as unknown as EventTarget }), 0);
    assert.equal(stepKey({ key: 'x' }), 0);
  });
});
