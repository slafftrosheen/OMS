import { describe, expect, it } from 'vitest';
import { nextProfileStationElementId, readProfileStationElements } from '../../src/lib/profiles/station-elements';
import { readFaceMaterials, assignLegacyPrintMaterial } from '../../src/lib/profiles/face-materials';
import { summarizeNativeProfileConfiguration } from '../../src/lib/order/native-profile-context';
import { profileNoteGroups } from '../../src/lib/order/profile-attention';
import { generateProfilePDF } from '../../src/lib/profiles/utils/generateProfilePDF';

const configuration = {
  CNC_FREZER: { face: 'Legacy mirror', faceMaterials: [
    { id: 'face-1', name: 'Small letters', value: 'CAST_ACRYLIC_WHITE', thickness: '3mm' },
  ] },
  BENDER: { elements: [{ id: 'element-1', name: 'Deep returns', values: { sides: 'ALUMINIUM_RETURN', depth: 180 } }] },
  FRONT: { face: true, faceFilm: 'MAIN_FILM', elementName: 'Main letters', elements: [
    { id: 'element-1', name: 'Blue letters', values: { face: true, faceFilm: 'ORACAL_BLUE', facePrint: true, notes: 'PRINT_WHITE_BASE' } },
    { id: 'element-2', name: 'Printed accent', values: { face: false, faceFilm: 'STALE_FILM', facePrint: true, sides: true, sidesFilm: 'PRINTED_RED' } },
  ] },
  PAINTING: { elements: [{ id: 'element-1', name: 'Accent paint', values: { face: true, faceColor: { system: 'RAL', code: '3024' } } }] },
  ASSEMBLING: { elements: [{ id: 'element-1', name: 'Remote supply', values: { psu: true, psuModel: 'XLG_100', psuType: 'dimmable' } }] },
};

describe('named production station elements', () => {
  it('preserves saved values and repairs duplicate local ids without mutating legacy data', () => {
    const saved = { face: true, faceFilm: 'MAIN_FILM', elements: [
      { id: 'element-2', name: 'A', values: { faceFilm: 'BLUE' } },
      null,
      { id: 'element-2', name: 'B', values: { faceFilm: 'RED' } },
      { id: 'invalid', name: 'Invalid', values: [] },
    ] };
    const before = JSON.stringify(saved), elements = readProfileStationElements(saved);
    expect(elements.map(element => [element.id, element.name, element.values.faceFilm]))
      .toEqual([['element-2', 'A', 'BLUE'], ['element-2-copy', 'B', 'RED']]);
    expect(nextProfileStationElementId(elements)).toBe('element-3');
    expect(JSON.stringify(saved)).toBe(before);
    expect(readProfileStationElements({ face: true, faceFilm: 'MAIN_FILM' })).toEqual([]);
  });

  it('preserves a FACE name when assigning the earlier 3D material to that slot', () => {
    const section = { faceMaterials: [{ id: 'x', value: '', name: 'Blue letters' }], print3d: true, print3dMaterial: 'PA12' };
    expect(readFaceMaterials(assignLegacyPrintMaterial(section, 'face'))[0])
      .toMatchObject({ id: 'x', value: 'PA12', name: 'Blue letters', process: '3D_PRINT' });
  });

  it('includes named elements in production summaries with their own settings and notes', () => {
    const summary = summarizeNativeProfileConfiguration(JSON.parse(JSON.stringify(configuration)));
    expect(summary.sections.FRONT).toMatchObject({ faceFilm: 'MAIN_FILM', elementName: 'Main letters' });
    expect(summary.sections.CNC_FREZER).toMatchObject({ face: 'CAST_ACRYLIC_WHITE', faceName: 'Small letters' });
    expect(summary.elements?.FRONT?.[0]).toEqual({
      name: 'Blue letters', fields: { face: true, faceFilm: 'ORACAL_BLUE', facePrint: true, notes: 'PRINT_WHITE_BASE' },
    });
    expect(summary.elements?.FRONT?.[1]?.fields).toMatchObject({ sidesFilm: 'PRINTED_RED' });
    expect(summary.elements?.FRONT?.[1]?.fields).not.toHaveProperty('faceFilm');
    expect(summary.elements?.PAINTING?.[0]?.fields).toMatchObject({ faceColorsystem: 'RAL', faceColorcode: '3024' });
    expect(summary.elements?.ASSEMBLING?.[0]?.fields).toMatchObject({ psuModel: 'XLG_100', psuType: 'dimmable' });
    expect(profileNoteGroups({ configuration })).toEqual(['FRONT']);
  });

  it('prints the FACE name and the additional station assignments with their names', async () => {
    const pdf = await generateProfilePDF({ poNumber: 'TEST-2', profileCode: '7st', profileName: 'Letter sets', quantity: 1, configuration });
    const text = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
    for (const printed of ['Small letters', 'Deep returns', 'ALUMINIUM_RETURN', 'Blue letters',
      'ORACAL_BLUE', 'PRINT_WHITE_BASE', 'PRINTED_RED', 'Accent paint', '3024', 'Remote supply', 'XLG_100']) {
      expect(text).toContain(printed);
    }
    expect(text).not.toContain('STALE_FILM');
    expect(text).not.toContain('[object Object]');
  });
});
