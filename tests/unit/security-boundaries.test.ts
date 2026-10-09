import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const routes: string[] = [
  "src/routes/api/export/+server.ts",
  "src/routes/api/filters/+server.ts",
  "src/routes/api/filters/[id]/+server.ts",
  "src/routes/api/station-logs/+server.ts",
  "src/routes/api/export/templates/+server.ts",
  "src/routes/api/inventory/status/+server.ts",
  "src/routes/api/station-attachments/+server.ts",
  "src/routes/api/order-profile-presets/+server.ts",
  "src/routes/api/loading-days/capacity/+server.ts",
  "src/routes/api/draft-orders/[id]/redo/+server.ts",
  "src/routes/api/station-attachments/[id]/+server.ts",
  "src/routes/api/draft-orders/[id]/badges/+server.ts",
  "src/routes/api/notifications/preferences/+server.ts",
  "src/routes/api/order-profile-presets/[id]/+server.ts",
  "src/routes/api/material-thickness-options/+server.ts"
];
const read = (path: string) => readFileSync(path, 'utf8');

describe('OMS-R00 authorization boundaries', () => {
  it('requires request-scoped clients for user-facing data routes', () => {
    for (const file of routes) {
      const code = read(file);
      expect(code, file).not.toContain("import { supabase } from '$lib/server/supabase'");
      expect(code, file).toContain('const supabase = locals.supabase;');
    }
  });
  it('never uses service_role to initialize the global client', () => {
    expect(read('src/lib/server/supabase.ts')).not.toContain("getEnv('SUPABASE_SERVICE_ROLE_KEY')");
  });
  it('verifies JWT identity instead of blindly trusting session cookies', () => {
    expect(read('src/hooks.server.ts')).toContain('auth.getUser()');
  });
  it('excludes credentials from Docker context', () => {
    expect(read('.dockerignore')).toContain('.env');
  });
});
