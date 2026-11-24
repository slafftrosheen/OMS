import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Fabriek UI · draft order form lock.
 *
 * The Fabriek skin must preserve the reviewed draft form's sections, fields,
 * order and controls. It may restyle from CSS and add data-station hooks.
 * Explicit product features can update this baseline after reviewing their
 * markup diff; they are not forbidden by this skin regression check.
 *
 * Reviewed baseline changes:
 * - 5c7ae1bf2b86ad9ff6dfae2c228ec180fe00331c added named station elements,
 *   retaining all five primary station field sets and their order.
 * - 1bf53ab88fb2ffe5d60c3c532e5a5994973ba7e8 made a rejected pocket move
 *   restore the file selector. Relative to the earliest available 35dd971,
 *   this is the new-order page's only markup change. Its previous expected
 *   hash was already stale at 35dd971; do not treat it as a working baseline.
 * The two order sheet components retain their original hashes.
 */
const LOCKED: Record<string, string> = {
  'src/lib/profiles/components/Profile7stVisual.svelte': '4b166a28bb6aeed31b71e14d5d7f1664a19fe0473b03e29cbeeaf8ab2828c9a9',
  'src/lib/order/OrderProfileSheet.svelte': '2a23515638eceb6fcbef982b14989254d14f80196b79edbc24f233d9615def92',
  'src/lib/order/OrderNativeProfileForm.svelte': '93f274c23c8c645bceb6131a62588c16bdca2b21e2472d96cf4240e59cdb3531',
  'src/routes/orders/new/+page.svelte': '6468fa57a071c6f70e6fd4c831f55fc5fa1a67a86ea46609b284e1fcdd8202d0',
};
const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

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
    it(`${file} keeps its reviewed markup`, () => {
      const src = read(file);
      expect(createHash('sha256').update(markup(src)).digest('hex')).toBe(hash);
    });
  }

  it('retains the five primary station field sets and named-element controls in station order', () => {
    const src = read('src/lib/profiles/components/Profile7stVisual.svelte');
    expect([...src.matchAll(/data-station="([A-Z]+)"/g)].map(match => match[1]))
      .toEqual(['CNC', 'EDGE', 'FRONT', 'PAINT', 'ASSEMBLY']);
    expect([...src.matchAll(/\{@render (\w+Fields)\(configuration\.([A-Z_]+), formId\)\}/g)]
      .map(match => [match[1], match[2]])).toEqual([
        ['cncFields', 'CNC_FREZER'], ['benderFields', 'BENDER'], ['filmFields', 'FRONT'],
        ['paintFields', 'PAINTING'], ['assemblyFields', 'ASSEMBLING'],
      ]);
    for (const station of ['CNC_FREZER', 'BENDER', 'FRONT', 'PAINTING', 'ASSEMBLING']) {
      expect(src).toContain(`{#each configuration.${station}.elements ?? [] as element, index (element.id)}`);
      expect(src).toContain(`{@render addElementButton('${station}')}`);
    }
    expect(src).toContain('onclick={() => removeStationElement(station, element.id)}');
    expect(src).toContain('bind:value={element.name} oninput={emit}');
  });

  it('preserves draft form section order, saving guards and rejected pocket selection recovery', () => {
    const src = read('src/routes/orders/new/+page.svelte');
    expect([...src.matchAll(/<section id="new-order-(profiles|files|details|delivery)"/g)].map(match => match[1]))
      .toEqual(['profiles', 'files', 'details', 'delivery']);
    expect(src).toContain('<div id="new-order-form" hidden={canvasMode} inert={saving||!!successMessage} aria-busy={saving}>');
    expect(src).toContain('bind:value={profile.quantity} min="1" max="100"');
    expect(src).toContain('if(!changeFilePocket(fileItem.uploadId,event.currentTarget.value as ProductionFilePocket))event.currentTarget.value=fileItem.pocket;');
    expect(src).toContain('disabled={saving||preparingFiles||!!removingFileId||uploadedFileKeys.has(fileItem.uploadId)}');
  });
});
