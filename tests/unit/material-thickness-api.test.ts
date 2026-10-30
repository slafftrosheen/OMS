import { describe, it, expect } from 'vitest';
import { GET } from '../../src/routes/api/material-thickness-options/+server';

function request(materialType: string, result: { data?: unknown; error?: unknown }) {
  const filters: Array<[string, string]> = [];
  let signal: AbortSignal | undefined;
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    ilike(column: string, value: string) { filters.push([column, value]); return this; },
    abortSignal(value: AbortSignal) { signal = value; return this; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); }
  };
  return {
    filters,
    get signal() { return signal; },
    run: () => GET({
      url: new URL(`https://oms.test/api/material-thickness-options?materialType=${encodeURIComponent(materialType)}`),
      locals: { supabase: { from: () => query } }
    } as any)
  };
}

describe('material thickness API', () => {
  it('uses composite-panel options rather than aluminum-sheet thicknesses', async () => {
    for (const category of ['ALU_COMPOSITE', 'ALUCOBOND', 'DIBOND']) {
      const pending = request(category, { data: [] });
      const response = await pending.run();
      expect(response.status).toBe(200);
      expect(pending.filters).toEqual([['material_type', 'DIBOND']]);
    }
  });

  it('does not disguise a failed database lookup as an empty successful catalog', async () => {
    const pending = request('PVC_FOAM', { error: { code: '57014', message: 'statement timeout' } });
    const response = await pending.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Thickness options are temporarily unavailable' });
  });

  it('attaches a cancellation signal to the request-scoped database query', async () => {
    const pending = request('ACRYLIC_GS', { data: [{ thickness: 3, unit: 'mm' }] });
    const response = await pending.run();
    expect(pending.signal instanceof AbortSignal).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ thickness: 3, unit: 'mm' }]);
  });
});
