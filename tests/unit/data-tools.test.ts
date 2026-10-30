import { describe, expect, it } from 'vitest';
import { getLowStock, getPendingOrders, searchMaterialCatalog } from '../../src/lib/server/ai/tools-registry/data-tools';

function lookupFixture(rows: any[], error: unknown = null) {
  const seen: Record<string, any> = { ordering: [] };
  const query: any = {
    select(value: string) { seen.select = value; return query; },
    in(column: string, values: unknown[]) { seen.filter = { column, values }; return query; },
    or(value: string) { seen.or = value; return query; },
    eq(column: string, value: unknown) { seen.equals = { column, value }; return query; },
    order(column: string, options: unknown) { seen.ordering.push({ column, options }); return query; },
    limit(value: number) { seen.limit = value; return query; },
    abortSignal(signal: AbortSignal) { seen.signal = signal; return query; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error }).then(resolve); }
  };
  const db: any = { from(table: string) { seen.table = table; return query; } };
  return { db, seen };
}

/** Parse only outer OR separators; quoted data must never create a clause. */
function flatOrClauses(expression: string): string[] {
  let quoted = false;
  let escaped = false;
  let start = 0;
  const clauses: string[] = [];
  for (let index = 0; index < expression.length; index++) {
    const char = expression[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ',') { clauses.push(expression.slice(start, index)); start = index + 1; }
    if (!quoted && (char === '(' || char === ')')) throw new Error('Unexpected logical group');
  }
  if (quoted || escaped) throw new Error('Unclosed quoted filter');
  clauses.push(expression.slice(start));
  return clauses;
}

describe('literal catalog code lookup', () => {
  it('keeps an underscore-containing product code intact in an exact equality clause', async () => {
    const { db, seen } = lookupFixture([]);
    await searchMaterialCatalog(db, { query: 'PLEX_GS_0F00' });
    const clauses = flatOrClauses(seen.or);
    expect(clauses[0]).toBe('code.eq."PLEX_GS_0F00"');
    expect(JSON.parse(clauses[0].slice('code.eq.'.length))).toBe('PLEX_GS_0F00');
    expect(clauses.length).toBe(5);
    expect(seen.limit).toBe(20);
  });

  it('keeps quotes, backslashes and attempted OR syntax inside the exact code value', async () => {
    const { db, seen } = lookupFixture([]);
    const input = 'A_"\\),or(id.gt.0,code.eq."*%';
    await searchMaterialCatalog(db, { query: input });
    const clauses = flatOrClauses(seen.or);
    expect(clauses.length).toBe(5);
    expect(JSON.parse(clauses[0].slice('code.eq.'.length))).toBe(input);
    expect(clauses.slice(1).map(clause => clause.split('.ilike.')[0]))
      .toEqual(['code', 'name_en', 'name_ru', 'name_lv']);
  });

  it('does not turn wildcard-only input into a match-all text search', async () => {
    const { db, seen } = lookupFixture([]);
    await searchMaterialCatalog(db, { query: '%_*' });
    expect(flatOrClauses(seen.or)).toEqual(['code.eq."%_*"']);
  });
});

describe('bounded pending-order tool results', () => {
  it('uses a sentinel row and marks a limited queue as incomplete', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({ id: `order-${index}`, status: 'CONFIRMED' }));
    const { db, seen } = lookupFixture(rows);
    const signal = new AbortController().signal;
    const result = await getPendingOrders(db, signal);
    expect(seen.table).toBe('draft_orders');
    expect(seen.limit).toBe(26);
    expect(seen.signal).toBe(signal);
    expect(result.orders).toEqual(rows.slice(0, 25));
    expect(result.limit).toBe(25);
    expect(result.inspectedCount).toBe(26);
    expect(result.returnedCount).toBe(25);
    expect(result.mayBeIncomplete).toBe(true);
    expect(result.statusFilter).toEqual(seen.filter.values);
  });

  it('can identify a complete bounded result without inventing a wider total', async () => {
    const rows = [{ id: 'one', status: 'DRAFT' }, { id: 'two', status: 'IN_PRODUCTION' }];
    const { db } = lookupFixture(rows);
    const result = await getPendingOrders(db);
    expect(result.orders).toEqual(rows);
    expect(result.inspectedCount).toBe(2);
    expect(result.mayBeIncomplete).toBe(false);
    expect('totalCount' in result).toBe(false);
  });
});

describe('bounded low-stock tool results', () => {
  it('does not imply no shortages when the scan cap is reached with no matches', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: index, stock: 10, min_stock: 2 }));
    const { db, seen } = lookupFixture(rows);
    const result = await getLowStock(db);
    expect(seen.table).toBe('materials');
    expect(seen.limit).toBe(500);
    expect(result.materials).toEqual([]);
    expect(result.inspectedCount).toBe(500);
    expect(result.matchingInspectedCount).toBe(0);
    expect(result.scanMayBeIncomplete).toBe(true);
    expect(result.resultsTruncated).toBe(false);
    expect(result.mayBeIncomplete).toBe(true);
  });

  it('reports the separate result cap and retains the existing zero/zero threshold rule', async () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({ id: index, stock: 0, min_stock: 0 }));
    const { db } = lookupFixture(rows);
    const result = await getLowStock(db);
    expect(result.materials.length).toBe(100);
    expect(result.limit).toBe(100);
    expect(result.inspectedCount).toBe(125);
    expect(result.matchingInspectedCount).toBe(125);
    expect(result.returnedCount).toBe(100);
    expect(result.scanMayBeIncomplete).toBe(false);
    expect(result.resultsTruncated).toBe(true);
    expect(result.mayBeIncomplete).toBe(true);
    expect(result.materials[0].deficit).toBe(0);
    expect(result.thresholdRule.includes('zero stock with a zero minimum')).toBe(true);
  });

  it('counts unclassifiable records without turning null or empty balances into zero stock', async () => {
    const { db } = lookupFixture([
      { id: 'low', stock: '2', min_stock: '5' },
      { id: 'healthy', stock: 10, min_stock: 3 },
      { id: 'null-stock', stock: null, min_stock: 4 },
      { id: 'blank-minimum', stock: 0, min_stock: '' },
      { id: 'invalid', stock: 'not a number', min_stock: 1 }
    ]);
    const result = await getLowStock(db);
    expect(result.materials.map(item => item.id)).toEqual(['low']);
    expect(result.materials[0].deficit).toBe(3);
    expect(result.unclassifiedCount).toBe(3);
    expect(result.inspectedCount).toBe(5);
    expect(result.scanMayBeIncomplete).toBe(false);
    expect(result.resultsTruncated).toBe(false);
    expect(result.mayBeIncomplete).toBe(true);
  });

  it('marks a fully inspected and untruncated small result as complete', async () => {
    const { db } = lookupFixture([{ id: 'at-minimum', stock: 2, min_stock: 2 }]);
    const result = await getLowStock(db);
    expect(result.materials.length).toBe(1);
    expect(result.unclassifiedCount).toBe(0);
    expect(result.mayBeIncomplete).toBe(false);
  });

  it('does not turn a failed lookup into an apparently complete empty result', async () => {
    for (const read of [getLowStock, getPendingOrders]) {
      const { db } = lookupFixture([], { message: 'Access denied' });
      let rejected = false;
      try { await read(db); } catch { rejected = true; }
      expect(rejected).toBe(true);
    }
  });
});
