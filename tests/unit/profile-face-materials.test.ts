import { describe, it, expect } from 'vitest';
import { summarizeNativeProfileConfiguration } from '../../src/lib/order/native-profile-context';
import { orderFields, canonicalOrderProfiles } from '../../src/lib/server/order/draft-contract';
import { readFaceMaterials, withFaceMaterials, applyProfileMaterialSelection, nextFaceMaterialId } from '../../src/lib/profiles/face-materials';
import { generateProfilePDF } from '../../src/lib/profiles/utils/generateProfilePDF';

describe('native profile multiple FACE materials', () => {
  it('includes every selected FACE material with its own thickness in production and AI summaries', () => {
    const summary = summarizeNativeProfileConfiguration({
      CNC_FREZER: {
        face: 'PLEXIGLAS GS 0F00', faceThickness: '3mm',
        faceMaterials: [
          { id: 'a', value: 'PLEXIGLAS GS 0F00', thickness: '3mm', hex: '#ffffff' },
          { id: 'b', value: 'ALU_COMPOSITE_WHITE', thickness: '4mm', secret: 'omit me' },
          { id: 'c', value: '', thickness: '8mm' }
        ]
      }
    });
    expect(summary.sections.CNC_FREZER?.faceMaterial1).toBe('PLEXIGLAS GS 0F00');
    expect(summary.sections.CNC_FREZER?.faceMaterial1Thickness).toBe('3mm');
    expect(summary.sections.CNC_FREZER?.faceMaterial2).toBe('ALU_COMPOSITE_WHITE');
    expect(summary.sections.CNC_FREZER?.faceMaterial2Thickness).toBe('4mm');
    expect(summary.sections.CNC_FREZER).not.toHaveProperty('faceMaterial3');
    expect(JSON.stringify(summary)).not.toContain('omit me');
    expect(JSON.stringify(summary)).not.toContain('#ffffff');
  });

  it('ignores a stale scalar FACE when an explicit material list is empty', () => {
    const summary = summarizeNativeProfileConfiguration({
      CNC_FREZER: { face: 'Old acrylic', faceThickness: '12', faceMaterials: [] }
    });
    expect(summary.sections.CNC_FREZER).toBeUndefined();
  });

  it('keeps legacy single FACE summaries compatible', () => {
    expect(summarizeNativeProfileConfiguration({
      CNC_FREZER: { face: 'ACRYLIC_XT', faceThickness: '3' }
    }).sections.CNC_FREZER).toEqual({ face: 'ACRYLIC_XT', faceThickness: '3' });
  });

  it('round-trips material rows and unrelated profile data through the actual order save contract', () => {
    const configuration = {
      CNC_FREZER: {
        face: 'Clear acrylic', faceThickness: '3', laser: true,
        faceMaterials: [
          { id: 'a', value: 'Clear acrylic', thickness: '3', category: 'ACRYLIC_GS', thicknessOptions: [3, 5] },
          { id: 'b', value: 'Custom inset', thickness: '2.5mm', hex: '#cc5500' }
        ],
        back: 'Aluminium', backThickness: '2mm'
      },
      BENDER: { sides: 'Aluminium', depth: 100 },
      historicOption: { preserve: true }
    };
    const payload = orderFields.parse({ profiles: [{ quantity: 2, configuration }] });
    const saved = canonicalOrderProfiles(payload.profiles);
    const reloaded = JSON.parse(JSON.stringify(saved[0].configuration));
    expect(reloaded).toEqual(configuration);
    expect(saved[0].quantity1).toBe(2);
  });

  it('hydrates a legacy selection without changing its original values or source object', () => {
    const source = { face: 'Custom legacy face', faceThickness: '3', faceHex: '#d9d9d9', notes: 'Keep this' };
    const before = JSON.stringify(source);
    const rows = readFaceMaterials(source);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('Custom legacy face');
    expect(rows[0].thickness).toBe('3');
    expect(rows[0].thicknessOptions).toBeUndefined();
    rows[0].value = 'An edited copy';
    expect(JSON.stringify(source)).toBe(before);
  });

  it('allocates stable local row IDs without a secure browser context or collisions', () => {
    expect(nextFaceMaterialId([
      { id: 'legacy-face', value: 'Old face' },
      { id: 'face-material-3', value: 'Another face' }
    ])).toBe('face-material-4');
  });

  it('promotes the remaining row after removal and clears legacy mirrors when all rows are removed', () => {
    const rows = [
      { id: 'a', value: 'Acrylic', thickness: '3mm', category: 'ACRYLIC_GS' },
      { id: 'b', value: 'Composite', thickness: '4mm', category: 'ALU_COMPOSITE' }
    ];
    const source = { face: 'Acrylic', faceThickness: '3mm', back: 'Aluminium', laser: true };
    const saved = withFaceMaterials(source, rows.filter(row => row.id !== 'a'));
    expect(saved.face).toBe('Composite');
    expect(saved.faceThickness).toBe('4mm');
    expect(saved.back).toBe('Aluminium');
    expect(saved.laser).toBe(true);
    const cleared = withFaceMaterials(saved, []);
    expect(cleared.face).toBe('');
    expect(cleared.faceThickness).toBe('');
    expect(readFaceMaterials(cleared)).toEqual([]);
    expect(source.face).toBe('Acrylic');
  });

  it('keeps each row thickness independent and compares legacy millimetre formats correctly', () => {
    const selection = {
      value: 'Clear acrylic', hex: '#ffffff', shortName: '0F00',
      material: { category: 'ACRYLIC_GS', thickness_options: [5, 3, 5] }
    };
    const first = { id: 'a', value: 'Old acrylic', thickness: '5mm' };
    const second = { id: 'b', value: 'Other acrylic', thickness: '3' };
    expect(applyProfileMaterialSelection(first, selection).thickness).toBe('5mm');
    expect(applyProfileMaterialSelection(second, selection).thickness).toBe('3');
    expect(applyProfileMaterialSelection({ ...first, thickness: '12mm' }, selection).thickness).toBe('3mm');
    expect(applyProfileMaterialSelection(first, selection).thicknessOptions).toEqual([3, 5]);
    expect(first.thickness).toBe('5mm');
    expect(second.thickness).toBe('3');
  });

  it('clears catalog metadata on custom selections while preserving a manually entered custom thickness', () => {
    const selection = { value: 'Custom wood', hex: '#996633', material: null };
    const fromCatalog = applyProfileMaterialSelection({
      id: 'a', value: 'Acrylic', thickness: '3mm', category: 'ACRYLIC_GS', thicknessOptions: [3, 5]
    }, selection);
    expect(fromCatalog.category).toBe('');
    expect(fromCatalog.thicknessOptions).toEqual([]);
    expect(fromCatalog.thickness).toBe('');
    expect(applyProfileMaterialSelection({ ...fromCatalog, thickness: '7mm' }, {
      ...selection, value: 'Custom wood veneer'
    }).thickness).toBe('7mm');
  });

  it('exports every FACE material to PDF instead of stringifying or clipping the row array', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `face-${i + 1}`, value: `CUSTOM_FACE_${i + 1}`, thickness: `${i + 1}mm`
    }));
    const pdf = await generateProfilePDF({
      poNumber: 'TEST-1', profileCode: '7st', profileName: 'Multi face test', quantity: 1,
      configuration: { CNC_FREZER: { face: rows[0].value, faceMaterials: rows } }
    });
    const output = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
    for (const row of rows) expect(output).toContain(row.value);
    expect(output).not.toContain('[object Object]');
  });
});
