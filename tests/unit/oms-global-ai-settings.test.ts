import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { settingsTabsCopy } from '../../src/lib/settings/settings-tabs-copy';

describe('OMS R&D settings and consent-free provider workflow', () => {
  it('translates global sharing policy and settings navigation', () => {
    const en = settingsTabsCopy('en');
    for (const lang of ['en', 'ru', 'lv']) {
      const copy = settingsTabsCopy(lang);
      expect(Object.keys(copy).sort()).toEqual(Object.keys(en).sort());
      expect(Object.values(copy).every(v => typeof v === 'string' && v.trim().length > 0)).toBe(true);
    }
    expect(settingsTabsCopy('ru').sharingTitle).not.toBe(en.sharingTitle);
    expect(settingsTabsCopy('lv').sharingTitle).not.toBe(en.sharingTitle);
  });
  it('has separated tabs, an R&D managed switch and a server policy gate', () => {
    const settings = readFileSync('src/routes/settings/+page.svelte', 'utf8');
    const route = readFileSync('src/routes/api/settings/ai-policy/+server.ts', 'utf8');
    const gateway = readFileSync('src/lib/server/ai/openrouter.ts', 'utf8');
    for (const name of ['general', 'ai', 'telegram', 'integrations'])
      expect(settings).toContain('id="settings-panel-' + name + '"');
    expect(settings).toContain('void saveAiPolicy(event.currentTarget.checked)');
    expect(route).toContain("locals.user.role !== 'RD'");
    expect(gateway).toContain('await assertOpenRouterPolicyEnabled()');
  });
  it('removes repeated sharing checkboxes without removing the human proposal approval checkboxes', () => {
    for (const path of [
      'src/lib/assistant/AssistantChat.svelte',
      'src/lib/order/OrderFlowAssistant.svelte',
      'src/lib/order/OrderIntakeAssistant.svelte',
      'src/lib/order/RevisionIntelligence.svelte',
      'src/lib/order/OrderReadinessAssistant.svelte'
    ]) {
      const src = readFileSync(path, 'utf8');
      expect(src).not.toContain('bind:checked={consent}');
      expect(src).not.toContain('!consent');
    }
    expect(readFileSync('src/lib/order/OrderFlowAssistant.svelte','utf8')).toContain('checked={approvals[i]===true}');
    expect(readFileSync('src/lib/order/OrderIntakeAssistant.svelte','utf8')).toContain('checked={approvals[i]===true}');
    expect(readFileSync('src/lib/order/RevisionIntelligence.svelte','utf8')).toContain('checked={checked[i]===true}');
  });
});
