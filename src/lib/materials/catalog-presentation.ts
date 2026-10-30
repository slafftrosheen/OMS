import { hasPackageLengthContext } from './catalog-metadata';

/** Presentation of recorded catalog facts, never specifications inferred from a name or SKU. */
export interface MaterialSpecificationSource {
  category?: string | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const MATERIAL_SPECIFICATION_LABELS = {
  voltage: 'Voltage',
  power: 'Power',
  powerPerMetre: 'Power per metre',
  maxPowerPerMetre: 'Maximum power per metre',
  current: 'Current',
  ledType: 'LED type',
  ledDensity: 'LED density',
  colorTemperature: 'Color temperature',
  whiteColorTemperature: 'White channel temperature',
  ipRating: 'IP rating',
  crossSection: 'Conductor cross-section',
  cores: 'Cores',
  connections: 'Connections',
  material: 'Material',
  diameter: 'Diameter',
  bodyLength: 'Body length',
  package: 'Package contents',
  unit: 'Stock unit'
} as const;

export type MaterialSpecificationKey = keyof typeof MATERIAL_SPECIFICATION_LABELS;
export interface MaterialSpecificationFact {
  key: MaterialSpecificationKey;
  value: string;
}

const text = (value: unknown, max = 120): string => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const quantity = (value: unknown, unit: string): string => positive(value) ? `${value} ${unit}` : '';
const count = (value: unknown): string => positive(value) && Number.isInteger(value) ? String(value) : '';
const range = (value: unknown, unit: string): string => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(positive) || value[0] > value[1]) return '';
  return value[0] === value[1] ? `${value[0]} ${unit}` : `${value[0]}–${value[1]} ${unit}`;
};

/**
 * Pure, bounded facts for picker summaries and inventory detail views.
 * Missing/invalid values are omitted. Package contents and the existing stock
 * unit remain separate; neither is converted into stock, usable length or price.
 * Color catalogs keep their established swatch/thickness presentation.
 */
export function getMaterialSpecificationFacts(
  source: MaterialSpecificationSource | null | undefined
): MaterialSpecificationFact[] {
  if (!source || /^(ACRYLIC|VINYL|ORACAL|PAINT|RAL|PANTONE)(_|$)/i.test(source.category || '')) return [];
  const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? source.metadata : {};
  const facts: MaterialSpecificationFact[] = [];
  const add = (key: MaterialSpecificationKey, value: string) => { if (value) facts.push({ key, value }); };

  add('voltage', quantity(metadata.voltage_v, 'V') || text(metadata.voltage));
  add('power', quantity(metadata.power_w, 'W'));
  add('powerPerMetre', quantity(metadata.watts_per_m, 'W/m'));
  add('maxPowerPerMetre', quantity(metadata.max_watts_per_m, 'W/m'));
  if (!positive(metadata.power_w) && !positive(metadata.watts_per_m) && !positive(metadata.max_watts_per_m)) {
    add('power', text(metadata.wattage));
  }
  add('current', quantity(metadata.current_a, 'A'));
  add('ledType', text(metadata.led_type));
  add('ledDensity', positive(metadata.leds_per_m) && Number.isInteger(metadata.leds_per_m)
    ? `${metadata.leds_per_m} LEDs/m` : text(metadata.ledCount));
  const colorTemperature = range(metadata.color_temperature_range_k, 'K') || quantity(metadata.color_temperature_k, 'K');
  const whiteColorTemperature = range(metadata.white_channel_temperature_range_k, 'K')
    || quantity(metadata.white_channel_temperature_k, 'K');
  add('colorTemperature', colorTemperature || (!whiteColorTemperature ? text(metadata.colorTemp) : ''));
  add('whiteColorTemperature', whiteColorTemperature);
  add('ipRating', text(metadata.ip_rating) || text(metadata.ipRating));

  add('crossSection', quantity(metadata.wire_cross_section_mm2, 'mm²')
    || range(metadata.wire_cross_section_range_mm2, 'mm²')
    || (positive(metadata.wire_cross_section_max_mm2) ? `≤ ${metadata.wire_cross_section_max_mm2} mm²` : ''));
  add('cores', count(metadata.cores));
  add('connections', count(metadata.connections));
  add('material', text(metadata.material));
  add('diameter', quantity(metadata.diameter_mm, 'mm') || text(metadata.diameter));
  add('bodyLength', quantity(metadata.body_length_mm, 'mm'));

  // Keep recorded spool/refill/bottle context. Add known contents when a label
  // such as "1 spool" omits them; an explicit measurement in the label takes
  // precedence. These patterns only avoid repetition, never infer a quantity.
  const packageLabel = text(metadata.packSize);
  const packageLength = quantity(metadata.length_m, 'm');
  const packageWeight = quantity(metadata.weight_kg, 'kg');
  const packageVolume = quantity(metadata.volume_ml, 'ml');
  // Admin edits deliberately invalidate numeric specs. Preserve their explicit
  // replacement text without parsing units or treating product body length as
  // package content. Unknown quantities stay absent after a field is cleared.
  const editedLength = !packageLength && !positive(metadata.body_length_mm)
    && (hasPackageLengthContext(metadata) || /^(?:LED_STRIP|LED_NEON|WIRE|CABLE)$/.test(source.category || ''))
    ? text(metadata.length) : '';
  const editedWeight = !packageWeight && !packageVolume ? text(metadata.weight) : '';
  const packageContents = [
    packageLabel,
    /\d\s*(?:mm|cm|m)\b/i.test(packageLabel) ? '' : packageLength,
    /\d\s*(?:kg|g)\b/i.test(packageLabel) ? '' : packageWeight,
    /\d\s*(?:ml|l)\b/i.test(packageLabel) ? '' : packageVolume,
    editedLength && editedLength !== packageLabel ? editedLength : '',
    editedWeight && editedWeight !== packageLabel ? editedWeight : ''
  ].filter(Boolean).join(' · ');
  add('package', packageContents);
  add('unit', text(source.unit, 32));
  return facts;
}
