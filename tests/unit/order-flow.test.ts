import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { orderFlow } from '../../src/lib/order/order-flow';
import en from '../../src/locales/en.json';
import lv from '../../src/locales/lv.json';
import ru from '../../src/locales/ru.json';

const all = { mayEdit: true, mayReview: true, mayDispatch: true, mayControlAnyStage: true };
const none = { mayEdit: false, mayReview: false, mayDispatch: false, mayControlAnyStage: false };
const route = (states: Record<string, string>) => Object.entries(states).map(([station, state]) => ({ station, state }));

describe('order flow guide', () => {
  it('maps the lifecycle to one step and one owner', () => {
    assert.deepEqual([orderFlow('DRAFT', [], all).step, orderFlow('DRAFT', [], all).action], ['draft', 'edit']);
    assert.deepEqual([orderFlow('pending_review', [], all).step, orderFlow('PENDING_REVIEW', [], all).owner], ['review', 'review']);
    assert.equal(orderFlow('READY_TO_LOAD', [], all).action, 'dispatch');
    assert.equal(orderFlow('DISPATCHED', [], all).action, 'archive');
    assert.equal(orderFlow('ARCHIVED', [], all).tone, 'done');
    assert.equal(orderFlow('CANCELLED', [], all).tone, 'stopped');
  });

  it('names the station that holds the route', () => {
    const blocked = orderFlow('IN_PRODUCTION', route({ CAD: 'COMPLETED', CNC: 'BLOCKED', EDGE: 'IN_PROGRESS' }), all);
    assert.deepEqual([blocked.tone, blocked.next, blocked.station], ['blocked', 'blocked', 'CNC']);
    const running = orderFlow('IN_PRODUCTION', route({ CAD: 'COMPLETED', CNC: 'IN_PROGRESS' }), all);
    assert.deepEqual([running.next, running.station], ['running', 'CNC']);
    const next = orderFlow('CONFIRMED', route({ CAD: 'NOT_STARTED', CNC: 'NOT_STARTED' }), all);
    assert.deepEqual([next.step, next.next, next.station], ['confirmed', 'start', 'CAD']);
    const done = orderFlow('IN_PRODUCTION', route({ CAD: 'COMPLETED', CNC: 'SKIPPED', DELIVERY: 'NOT_STARTED' }), all);
    assert.equal(done.next, 'finish');
  });

  it('never offers an action the user cannot already take', () => {
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'DISPATCHED'])
      assert.equal(orderFlow(status, route({ CAD: 'IN_PROGRESS' }), none).action, null, status);
  });

  it('pauses on hold without proposing work', () => {
    const held = orderFlow('ON_HOLD', route({ CAD: 'COMPLETED', CNC: 'NOT_STARTED' }), all);
    assert.deepEqual([held.tone, held.step, held.action], ['held', 'production', null]);
  });

  it('has every sentence in English, Latvian and Russian', () => {
    for (const copy of [en, lv, ru] as any[]) {
      for (const key of Object.keys((en as any).orderFlow.next)) assert.ok(copy.orderFlow.next[key], key);
      for (const key of Object.keys((en as any).orderFlow.action)) assert.ok(copy.orderFlow.action[key], key);
      for (const key of Object.keys((en as any).orderFlow.steps)) assert.ok(copy.orderFlow.steps[key], key);
    }
  });
});
