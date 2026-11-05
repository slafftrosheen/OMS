import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('R&D Telegram administration', () => {
  it('splits connection, delivery and bot commands while preserving a common save', () => {
    const source = readFileSync('src/lib/notifications/TelegramAdminSettings.svelte', 'utf8');
    expect(source).toContain("const adminTabs: AdminTab[] = ['connection', 'delivery', 'commands']");
    expect(source).toContain('id="telegram-admin-panel-connection"');
    expect(source).toContain('id="telegram-admin-panel-delivery"');
    expect(source).toContain('id="telegram-admin-panel-commands"');
    expect(source).toContain("disabled={disabled || adminTab !== 'delivery'}");
    expect(source).toContain("disabled={disabled || adminTab !== 'commands'}");
    expect(source).toContain("hidden={adminTab !== 'connection'}");
    expect(source).toContain('void save()');
    expect(source).toContain("const tabLabels = $derived($locale === 'ru'");
  });
});
