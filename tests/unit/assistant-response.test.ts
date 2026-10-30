import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { assistantInline, assistantLink, parseAssistantResponse } from '../../src/lib/assistant/response-format';

describe('safe assistant answer formatting', () => {
  it('renders useful headings, emphasis, lists and code as typed text nodes', () => {
    const blocks = parseAssistantResponse('## Product check\n\nUse **Mean Well** with `12 V`.\n\n1. Check the model\n2. Confirm the rating\n\n```text\n<svg onload="alert(1)">\n```');
    assert.deepEqual(blocks.map(block => block.type), ['heading','paragraph','list','code']);
    assert.deepEqual(blocks[1], { type: 'paragraph', content: [
      { type: 'text', text: 'Use ' }, { type: 'strong', text: 'Mean Well' },
      { type: 'text', text: ' with ' }, { type: 'code', text: '12 V' }, { type: 'text', text: '.' }
    ] });
    assert.deepEqual(blocks[3], { type: 'code', text: '<svg onload="alert(1)">' });
    assert.equal(blocks[2].type === 'list' && blocks[2].start, 1);
  });

  it('preserves units and missing values in compact comparison tables', () => {
    const blocks = parseAssistantResponse('| Model | Power | Package |\n| :--- | ---: | --- |\n| A | 12 W/m | 5 m reel |\n| B | Unknown | 1 m |\n\nNo compatibility approval.');
    assert.equal(blocks[0].type, 'table');
    if (blocks[0].type !== 'table') throw new Error('Expected table');
    assert.equal(blocks[0].headings.length, 3);
    assert.deepEqual(blocks[0].rows[0][1], [{ type: 'text', text: '12 W/m' }]);
    assert.deepEqual(blocks[0].rows[1][1], [{ type: 'text', text: 'Unknown' }]);
    assert.equal(blocks[1].type, 'paragraph');
  });

  it('keeps raw HTML, images and unsafe links as text without an executable node', () => {
    const text = '<img src=x onerror=alert(1)>\n![remote image](https://tracker.example/pixel)\n[bad](javascript:alert) [bad](data:text/html,boom)';
    const blocks = parseAssistantResponse(text);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'paragraph');
    if (blocks[0].type !== 'paragraph') throw new Error('Expected paragraph');
    assert.ok(blocks[0].content.every(token => token.type === 'text'));
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '//evil.test',
      'https://user:password@example.com', 'https:\\evil.test', 'https://example.com/\npath']) assert.equal(assistantLink(url), null);
    assert.deepEqual(assistantInline('[Supplier](https://www.lemona.lv/en/product.html)'), [
      { type: 'link', text: 'Supplier', href: 'https://www.lemona.lv/en/product.html' }
    ]);
  });

  it('leaves malformed tables readable and bounds long responses without dropping trailing short content', () => {
    const malformed = parseAssistantResponse('| A | B |\n|--|--|\n| 1 | 2 |');
    assert.equal(malformed[0].type, 'paragraph');
    const mixed = parseAssistantResponse('- First\n- Second\n\nAfter the list.');
    assert.deepEqual(mixed.map(block => block.type), ['list','paragraph']);
    const bounded = parseAssistantResponse('x'.repeat(20000));
    assert.equal(bounded[0].type === 'paragraph' && bounded[0].content[0].text.length, 12000);
  });
});
