import { PROFILE_STATIONS, readProfileStationElements } from '$lib/profiles/station-elements';

export const PRODUCTION_NOTE_SECTIONS = PROFILE_STATIONS;
export type ProfileNoteGroup = 'profile' | typeof PRODUCTION_NOTE_SECTIONS[number];
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const annotationParts: Partial<Record<typeof PRODUCTION_NOTE_SECTIONS[number], readonly string[]>> = {
  FRONT: ['face', 'back', 'sides'], PAINTING: ['face', 'sides', 'back', 'frame'], ASSEMBLING: ['led', 'frame']
};

/** One index entry per visible note group, not another copy of its instructions.
 * Mirrors Profile7stVisual's stationAnnotations/hasStationNotes visibility:
 * free station notes always count; custom annotations require an enabled part.
 */
export function profileNoteGroups(value: unknown): ProfileNoteGroup[] {
  const profile = record(value);
  if (!profile) return [];
  const groups: ProfileNoteGroup[] = hasText(profile.notes) ? ['profile'] : [];
  const configuration = record(profile.configuration);
  if (!configuration) return groups;
  for (const name of PRODUCTION_NOTE_SECTIONS) {
    const section = record(configuration[name]);
    if (!section) continue;
    const elements = [section, ...readProfileStationElements(section).map(element => element.values)];
    if (elements.some(values => hasText(values.notes) ||
      (annotationParts[name] ?? []).some(part => values[part] && hasText(values[`${part}Custom`])))) {
      groups.push(name);
    }
  }
  return groups;
}
