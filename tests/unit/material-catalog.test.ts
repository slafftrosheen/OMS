import { describe, expect, it } from 'vitest';
import ru from '../../src/locales/ru.json';
import lv from '../../src/locales/lv.json';
import {
  buildMaterialCatalogUrl,
  createMaterialCatalogLoader,
  getMaterialCatalogView,
  type CatalogMaterial
} from '../../src/lib/profiles/material-catalog';

const materials: CatalogMaterial[] = [
  { id: 1, category: 'ACRYLIC_GS', code: 'PLEX_GS_0F00', name_en: 'PLEXIGLAS GS Clear', name_ru: 'Прозрачное оргстекло', thickness_options: [3, 5, 10], metadata: { brand: 'Röhm' } },
  { id: 2, category: 'ACRYLIC_GS', code: 'PLEX_GS_WHITE', name_en: 'PLEXIGLAS GS White', thickness_options: [3, 5], metadata: {} },
  { id: 3, category: 'PVC_FOAM', code: 'PVC_5', name_en: 'White foam PVC', thickness_options: [5], metadata: {} }
];

describe('material category browsing', () => {
  it('starts with category counts and no expanded materials', () => {
    const view = getMaterialCatalogView(materials, '', '');
    expect(view.categories).toEqual([
      { category: 'ACRYLIC_GS', count: 2 },
      { category: 'PVC_FOAM', count: 1 }
    ]);
    expect(view.groups).toEqual([]);
  });

  it('opens only the chosen category and returns to categories without losing data', () => {
    const view = getMaterialCatalogView(materials, 'PVC_FOAM', '');
    expect(view.groups).toEqual([{ category: 'PVC_FOAM', materials: [materials[2]] }]);
    expect(getMaterialCatalogView(materials, '', '').categories.length).toBe(2);
  });

  it('searches all allowed materials across categories, codes, brands and translated names', () => {
    expect(getMaterialCatalogView(materials, 'PVC_FOAM', '  plex  ').groups[0].materials.length).toBe(2);
    expect(getMaterialCatalogView(materials, '', 'röhm').groups[0].materials[0].id).toBe(1);
    expect(getMaterialCatalogView(materials, '', 'Прозрачное').groups[0].materials[0].id).toBe(1);
    expect(getMaterialCatalogView(materials, '', 'pvc_5').groups[0].materials[0].id).toBe(3);
    expect(getMaterialCatalogView(materials, '', 'missing').groups).toEqual([]);
  });

  it('uses stable encoded requests and gives an explicit category precedence', () => {
    expect(buildMaterialCatalogUrl('/oms', '', ['PVC_FOAM', 'ACRYLIC_GS', 'PVC_FOAM'])).toBe('/oms/api/materials?categories=ACRYLIC_GS%2CPVC_FOAM');
    expect(buildMaterialCatalogUrl('/oms', 'ACRYLIC_GS', ['PVC_FOAM'])).toBe('/oms/api/materials?category=ACRYLIC_GS');
  });

  it('finds materials by the exact Russian category label shown in the picker', () => {
    expect(getMaterialCatalogView(materials, '', 'Литой акрил (GS)', ru.materialPicker.categoryNames).groups)
      .toEqual([{ category: 'ACRYLIC_GS', materials: materials.slice(0, 2) }]);
  });

  it('finds materials by the exact Latvian category label shown in the picker', () => {
    expect(getMaterialCatalogView(materials, '', 'Putu PVC', lv.materialPicker.categoryNames).groups)
      .toEqual([{ category: 'PVC_FOAM', materials: [materials[2]] }]);
  });
});

describe('material catalog request lifecycle', () => {
  it('shares one in-flight request and uses the resulting cache for repeated fields', async () => {
    let requests = 0;
    let finish!: (response: Response) => void;
    const loader = createMaterialCatalogLoader(async () => {
      requests++;
      return new Promise<Response>((resolve) => { finish = resolve; });
    });
    const first = loader.load('/api/materials');
    const second = loader.load('/api/materials');
    finish(Response.json(materials));
    expect(await first).toEqual(materials);
    expect(await second).toEqual(materials);
    expect(await loader.load('/api/materials')).toEqual(materials);
    expect(requests).toBe(1);
  });

  it('reports failed responses and allows a successful explicit retry', async () => {
    let requests = 0;
    const loader = createMaterialCatalogLoader(async () => ++requests === 1
      ? Response.json({ error: 'Unavailable' }, { status: 503 })
      : Response.json(materials));
    let error = '';
    try { await loader.load('/api/materials'); } catch (cause) { error = String(cause); }
    expect(error.includes('503')).toBe(true);
    expect(await loader.load('/api/materials', true)).toEqual(materials);
    expect(requests).toBe(2);
  });

  it('rejects malformed successful responses rather than caching a broken catalog', async () => {
    const loader = createMaterialCatalogLoader(async () => Response.json({ items: 'invalid' }));
    let failed = false;
    try { await loader.load('/api/materials'); } catch { failed = true; }
    expect(failed).toBe(true);
  });

  it('settles a stalled request and can recover even when a fetch implementation ignores abort', async () => {
    let signal: AbortSignal | null | undefined;
    let requests = 0;
    const loader = createMaterialCatalogLoader(async (_url, options) => {
      signal = options?.signal;
      requests++;
      if (requests === 1) return new Promise<Response>(() => {});
      return Response.json(materials);
    }, { timeoutMs: 5 });
    let failed = false;
    try { await loader.load('/api/materials'); } catch { failed = true; }
    expect(failed).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(await loader.load('/api/materials', true)).toEqual(materials);
  });
});
