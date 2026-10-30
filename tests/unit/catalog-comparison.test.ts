import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { compareMaterialCatalog, searchMaterialCatalog } from '../../src/lib/server/ai/tools-registry/data-tools';
import { projectCatalogEvidence } from '../../src/lib/materials/catalog-evidence';
import { BUILTIN_TOOLS, mayUseTool } from '../../src/lib/server/ai/tools-registry';
import { selectScreenTools } from '../../src/lib/server/ai/screen-assistant';

function database(rows: any[], options: { error?: unknown; onRead?: () => void } = {}) {
  const seen: any = { calls: 0 };
  const query: any = {
    select(columns: string) { seen.columns = columns; return query; },
    or(filter: string) { seen.filter = filter; return query; },
    eq() { return query; }, order() { return query; },
    limit(limit: number) { seen.limit = limit; return query; },
    abortSignal(signal: AbortSignal) { seen.signal = signal; return query; },
    then(resolve: (value: unknown) => unknown) {
      options.onRead?.();
      return Promise.resolve({ data: rows, error: options.error ?? null }).then(resolve);
    }
  };
  const db: any = { from(table: string) { seen.calls++; seen.table = table; return query; } };
  return { db, seen };
}
const material = (code: string, metadata: Record<string, unknown> = {}) => ({
  code, name_en: `Recorded ${code}`, category: 'LED_STRIP', unit: 'roll',
  thickness_options: [], metadata
});

describe('exact catalog comparison', () => {
  it('uses the request database, preserves requested order and reports missing models without substitutions', async () => {
    const { db, seen } = database([material('B', { watts_per_m: 10, length_m: 5 }), material('A', { watts_per_m: 12 })]);
    const signal = new AbortController().signal;
    const result = await compareMaterialCatalog(db, { codes: [' A ', 'B', 'MISSING'] }, signal);
    assert.equal(seen.table, 'materials');
    assert.equal(seen.limit, 4);
    assert.equal(seen.signal, signal);
    assert.deepEqual(result.materials.map(row => row.code), ['A', 'B']);
    assert.deepEqual(result.missingCodes, ['MISSING']);
    assert.equal(result.complete, false);
    assert.equal(result.materials[1].unit, 'roll');
    assert.equal(result.materials[1].specifications.watts_per_m, 10);
    assert.equal(result.materials[1].specifications.length_m, 5);
    assert.equal(result.compatibilityVerified, false);
    assert.equal(result.stockVerified, false);
    assert.equal(result.supplierPriceVerified, false);
    assert.doesNotMatch(seen.columns, /stock|price|cost/);
  });

  it('quotes exact supplier codes and rejects invalid batches before issuing a lookup', async () => {
    const code = 'A_"\\),or(id.gt.0,code.eq."*%';
    const { db, seen } = database([material(code), material('B')]);
    const result = await compareMaterialCatalog(db, { codes: [code, 'B'] });
    assert.equal(seen.filter, `code.eq.${JSON.stringify(code)},code.eq."B"`);
    assert.equal(result.complete, true);
    for (const codes of [[], ['A'], ['A', ' A '], ['A', null], ['A', ' '], ['A', 'x'.repeat(101)], ['A','B','C','D','E']]) {
      const rejected = database([]);
      await assert.rejects(() => compareMaterialCatalog(rejected.db, { codes }));
      assert.equal(rejected.seen.calls, 0);
    }
    await assert.rejects(() => compareMaterialCatalog(db, { codes: ['A','B'], approved: true }));
  });

  it('marks ambiguous records and oversized evidence as incomplete instead of selecting an arbitrary model', async () => {
    const repeated = database([material('A'), material('A'), material('B')]);
    const result = await compareMaterialCatalog(repeated.db, { codes: ['A','B'] });
    assert.deepEqual(result.ambiguousCodes, ['A']);
    assert.deepEqual(result.materials.map(row => row.code), ['B']);
    assert.equal(result.complete, false);
    const fields = ['brand','model','manufacturer_part_number','short_name','supplier','supplier_sku',
      'supplier_product_code','verified_at','ip_rating','material','conductor','color','led_type','control_ic',
      'source_kind','data_notes','product_family','package_type','mounting','voltage','wattage','colorTemp',
      'ledCount','length','ipRating','width','height','diameter','weight','packSize','minOrder'];
    const metadata = Object.fromEntries(fields.map(key => [key, 'x'.repeat(500)]));
    const large = database(['A','B','C','D'].map(code => material(code, metadata)));
    const bounded = await compareMaterialCatalog(large.db, { codes: ['A','B','C','D'] });
    assert.ok(JSON.stringify(bounded).length < 14000);
    assert.ok(bounded.omittedCodes.length > 0);
    assert.equal(bounded.complete, false);
  });

  it('propagates lookup failures and cancellation instead of claiming an empty successful comparison', async () => {
    const failed = database([], { error: { message: 'private database error' } });
    await assert.rejects(() => compareMaterialCatalog(failed.db, { codes: ['A','B'] }), /unavailable or access denied/);
    const cancelled = new AbortController(); cancelled.abort(new Error('cancelled'));
    const before = database([]);
    await assert.rejects(() => compareMaterialCatalog(before.db, { codes: ['A','B'] }, cancelled.signal), /cancelled/);
    assert.equal(before.seen.calls, 0);
    const during = new AbortController();
    const pending = database([], { onRead: () => during.abort(new Error('obsolete')) });
    await assert.rejects(() => compareMaterialCatalog(pending.db, { codes: ['A','B'] }, during.signal), /obsolete/);
  });

  it('budgets escaped exact codes and the full comparison envelope without losing completeness fields', async () => {
    const codes = ['A','B','C','D'].map(code => code + '\u0001'.repeat(99));
    const metadata = Object.fromEntries(['brand','model','manufacturer_part_number','short_name',
      'supplier','supplier_sku','supplier_product_code','verified_at'].map(key => [key, '\u0001'.repeat(180)]));
    const rows = codes.map(code => material(code, metadata));
    const result = await compareMaterialCatalog(database(rows).db, { codes });
    assert.ok(JSON.stringify(result).length <= 14000);
    assert.deepEqual(result.requestedCodes, codes);
    assert.deepEqual(result.missingCodes, []);
    assert.deepEqual(result.ambiguousCodes, []);
    assert.ok(result.omittedCodes.length > 0);
    assert.equal(result.complete, false);
    assert.equal(result.materials.length + result.omittedCodes.length, codes.length);
    assert.ok(result.materials.every((row, index) => row.code === codes[index]));
  });

  it('is a normal read-only catalog tool on relevant screens and remains subject to registry restrictions', () => {
    const tool = BUILTIN_TOOLS.find(item => item.slug === 'catalog.compare')!;
    assert.ok(tool);
    assert.equal(mayUseTool(tool, { role: 'Operator' }), true);
    assert.equal(mayUseTool({ ...tool, enabled: false }, { role: 'Boss' }), false);
    assert.equal(mayUseTool({ ...tool, roles: ['RD'] }, { role: 'Operator' }), false);
    assert.deepEqual(selectScreenTools([tool], '/inventory/catalog'), [tool]);
    assert.deepEqual(selectScreenTools([tool], '/orders/new'), [tool]);
    assert.deepEqual(selectScreenTools([tool], '/settings'), []);
    assert.deepEqual(selectScreenTools([tool], '/calendar'), []);
  });
});

describe('bounded catalog evidence', () => {
  it('preserves explicit numeric ranges and edited display values while dropping unsafe or nested metadata', () => {
    const result = projectCatalogEvidence(material('EXACT', {
      voltage_v: 24, wattage: 'Edited 18 W/m', max_watts_per_m: 18,
      white_channel_temperature_range_k: [2700,6500], body_length_mm: 280,
      source_url: 'https://www.lemona.lv/product.html', manufacturer_source_url: 'javascript:alert(1)',
      color_temperature_range_k: [6500,2700], current_a: Infinity,
      model: { secret: 'never' }, apiKey: 'private', data_notes: 'x'.repeat(1000)
    }));
    assert.equal(result.specifications.voltage_v, 24);
    assert.equal(result.specifications.wattage, 'Edited 18 W/m');
    assert.equal(result.specifications.max_watts_per_m, 18);
    assert.equal(result.specifications.body_length_mm, 280);
    assert.deepEqual(result.specifications.white_channel_temperature_range_k, [2700,6500]);
    assert.equal(result.specifications.manufacturer_source_url, undefined);
    assert.equal(result.specifications.color_temperature_range_k, undefined);
    assert.equal(result.specifications.current_a, undefined);
    assert.equal(result.specifications.model, undefined);
    assert.equal(result.specifications.apiKey, undefined);
    assert.equal(String(result.specifications.data_notes).length, 600);
    assert.doesNotMatch(JSON.stringify(result), /never|private/);
  });

  it('discloses sentinel and payload-budget truncation without breaking structured catalog results', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => material(`CODE-${i}`, { brand: 'LEMLUX' }));
    const { db, seen } = database(rows);
    const result = await searchMaterialCatalog(db, { query: 'LEMLUX' });
    assert.equal(seen.limit, 21);
    assert.equal(result.returnedCount, 20);
    assert.equal(result.inspectedCount, 21);
    assert.equal(result.mayBeIncomplete, true);
    const small = await searchMaterialCatalog(database(rows.slice(0, 2)).db, { query: 'LEMLUX' });
    assert.equal(small.mayBeIncomplete, false);
    assert.equal('totalCount' in small, false);
    const huge = rows.map(row => ({ ...row, metadata: { data_notes: 'x'.repeat(900),
      brand: 'x'.repeat(200), model: 'x'.repeat(200), packSize: 'x'.repeat(200) } }));
    const bounded = await searchMaterialCatalog(database(huge).db, { query: 'LEMLUX' });
    assert.ok(bounded.materials.length < 20);
    assert.ok(JSON.stringify(bounded).length < 14000);
    assert.equal(bounded.mayBeIncomplete, true);
  });
});
