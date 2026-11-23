import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { isTypingTarget, listKeyAction, nextListIndex } from '../../src/lib/order/list-keys';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, ...extra }) as unknown as EventTarget;

describe('orders list keys', () => {
  it('maps J / K / Enter / E and / and ignores modifiers', () => {
    assert.deepEqual(listKeyAction({ key: 'j' }, false), { type: 'move', delta: 1 });
    assert.deepEqual(listKeyAction({ key: 'k' }, false), { type: 'move', delta: -1 });
    assert.deepEqual(listKeyAction({ key: '/' }, false), { type: 'search' });
    assert.equal(listKeyAction({ key: 'Enter' }, false), null);
    assert.deepEqual(listKeyAction({ key: 'Enter' }, true), { type: 'open' });
    assert.deepEqual(listKeyAction({ key: 'e' }, true), { type: 'expand' });
    assert.equal(listKeyAction({ key: 'j', ctrlKey: true }, true), null);
    assert.equal(listKeyAction({ key: 'j', defaultPrevented: true }, true), null);
  });
  it('stays out of the way while typing or inside dialogs and links', () => {
    assert.ok(isTypingTarget(el('INPUT')));
    assert.ok(isTypingTarget(el('div', { isContentEditable: true })));
    assert.ok(isTypingTarget(el('BUTTON', { closest: (s: string) => s.includes('dialog') ? {} : null })));
    assert.ok(!isTypingTarget(el('BODY')));
    assert.equal(listKeyAction({ key: 'j', target: el('TEXTAREA') }, true), null);
    assert.equal(listKeyAction({ key: 'Enter', target: el('A', { closest: (s: string) => s.includes('a') ? {} : null }) }, true), null);
  });
  it('moves within bounds', () => {
    assert.equal(nextListIndex(-1, 1, 5), 0);
    assert.equal(nextListIndex(-1, -1, 5), 4);
    assert.equal(nextListIndex(4, 1, 5), 4);
    assert.equal(nextListIndex(0, -1, 5), 0);
    assert.equal(nextListIndex(2, 1, 0), -1);
  });
});
