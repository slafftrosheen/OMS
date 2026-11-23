import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { formatCount, parseCount, transitionDirection, wantsPageTransition } from '../../src/lib/ui/motion';
import { readFileSync } from 'node:fs';

describe('motion helpers', () => {
  it('reads and rewrites displayed KPI values without changing their format', () => {
    for (const text of ['1 240', '86%', '€3.5k', '12', '1,204,000', '0.75 m²']) {
      const parts = parseCount(text);
      assert.ok(parts, text);
      assert.equal(formatCount(parts!, parts!.value), text);
    }
    assert.equal(parseCount('—'), null);
    assert.equal(parseCount('PO-12/3'), null);
  });
  it('skips page transitions on canvas, editing and chat routes', () => {
    assert.equal(wantsPageTransition('/orders', '/calendar'), true);
    assert.equal(wantsPageTransition('/orders', '/orders/new'), false);
    assert.equal(wantsPageTransition('/orders/abc', '/orders/abc/edit'), false);
    assert.equal(wantsPageTransition('/toolkit/canvas', '/orders'), false);
    assert.equal(wantsPageTransition('/orders', '/orders'), false);
    assert.equal(transitionDirection('/orders', '/orders/abc'), 'forward');
    assert.equal(transitionDirection('/orders/abc', '/orders'), 'back');
    assert.equal(transitionDirection('/orders', '/calendar'), 'swap');
  });
  it('every R5 animation has a reduced-motion fallback', () => {
    const css = readFileSync('static/fabriek-motion-r5.css', 'utf8');
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /html\[data-motion="off"\]/);
    assert.ok(readFileSync('src/app.html', 'utf8').indexOf('fabriek-motion-r5.css') > readFileSync('src/app.html', 'utf8').indexOf('fabriek-motion.css'));
  });
});
