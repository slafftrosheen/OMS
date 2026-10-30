import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseTelegramAccountMutation, normalizeTelegramPreferences, defaultTelegramPreferences } from '../../src/lib/notifications/telegram-account';

describe('Telegram account request boundary', () => {
  it('accepts the existing connect operation without an identity parameter', () => {
    assert.deepEqual(parseTelegramAccountMutation('POST', { action: 'connect' }), { action: 'connect' });
  });
  it('rejects supplied account/chat identity instead of trusting or silently ignoring it', () => {
    for (const key of ['userId', 'user_id', 'chatId', 'telegramUserId', '__proto__']) {
      const body = JSON.parse(`{"action":"connect","${key}":"another-user"}`);
      assert.equal(parseTelegramAccountMutation('POST', body), null);
    }
  });
  it('requires the exact pending request UUID for confirmation', () => {
    const requestId='6b7cc031-4681-4330-bd04-3069f08d5612';
    assert.deepEqual(parseTelegramAccountMutation('POST', { action:'confirm', requestId }), { action:'confirm', requestId });
    for (const requestId of [undefined, '', '111', 123, '../other']) assert.equal(parseTelegramAccountMutation('POST', {action:'confirm', requestId}), null);
  });
  it('preserves pause/resume compatibility and rejects mixed mutations', () => {
    assert.deepEqual(parseTelegramAccountMutation('PATCH', {enabled:false}), {action:'enabled', enabled:false});
    assert.equal(parseTelegramAccountMutation('PATCH', {enabled:true, user_id:'other'}), null);
    assert.equal(parseTelegramAccountMutation('PATCH', {enabled:'true'}), null);
    assert.equal(parseTelegramAccountMutation('DELETE', {enabled:true}), null);
  });
  it('accepts bounded complete personal preference updates', () => {
    const preferences={notificationCategories:['CHAT','ORDER'], previewMode:'private', aiEnabled:true};
    assert.deepEqual(parseTelegramAccountMutation('PATCH',{preferences}), {action:'preferences', preferences:{...preferences,notificationCategories:['ORDER','CHAT']}});
  });
  it('does not allow personal preferences to enable admin settings or foreign accounts', () => {
    const p=defaultTelegramPreferences();
    for(const extra of [{userId:'other'},{enabled:true},{botToken:'secret'},{connectionMode:'webhook'}]) {
      assert.equal(normalizeTelegramPreferences({...p,...extra}),null);
    }
    assert.equal(parseTelegramAccountMutation('PATCH',{preferences:p,enabled:true}),null);
  });
  it('rejects invalid categories, duplicate floods, coercions and preview modes', () => {
    const p=defaultTelegramPreferences();
    for(const notificationCategories of [['ADMIN'],['order'], 'ORDER', [null], ['ORDER','ORDER','ORDER','ORDER','ORDER']]) assert.equal(normalizeTelegramPreferences({...p,notificationCategories}),null);
    for(const aiEnabled of ['true',1,null]) assert.equal(normalizeTelegramPreferences({...p,aiEnabled}),null);
    assert.equal(normalizeTelegramPreferences({...p,previewMode:'html'}),null);
    assert.equal(normalizeTelegramPreferences(null),null);
    assert.equal(normalizeTelegramPreferences([]),null);
  });
  it('allows opting out of every category and produces independent defaults', () => {
    const a=defaultTelegramPreferences(); a.notificationCategories.length=0;
    assert.equal(defaultTelegramPreferences().notificationCategories.length,4);
    assert.equal(defaultTelegramPreferences().aiEnabled,false);
    assert.deepEqual(normalizeTelegramPreferences({...defaultTelegramPreferences(), notificationCategories:[]})?.notificationCategories,[]);
  });
});
