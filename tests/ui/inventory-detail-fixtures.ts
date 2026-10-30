import type { User } from '../../src/lib/auth/types';

export const detailFixtureIds = {
  first: '11111111-1111-4111-8111-111111111111',
  second: '22222222-2222-4222-8222-222222222222'
};

export const detailFixtureUsers: { first: User; second: User } = {
  first: { id: 'detail-account-one', username: 'fixture-manager', displayName: 'Fixture manager', role: 'RD', stations: [] },
  second: { id: 'detail-account-two', username: 'fixture-operator', displayName: 'Fixture operator', role: 'Operator', stations: [] }
};

// Deliberate API DTOs, including camelCase fields, exercise the real adapter.
// None of these test-only product records are supplier catalog input.
export const detailFixtureItems = {
  first: {
    id: detailFixtureIds.first,
    sku: 'TEST-LED-REEL', code: 'TEST_LED_COB_24',
    name: 'TEST ONLY LED LINE COB 24V 3000K',
    category: 'LED_STRIP', section: 'electronics', group: 'LED strips',
    unit: 'roll', stock: 6, min: 2, location: 'Shelf A1', supplier: 'LEMONA',
    updatedAt: '2026-10-30T09:00:00.000Z',
    metadata: {
      brand: 'LED LINE', model: 'TEST-COB-24', short_name: 'LED LINE TEST-COB-24',
      voltage_v: 24, watts_per_m: 10, led_type: 'COB', leds_per_m: 320,
      color_temperature_k: 3000, ip_rating: 'IP20', length_m: 5, packSize: '5 m reel',
      source_url: 'https://www.lemona.lv/test-only-led-fixture.html',
      manufacturer_source_url: 'https://example.com/test-only-led-fixture.pdf',
      verified_at: '2026-10-30', data_notes: 'TEST ONLY reference: package length is not stock quantity.',
      private_supplier_cost: 'TEST-PRIVATE-COST', api_key: 'TEST-SECRET-MUST-NOT-LEAVE'
    }
  },
  second: {
    id: detailFixtureIds.second,
    sku: 'TEST-PSU-24', code: 'TEST_MW_HLG_120',
    name: 'TEST ONLY Mean Well HLG-120H-24A',
    category: 'PSU_MEANWELL', section: 'electronics', group: 'Power supplies',
    unit: 'PCS', stock: 3, min: 1, location: 'Shelf B2', supplier: 'LEMONA',
    updatedAt: '2026-10-30T10:00:00.000Z',
    metadata: {
      brand: 'Mean Well', model: 'HLG-120H-24A', voltage_v: 24, power_w: 120,
      current_a: 5, ip_rating: 'IP65',
      source_url: 'https://www.lemona.lv/test-only-psu-fixture.html', verified_at: '2026-10-30'
    }
  },
  otherAccount: {
    id: detailFixtureIds.first,
    sku: 'ACCOUNT-B-CONNECTOR', code: 'TEST_WAGO_221_413',
    name: 'Account B private WAGO connector',
    category: 'LED_ACCESSORY', section: 'electronics', group: 'Connectors',
    unit: 'PCS', stock: 17, min: 4, location: 'Account B shelf', supplier: 'LEMONA',
    updatedAt: '2026-10-30T11:00:00.000Z',
    metadata: {
      brand: 'WAGO', model: '221-413', connections: 3, wire_cross_section_range_mm2: [0.14, 4],
      source_url: 'https://www.lemona.lv/test-only-account-b-fixture.html', verified_at: '2026-10-30'
    }
  }
};
