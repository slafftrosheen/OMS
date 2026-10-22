import { describe, it, expect } from 'vitest';
import {
  createCatalogThicknessOptions,
  fetchThicknessOptions,
  normalizeMaterialType,
  normalizeThicknessValue
} from '../../src/lib/materials/thickness-options';

describe('material thickness choices', () => {
  it('matches saved numeric and unit-suffixed thicknesses without changing stored values', () => {
    for (const value of ['3', '3mm', '3 MM', '3.0', '03']) {
      expect(normalizeThicknessValue(value)).toBe('3mm');
    }
    expect(normalizeThicknessValue('1,5 mm')).toBe('1.5mm');
    expect(normalizeThicknessValue('')).toBe('');
    expect(normalizeThicknessValue('special')).toBe('special');
  });

  it('keeps catalog-specific choices positive, unique and in numeric order', () => {
    const options = createCatalogThicknessOptions([5, 2, 3, 2, 0, -1, NaN, Infinity]);
    expect(options.map(option => option.thickness)).toEqual([2, 3, 5]);
    expect(options.map(option => option.unit)).toEqual(['mm', 'mm', 'mm']);
  });

  it('distinguishes aluminum composite from aluminum sheet names and categories', () => {
    expect(normalizeMaterialType('ALU_COMPOSITE')).toBe('DIBOND');
    expect(normalizeMaterialType('ALUCOBOND black')).toBe('DIBOND');
    expect(normalizeMaterialType('ALU_SHEET')).toBe('ALUMINUM');
    expect(normalizeMaterialType('PLEXIGLAS GS')).toBe('ACRYLIC');
  });
});

describe('material thickness loading', () => {
  it('sends an encoded canonical type and validates/sorts successful choices', async () => {
    let requestedUrl = '';
    const result = await fetchThicknessOptions('ACRYLIC_GS', {
      fetcher: async (url) => {
        requestedUrl = String(url);
        return Response.json([
          { thickness: 5, unit: 'mm', display_name: '5mm Acrylic' },
          { thickness: 3, unit: 'mm', display_name: '3mm Acrylic' },
          { thickness: 3, unit: 'mm', display_name: 'duplicate' },
          { thickness: -1, unit: 'mm' }
        ]);
      }
    });
    expect(requestedUrl).toBe('/api/material-thickness-options?materialType=ACRYLIC');
    expect(result.map(option => option.thickness)).toEqual([3, 5]);
  });

  it('rejects failed HTTP responses so the control can offer retry', async () => {
    await expect(fetchThicknessOptions('PVC', {
      fetcher: async () => Response.json({ error: 'unavailable' }, { status: 503 })
    })).rejects.toThrow('503');
  });

  it('keeps the thickness request under the configured app base path', async () => {
    let requestedUrl = '';
    await fetchThicknessOptions('PVC_FOAM', {
      basePath: '/oms',
      fetcher: async (url) => {
        requestedUrl = String(url);
        return Response.json([]);
      }
    });
    expect(requestedUrl).toBe('/oms/api/material-thickness-options?materialType=PVC');
  });

  it('rejects invalid API payloads instead of treating them as an empty catalog', async () => {
    await expect(fetchThicknessOptions('PVC', {
      fetcher: async () => Response.json({ options: [] })
    })).rejects.toThrow('Invalid thickness options');
  });

  it('aborts a stalled request so Loading cannot remain forever', async () => {
    let didAbort = false;
    await expect(fetchThicknessOptions('PVC', {
      timeoutMs: 5,
      fetcher: (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          didAbort = true;
          reject(init.signal?.reason);
        }, { once: true });
      })
    })).rejects.toThrow('timed out');
    expect(didAbort).toBe(true);
  });

  it('cancels an in-flight request when the selected material changes', async () => {
    const controller = new AbortController();
    let didAbort = false;
    const pending = fetchThicknessOptions('ACRYLIC', {
      signal: controller.signal,
      fetcher: (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          didAbort = true;
          reject(init.signal?.reason);
        }, { once: true });
      })
    });
    controller.abort(new Error('Material changed'));
    await expect(pending).rejects.toThrow('Material changed');
    expect(didAbort).toBe(true);
  });
});
