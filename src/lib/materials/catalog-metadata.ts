/** Fields in the admin form are only a view onto the complete catalog metadata. */
const structuredSpecKeys: Record<string, string[]> = {
  voltage: ['voltage_v', 'rated_voltage', 'rated_voltage_v'],
  wattage: ['power_w', 'watts_per_m', 'max_watts_per_m'],
  colorTemp: ['color_temperature_k', 'color_temperature_range_k',
    'white_channel_temperature_k', 'white_channel_temperature_range_k'],
  ledCount: ['leds_per_m'],
  length: ['length_m', 'body_length_mm'],
  ipRating: ['ip_rating'],
  diameter: ['diameter_mm', 'outer_diameter_mm', 'outer_diameter_range_mm'],
  weight: ['weight_kg', 'volume_ml'],
  // These describe package content; body length/width/height describe the product itself.
  packSize: ['length_m', 'weight_kg', 'volume_ml'],
  width: ['width_mm'],
  height: ['height_mm']
};

type PackageQuantity = 'length' | 'weight';
const packageQuantityPattern = (kind: PackageQuantity) => new RegExp(
  `(?<![\\p{L}\\p{N}.,])\\d+(?:[.,]\\d+)?\\s*(?:${kind === 'length' ? 'mm|cm|m' : 'kg|g|ml|l'})(?![\\p{L}\\p{N}²³])`,
  'giu'
);

/** The shared length field also describes product bodies; only identified
 * package lengths may be discarded when the package label changes. */
export function hasPackageLengthContext(metadata: Record<string, unknown>): boolean {
  if (typeof metadata.body_length_mm === 'number' && metadata.body_length_mm > 0) return false;
  if (typeof metadata.length_m === 'number' && metadata.length_m > 0) return true;
  return typeof metadata.packSize === 'string' && (packageQuantityPattern('length').test(metadata.packSize)
    || /\b(?:reel|roll|spool)\b/i.test(metadata.packSize));
}

function withoutPackageQuantity(label: string, kind: PackageQuantity): string | undefined {
  // Remove the obsolete measurement, not packaging context such as "refill;
  // spool not included". No replacement quantity or unit conversion is inferred.
  return label.replace(packageQuantityPattern(kind), '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ').replace(/\s+([,;:·])/g, '$1')
    .replace(/^[\s,;:·]+|[\s,;:·]+$/g, '') || undefined;
}

export function mergeCatalogMetadata(
  existing: Record<string, unknown> | null | undefined,
  editedFields: Record<string, unknown>
): Record<string, unknown> {
  const textValue = (value: unknown): string | undefined => typeof value === 'string'
    ? value.trim() || undefined
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
  const merged = { ...(existing ?? {}) };
  const changed = new Set<string>();
  for (const [key, rawValue] of Object.entries(editedFields)) {
    const value = textValue(rawValue);
    const original = textValue(existing?.[key]);
    if (original !== value) {
      changed.add(key);
      // A changed free-text specification must not leave an obsolete numeric value
      // for the assistant to quote. Preserve numeric specs for untouched fields.
      for (const structuredKey of structuredSpecKeys[key] ?? []) delete merged[structuredKey];
    }
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }

  // Reconcile after applying every form field: the admin submits unchanged fields
  // too, so an untouched old value must not restore a quantity invalidated above.
  if (changed.has('packSize')) {
    if (!changed.has('weight')) delete merged.weight;
    if (!changed.has('length') && hasPackageLengthContext(existing ?? {})) delete merged.length;
  } else if (typeof merged.packSize === 'string') {
    let label: string | undefined = merged.packSize;
    if (changed.has('weight')) label = withoutPackageQuantity(label, 'weight');
    if (label && changed.has('length') && hasPackageLengthContext(existing ?? {})) {
      label = withoutPackageQuantity(label, 'length');
    }
    if (label) merged.packSize = label;
    else delete merged.packSize;
  }
  return merged;
}

/** Only the public supplier site is a valid catalog source link in the admin UI. */
export function getLemonaSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['lemona.lv', 'www.lemona.lv'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    return url.href;
  } catch {
    return null;
  }
}
