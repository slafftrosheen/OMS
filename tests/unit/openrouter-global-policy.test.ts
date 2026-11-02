import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseOpenRouterPolicyChange, validPolicyRow } from '../../src/lib/server/ai/provider-policy';

describe('company-wide OpenRouter sharing policy', () => {
  it('defaults fail-closed for absent or malformed database state', () => {
    for (const value of [undefined, null, {}, { enabled: null }, { enabled: 'true' }, { enabled: 1 }, []])
      expect(validPolicyRow(value)).toBe(false);
    expect(validPolicyRow({ enabled: false })).toBe(true);
    expect(validPolicyRow({ enabled: true })).toBe(true);
  });
  it('only accepts one explicit boolean field from an administrator mutation', () => {
    for (const input of [{}, { enabled: null }, { enabled: 'false' }, { enabled: 0 }, { enabled: true, role: 'RD' }, null])
      expect(parseOpenRouterPolicyChange(input)).toBeNull();
    expect(parseOpenRouterPolicyChange({ enabled: true })).toBe(true);
    expect(parseOpenRouterPolicyChange({ enabled: false })).toBe(false);
  });
  it('enforces the policy at the single provider transport, not only in UI consent checkboxes', () => {
    const gateway = readFileSync('src/lib/server/ai/openrouter.ts','utf8');
    const policy = readFileSync('src/lib/server/ai/provider-policy.ts','utf8');
    const route = readFileSync('src/routes/api/settings/ai-policy/+server.ts','utf8');
    expect(gateway).toContain('await assertOpenRouterPolicyEnabled()');
    expect(policy).toContain("eq('singleton', true).single()");
    expect(policy).toContain('if (!policy.enabled)');
    expect(route).toContain("data.role !== 'RD'");
    expect(route).toContain("locals.user.role !== 'RD'");
    expect(route).toContain('openRouterPolicyDatabase()');
  });
});
