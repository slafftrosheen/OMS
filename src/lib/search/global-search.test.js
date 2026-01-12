import { describe, it, expect } from 'vitest';
import { searchOrders } from './global-search.js';

describe('searchOrders', () => {
  it('ranks results', () => {
    const data = [
      {
        id: 'PO-1',
        title: 'Frame',
        client: 'ABTB',
        fields: [],
        materials: [],
        badges: [],
        progress: {},
        defaultBranch: 'main',
        branches: [],
        prs: [],
        revisions: [],
        defaultRevisionId: ''
      },
      {
        id: 'PO-2',
        title: 'Pylon Letters',
        client: 'KIA',
        fields: [],
        materials: [],
        badges: [],
        progress: {},
        defaultBranch: 'main',
        branches: [],
        prs: [],
        revisions: [],
        defaultRevisionId: ''
      }
    ];

    const res = searchOrders('pylon kia', data);
    expect(res[0].id).toBe('PO-2');
  });

  it('deduplicates matched tokens', () => {
    const data = [
      {
        id: 'PO-5',
        title: 'Custom Frame',
        client: 'Acme',
        fields: [{ key: 'note', label: 'Note', value: 'Frame frame frame' }],
        materials: [],
        badges: [],
        progress: {},
        defaultBranch: 'main',
        branches: [],
        prs: [],
        revisions: [],
        defaultRevisionId: ''
      }
    ];

    const [hit] = searchOrders('frame', data);
    expect(hit.where).toEqual(['frame']);
  });

  it('finds matches across fields and materials', () => {
    const data = [
      {
        id: 'PO-9',
        title: 'Channel Letters',
        client: 'Tesla',
        fields: [
          { key: 'site', label: 'Site', value: 'Berlin' },
          { key: 'install_date', label: 'Install', value: '2025-11-20' }
        ],
        materials: [
          { key: 'face', label: 'Face', value: 'Acrylic' },
          { key: 'returns', label: 'Returns', value: 'Aluminum' }
        ],
        badges: [],
        progress: {},
        defaultBranch: 'main',
        branches: [],
        prs: [],
        revisions: [],
        defaultRevisionId: ''
      }
    ];

    const hits = searchOrders('berlin aluminum', data);
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('PO-9');
    expect(hits[0].where).toEqual(['berlin', 'aluminum']);
  });
});
