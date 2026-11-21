/**
 * Stock level — Reclame Fabriek OMS · Round 2.1
 * A material is only "low" when someone has actually set a minimum for it.
 * Before this, every item with stock 0 and minimum 0 was flagged as low stock,
 * which painted the whole inventory red and hid the real shortages.
 */
export type StockLevel = 'out' | 'low' | 'ok' | 'untracked';

export function stockLevel(stock: number | null | undefined, min: number | null | undefined): StockLevel {
  const s = Number(stock ?? 0);
  const m = Number(min ?? 0);
  if (!(m > 0)) return 'untracked';     // no minimum set → never an alarm
  if (s <= 0) return 'out';
  if (s <= m) return 'low';
  return 'ok';
}

export const isShort = (stock: number | null | undefined, min: number | null | undefined) => {
  const l = stockLevel(stock, min);
  return l === 'out' || l === 'low';
};
