export const PROFILE_STATIONS = ['CNC_FREZER', 'BENDER', 'FRONT', 'PAINTING', 'ASSEMBLING'] as const;
export type ProfileStation = typeof PROFILE_STATIONS[number];

export const PROFILE_ELEMENT_NAME_LIMIT = 120;
export interface ProfileStationElement<T = Record<string, unknown>> {
  id: string;
  name: string;
  values: T;
}

export interface ProfileStationElements<T> {
  elementName?: string;
  elements?: ProfileStationElement<T>[];
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Legacy station fields are the first element. Additional elements carry
 * the same fields and remain local to their station inside configuration JSON. */
export function readProfileStationElements(section: unknown): ProfileStationElement[] {
  const entries = record(section)?.elements;
  if (!Array.isArray(entries)) return [];
  const used = new Set<string>();
  return entries.flatMap((value, index) => {
    const entry = record(value), values = record(entry?.values);
    if (!entry || !values) return [];
    let id = typeof entry.id === 'string' && entry.id ? entry.id : `element-${index + 1}`;
    while (used.has(id)) id += '-copy';
    used.add(id);
    return [{ ...entry, id, name: typeof entry.name === 'string' ? entry.name : '', values }];
  });
}

export function nextProfileStationElementId(elements: readonly Pick<ProfileStationElement, 'id'>[]): string {
  const ids = new Set(elements.map(element => element.id));
  let number = elements.length + 1;
  while (ids.has(`element-${number}`)) number++;
  return `element-${number}`;
}
