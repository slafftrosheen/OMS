/** Catalog records are evidence of recorded data, not live supplier verification.
 * Project known scalar facts only; private or arbitrarily nested metadata stays out. */
const textKeys = [
  'brand', 'model', 'manufacturer_part_number', 'short_name', 'supplier', 'supplier_sku',
  'supplier_product_code', 'verified_at', 'ip_rating', 'material', 'conductor', 'color',
  'led_type', 'control_ic', 'source_kind', 'data_notes', 'product_family', 'package_type',
  'mounting', 'voltage', 'wattage', 'colorTemp', 'ledCount', 'length', 'ipRating', 'width',
  'height', 'diameter', 'weight', 'packSize', 'minOrder', 'series', 'rated_voltage',
  'cable_type', 'cable_application'
] as const;
const numberKeys = [
  'voltage_v', 'power_w', 'current_a', 'color_temperature_k', 'watts_per_m', 'leds_per_m',
  'length_m', 'wire_cross_section_mm2', 'diameter_mm', 'weight_kg', 'cores', 'connections',
  'wire_cross_section_max_mm2', 'width_mm', 'height_mm', 'cut_interval_mm', 'beam_angle_deg',
  'beam_angle_horizontal_deg', 'beam_angle_vertical_deg', 'volume_ml', 'body_length_mm',
  'max_watts_per_m', 'white_channel_temperature_k', 'outer_diameter_mm', 'rated_voltage_v'
] as const;
const rangeKeys = [
  'wire_cross_section_range_mm2', 'fine_stranded_conductor_range_mm2',
  'solid_conductor_range_mm2', 'color_temperature_range_k', 'white_channel_temperature_range_k',
  'outer_diameter_range_mm'
] as const;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 180) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1200) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Invalid source metadata is not a usable source. */ }
}

export function projectCatalogEvidence(value: unknown) {
  const row = record(value), metadata = record(row.metadata);
  const specifications: Record<string, string | number | number[]> = {};
  for (const key of textKeys) {
    const entry = text(metadata[key], key === 'data_notes' ? 600 : 180);
    if (entry) specifications[key] = entry;
  }
  for (const key of numberKeys) {
    const entry = metadata[key];
    const positiveOnly = key === 'outer_diameter_mm' || key === 'rated_voltage_v';
    if (typeof entry === 'number' && Number.isFinite(entry) && (positiveOnly ? entry > 0 : entry >= 0)) specifications[key] = entry;
  }
  for (const key of rangeKeys) {
    const entry = metadata[key];
    if (Array.isArray(entry) && entry.length === 2 && entry.every(item =>
      typeof item === 'number' && Number.isFinite(item) && (key === 'outer_diameter_range_mm' ? item > 0 : item >= 0)) && entry[0] <= entry[1]) {
      specifications[key] = [...entry];
    }
  }
  for (const key of ['source_url', 'manufacturer_source_url']) {
    const url = sourceUrl(metadata[key]);
    if (url) specifications[key] = url;
  }
  return {
    code: text(row.code, 100), name: text(row.name_en, 240),
    name_ru: text(row.name_ru, 240), name_lv: text(row.name_lv, 240),
    category: text(row.category, 80), unit: text(row.unit, 24),
    thickness_options: Array.isArray(row.thickness_options)
      ? row.thickness_options.filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0).slice(0, 20)
      : [],
    specifications
  };
}

export const CATALOG_EVIDENCE_NOTE = 'Recorded OMS catalog data, including possible local edits. Source dates describe the imported reference. Missing specifications are unknown. Package length/weight/volume is not stock quantity; W and W/m are different ratings. Compatibility, supplier stock and current supplier prices are not verified.';
