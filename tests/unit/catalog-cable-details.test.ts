import { describe, expect, it } from 'vitest';
import en from '../../src/locales/en.json';
import ru from '../../src/locales/ru.json';
import lv from '../../src/locales/lv.json';
import { projectCatalogEvidence } from '../../src/lib/materials/catalog-evidence';
import { mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';
import { getMaterialSpecificationFacts, type MaterialSpecificationSource } from '../../src/lib/materials/catalog-presentation';
import { getMaterialSelectionSummary } from '../../src/lib/materials/selection-summary';

const metadata = {
  brand: 'LAPP', series: 'ÖLFLEX', cable_type: 'H07RN-F', cable_application: 'mains',
  rated_voltage: '750 V', voltage: '750 V',
  outer_diameter_range_mm: [11.2, 12.8], diameter: '11.2–12.8 mm',
  wire_cross_section_mm2: 1.5, cores: 5, length_m: 100, packSize: '100 m reel',
  model: 'H07RN-F-5G1.5', source_url: 'https://www.lemona.lv/example.html',
  verified_at: '2026-10-31', custom_location: 'Workshop'
};
const source = (record: Record<string, unknown> = metadata) => ({ category: 'WIRE', code: 'H07RN-F-5G1.5', metadata: record });
const values = (row: MaterialSpecificationSource) => Object.fromEntries(
  getMaterialSpecificationFacts(row).map(fact => [fact.key, fact.value])
);

describe('recorded mains cable facts across inventory, assistant and form summaries', () => {
  it('keeps cable rating, outer diameter and conductor area as separate full catalog facts', () => {
    expect(values(source())).toEqual({
      series: 'ÖLFLEX', ratedVoltage: '750 V', crossSection: '1.5 mm²', cores: '5',
      outerDiameter: '11.2–12.8 mm', cableType: 'H07RN-F', cableApplication: 'mains', package: '100 m reel'
    });
    expect(getMaterialSelectionSummary(source(), { length: '3 m' })?.text)
      .toBe('Ø 11.2–12.8 mm · 750 V · 3 m');
  });

  it('retains a separately recorded supply voltage and never promotes the rating to operating voltage', () => {
    expect(values(source({ rated_voltage: '300/500 V', voltage_v: 230 })))
      .toEqual({ voltage: '230 V', ratedVoltage: '300/500 V' });
    expect(values(source({ rated_voltage: '24 V', voltage_v: 24 })))
      .toEqual({ voltage: '24 V', ratedVoltage: '24 V' });
    expect(values(source({ rated_voltage_v: 750 }))).toEqual({ ratedVoltage: '750 V' });
  });

  it('accepts only finite positive outer dimensions and ordered ranges without inventing conversions', () => {
    expect(values(source({ outer_diameter_mm: 8.4, outer_diameter_range_mm: [8, 9], diameter: 'Old field' })))
      .toEqual({ outerDiameter: '8.4 mm' });
    expect(values(source({ outer_diameter_mm: 0, outer_diameter_range_mm: [12, 8], rated_voltage_v: -750 })))
      .toEqual({});
    expect(values(source({ outer_diameter_range_mm: [8.4, 8.4] }))).toEqual({ outerDiameter: '8.4 mm' });
    expect(values(source({ outer_diameter_mm: Infinity, diameter_mm: 1.75 }))).toEqual({ diameter: '1.75 mm' });
  });

  it('projects only the declared cable facts for assistant comparisons and keeps them bounded', () => {
    const projected = projectCatalogEvidence(source({ ...metadata,
      private_connection: { secret: 'must not leak' }, cable_type: 'x'.repeat(500),
      outer_diameter_mm: Infinity, rated_voltage_v: 0
    })).specifications;
    expect(projected.series).toBe('ÖLFLEX');
    expect(projected.rated_voltage).toBe('750 V');
    expect(projected.outer_diameter_range_mm).toEqual([11.2, 12.8]);
    expect(projected.cable_application).toBe('mains');
    expect(String(projected.cable_type).length).toBe(180);
    expect(projected.outer_diameter_mm).toBeUndefined();
    expect(projected.rated_voltage_v).toBeUndefined();
    expect(projected.custom_location).toBeUndefined();
    expect(projected.private_connection).toBeUndefined();
    for (const range of [[0, 8], [9, 8], [8, Infinity], [8, 9, 10], ['8', 9]]) {
      expect(projectCatalogEvidence(source({ outer_diameter_range_mm: range })).specifications.outer_diameter_range_mm)
        .toBeUndefined();
    }
  });

  it('preserves untouched imported specifications when an unrelated admin field changes', () => {
    const original = structuredClone(metadata);
    const edited = mergeCatalogMetadata(metadata, { voltage: ' 750 V ', diameter: ' 11.2–12.8 mm ', brand: 'Edited brand' });
    expect(edited.rated_voltage).toBe('750 V');
    expect(edited.outer_diameter_range_mm).toEqual([11.2, 12.8]);
    expect(edited.cable_type).toBe('H07RN-F');
    expect(edited.cable_application).toBe('mains');
    expect(edited.series).toBe('ÖLFLEX');
    expect(edited.custom_location).toBe('Workshop');
    expect(metadata).toEqual(original);
  });

  it('invalidates old outer dimensions only after the editable diameter changes or clears', () => {
    for (const diameter of ['9 mm', undefined]) {
      const edited = mergeCatalogMetadata({ ...metadata, diameter_mm: 11.2, outer_diameter_mm: 11.2 }, { diameter });
      expect(edited.outer_diameter_mm).toBeUndefined();
      expect(edited.outer_diameter_range_mm).toBeUndefined();
      expect(edited.diameter_mm).toBeUndefined();
      expect(edited.rated_voltage).toBe('750 V');
      expect(edited.wire_cross_section_mm2).toBe(1.5);
      expect(edited.cores).toBe(5);
      expect(values(source(edited)).outerDiameter).toBeUndefined();
      expect(values(source(edited)).diameter).toBe(diameter);
      expect(projectCatalogEvidence(source(edited)).specifications.outer_diameter_range_mm).toBeUndefined();
    }
  });

  it('invalidates conflicting voltage ratings only when the editable voltage changes or clears', () => {
    for (const voltage of ['300/500 V', undefined]) {
      const edited = mergeCatalogMetadata({ ...metadata, voltage_v: 750, rated_voltage_v: 750 }, { voltage });
      expect(edited.voltage_v).toBeUndefined();
      expect(edited.rated_voltage).toBeUndefined();
      expect(edited.rated_voltage_v).toBeUndefined();
      expect(edited.outer_diameter_range_mm).toEqual([11.2, 12.8]);
      expect(values(source(edited)).ratedVoltage).toBeUndefined();
      expect(values(source(edited)).voltage).toBe(voltage);
      expect(projectCatalogEvidence(source(edited)).specifications.rated_voltage).toBeUndefined();
    }
  });

  it('provides EN/RU/LV labels for every new inventory and dropdown fact', () => {
    for (const dictionary of [en, ru, lv]) {
      for (const key of ['series', 'ratedVoltage', 'outerDiameter', 'cableType', 'cableApplication'] as const) {
        expect(typeof dictionary.materialSpecifications[key]).toBe('string');
        expect(dictionary.materialSpecifications[key].length > 0).toBe(true);
      }
    }
  });
});
