import { describe, it, expect } from 'vitest';

// Contract under test: the profile payload the UI sends (camelCase, single quantity)
// must be mapped to what the live `replace_order_profiles` RPC expects
// (p_order_id uuid, p_profiles jsonb items with profile_template_id, quantity1..4,
//  configuration, notes, order_index) AND to the order_profiles junction columns
// (draft_order_id, not order_id).

// Mirror of the mapper to be implemented in src/routes/api/draft-orders/[id]/+server.ts
export function mapProfileForRpc(p: Record<string, unknown>, index: number) {
  const cfg = (p.configuration && typeof p.configuration === 'object') ? p.configuration : {};
  const q = typeof p.quantity === 'number' && p.quantity > 0 ? Math.floor(p.quantity) : 1;
  return {
    profile_template_id: (p.profileTemplateId ?? p.profile_template_id ?? null) as string | null,
    quantity1: q,
    quantity2: (p.quantity2 as number | undefined) ?? 0,
    quantity3: (p.quantity3 as number | undefined) ?? 0,
    quantity4: (p.quantity4 as number | undefined) ?? 0,
    configuration: cfg,
    notes: (p.notes as string | undefined) ?? '',
    order_index: index,
  };
}

describe('replace_order_profiles payload mapping', () => {
  it('maps UI profile to the RPC jsonb item shape', () => {
    const out = mapProfileForRpc(
      { profileTemplateId: '11111111-1111-1111-1111-111111111111', quantity: 3, configuration: { a: 1 } },
      2,
    );
    expect(out).toEqual({
      profile_template_id: '11111111-1111-1111-1111-111111111111',
      quantity1: 3,
      quantity2: 0,
      quantity3: 0,
      quantity4: 0,
      configuration: { a: 1 },
      notes: '',
      order_index: 2,
    });
  });

  it('defaults quantity to 1 and accepts snake_case input', () => {
    const out = mapProfileForRpc({ profile_template_id: null, quantity: 0 }, 0);
    expect(out.quantity1).toBe(1);
    expect(out.profile_template_id).toBeNull();
  });

  it('keeps configuration as an object even when the UI sends junk', () => {
    const out = mapProfileForRpc({ configuration: 'oops' }, 0);
    expect(out.configuration).toEqual({});
  });

  it('order_index follows array position (RPC falls back to it)', () => {
    const rows = [{}, {}, {}].map((p, i) => mapProfileForRpc(p, i));
    expect(rows.map(r => r.order_index)).toEqual([0, 1, 2]);
  });
});