import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Fabriek UI · draft order form lock.
 *
 * The draft order form (Create draft → Form, and the same sheet on an order) must stay
 * exactly as it was: same sections, fields, order and controls. The Fabriek skin may only
 * restyle it from CSS. The only markup it is allowed to add is a `data-station` hook on
 * each section, which the stylesheet uses for the station colour.
 *
 * If one of these hashes changes, someone changed the form's structure. That has to be a
 * deliberate product decision, not a side effect of the skin.
 */
const LOCKED: Record<string, string> = {
  'src/lib/profiles/components/Profile7stVisual.svelte': '706ccc2de2fe1953486f0c277170665a644098065c6db2c2f85b37b4d7a4baa2',
  'src/lib/order/OrderProfileSheet.svelte': '2a23515638eceb6fcbef982b14989254d14f80196b79edbc24f233d9615def92',
  'src/lib/order/OrderNativeProfileForm.svelte': '93f274c23c8c645bceb6131a62588c16bdca2b21e2472d96cf4240e59cdb3531',
  'src/routes/orders/new/+page.svelte': 'e77051ec405f2b78ffac063d683b148c5b5ed2c35c05ff16a135718b7c5c5478',
};

/** Markup only: drop the script, the component styles and the skin's data-station hooks. */
function markup(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/<script[\s\S]*?<\/script>/, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/ data-station="[A-Z]+"/g, '');
}

describe('draft order form is unchanged by the Fabriek skin', () => {
  for (const [file, hash] of Object.entries(LOCKED)) {
    it(`${file} keeps its original markup`, () => {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(createHash('sha256').update(markup(src)).digest('hex')).toBe(hash);
    });
  }
});
