/** Fields in the admin form are only a view onto the complete catalog metadata. */
const structuredSpecKeys: Record<string, string[]> = {
  voltage: ['voltage_v'],
  wattage: ['power_w', 'watts_per_m'],
  colorTemp: ['color_temperature_k'],
  ledCount: ['leds_per_m'],
  length: ['length_m'],
  ipRating: ['ip_rating'],
  diameter: ['diameter_mm'],
  weight: ['weight_kg']
};

export function mergeCatalogMetadata(
  existing: Record<string, unknown> | null | undefined,
  editedFields: Record<string, unknown>
): Record<string, unknown> {
  const textValue = (value: unknown): string | undefined => typeof value === 'string'
    ? value.trim() || undefined
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
  const merged = { ...(existing ?? {}) };
  for (const [key, rawValue] of Object.entries(editedFields)) {
    const value = textValue(rawValue);
    const original = textValue(existing?.[key]);
    if (original !== value) {
      // A changed free-text specification must not leave an obsolete numeric value
      // for the assistant to quote. Preserve numeric specs for untouched fields.
      for (const structuredKey of structuredSpecKeys[key] ?? []) delete merged[structuredKey];
    }
    if (value === undefined) delete merged[key];
    else merged[key] = value;
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
