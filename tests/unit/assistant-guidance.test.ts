import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { chatScreenContext, screenContextSignature, screenGuidance } from '../../src/lib/assistant/guidance';
import { isToolRelevant, screenFromPath } from '../../src/lib/assistant/screen-context';
import { summarizeScreenContext } from '../../src/lib/assistant/context-summary';

describe('local screen guidance', () => {
  it('puts unavailable or loading evidence before suggestions about a stale selection', () => {
    assert.equal(screenGuidance('/orders/new', { unsaved: true, loading: true }).hintKey, 'assistant.guide.loading');
    assert.equal(screenGuidance('/inventory/one', { material: { name: 'Old selection' }, unavailable: true }).hintKey, 'assistant.guide.unavailable');
    assert.equal(screenGuidance('/production', { unavailable: { orders: true } }).hintKey, 'assistant.guide.unavailable');
  });

  it('follows unapplied profiles, unsaved order fields and the exact catalog selection', () => {
    assert.equal(screenGuidance('/orders/one/edit', { unsaved: true, profileEditorUnsaved: true }).promptKey, 'assistant.guidePrompt.profileDraft');
    assert.equal(screenGuidance('/orders/new', { unsaved: true }).promptKey, 'assistant.guidePrompt.draft');
    assert.equal(screenGuidance('/inventory/one', { material: { sku: 'XLG-100-12' } }).hintKey, 'assistant.guide.catalogSelection');
    assert.equal(screenGuidance('/inventory/one', { material: { sku: 'OLD' }, editor: { fields: { sku: '' } } }).hintKey, 'assistant.intro.inventory');
  });

  it('uses cabinet view state without drawing conclusions from hours or attendance', () => {
    assert.equal(screenGuidance('/cabinet', { pendingAbsence: true }).hintKey, 'assistant.guide.cabinetDraft');
    assert.equal(screenGuidance('/cabinet', { view: 'reports' }).hintKey, 'assistant.guide.cabinetReports');
    assert.equal(screenGuidance('/cabinet', { view: 'team' }).hintKey, 'assistant.guide.cabinetTeam');
    assert.equal(screenGuidance('/cabinet', { ownActualMinutes: 0 }).hintKey, 'assistant.intro.cabinet');
    assert.equal(summarizeScreenContext({ pendingEntry: true }).unsaved, true);
  });
});

describe('assistant context freshness', () => {
  it('compares semantic object values and workflow availability without key-order noise', () => {
    const signature = screenContextSignature('/inventory/one', { material: { code: 'XLG-100-12', volts: 12 }, unsaved: false }, ['intake', 'review']);
    assert.equal(signature, screenContextSignature('/inventory/one', { unsaved: false, material: { volts: 12, code: 'XLG-100-12' } }, ['review', 'intake']));
    assert.notEqual(signature, screenContextSignature('/inventory/one', { material: { code: 'XLG-100-24', volts: 24 }, unsaved: false }, ['intake', 'review']));
    assert.notEqual(signature, screenContextSignature('/inventory/one', { material: { code: 'XLG-100-12', volts: 12 }, unsaved: false }, ['review']));
  });

  it('uses the same sanitized bounds as requests and never serializes credentials', () => {
    const signature = screenContextSignature('/orders/new', { notes: 'x'.repeat(1201), token: 'first-secret', fileBytes: 'private-bytes' });
    assert.equal(signature, screenContextSignature('/orders/new', { notes: 'x'.repeat(1200), token: 'changed-secret', fileBytes: 'other-bytes' }));
    assert.doesNotMatch(signature, /secret|bytes|token|fileBytes/);
    assert.notEqual(screenContextSignature('/orders/new', { profiles: ['face', 'back'] }), screenContextSignature('/orders/new', { profiles: ['back', 'face'] }));
  });
});

const chat = (overrides = {}) => chatScreenContext({ current: true, loading: false, error: false,
  selected: true, roomKind: 'channel', visibleMessages: 120, hasEarlierMessages: true,
  loadingEarlier: false, draftPresent: false, sending: false, voiceAvailable: true, ...overrides });

describe('private human-chat context', () => {
  it('recognizes chat routes without granting a catalog or operational lookup', () => {
    assert.equal(screenFromPath('/chat?room=general'), 'chat');
    assert.equal(screenFromPath('/chat/'), 'chat');
    assert.equal(screenFromPath('/toolkit/chat'), 'toolkit');
    for (const slug of ['catalog.search', 'catalog.compare', 'data.pending_orders', 'data.low_stock', 'signage.led_strip', 'cnc.feeds_speeds', 'paint.match']) {
      assert.equal(isToolRelevant(slug, 'chat'), false);
    }
  });

  it('projects controls and counts while dropping all text, identities, files and recordings', () => {
    const snapshot = chat({ roomId: 'private-room', roomName: 'Private customer name', messages: ['confidential message'],
      draftText: 'secret draft', members: ['private person'], audio: 'private recording', files: ['private file'] });
    assert.equal(snapshot.visibleMessageCount, 120);
    assert.equal(snapshot.messageContentsProvided, false);
    assert.equal(snapshot.voiceContentsProvided, false);
    assert.equal(snapshot.voiceRetentionCalendarMonths, 3);
    assert.doesNotMatch(JSON.stringify(snapshot), /private|secret|confidential/);
    assert.deepEqual(summarizeScreenContext(snapshot).rows, [{ key: 'visibleMessages', value: 120 }]);
    assert.equal(screenGuidance('/chat', snapshot).hintKey, 'assistant.guide.chatHistory');
    assert.equal(screenGuidance('/chat', chat({ draftPresent: true })).hintKey, 'assistant.guide.chatDraft');
  });

  it('does not turn unknown or old-account state into zero or a selected conversation', () => {
    for (const overrides of [{ current: false }, { loading: true }, { error: true }, { selected: false }, { visibleMessages: NaN }]) {
      assert.equal(chat(overrides).visibleMessageCount, null);
    }
    assert.equal(chat({ current: false, draftPresent: true }).draftPresent, false);
    assert.equal(chat({ current: false }).conversationKind, null);
    assert.equal(chat({ roomKind: 'Unexpected private name' }).conversationKind, null);
    assert.equal(chat({ visibleMessages: 0 }).visibleMessageCount, 0);
    assert.equal(screenGuidance('/chat', chat({ selected: false })).hintKey, 'assistant.guide.chatSelect');
  });
});
