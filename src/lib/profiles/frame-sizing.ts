import { normalizeThicknessValue } from '$lib/materials/thickness-options';

// Earlier profiles stored rectangular tube width × height × wall thickness in
// one field. Read that wall without rewriting the saved dimensions on opening.
const rectangularTube = /^(\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*[x×]\s*)(\d+(?:[.,]\d+)?)(\s*(?:mm)?\s*)$/i;
const roundTube = /^(\s*[dø⌀]\s*\d+(?:[.,]\d+)?\s*[x×]\s*)(\d+(?:[.,]\d+)?)(\s*(?:mm)?\s*)$/i;

export function readLegacyFrameThickness(dimensions: string | undefined): string {
  const match = rectangularTube.exec(dimensions || '') || roundTube.exec(dimensions || '');
  return match ? normalizeThicknessValue(match[2]) : '';
}

/** Only explicit thickness edits synchronize an old embedded wall dimension. */
export function withFrameThickness(dimensions: string | undefined, thickness: string | undefined): string {
  const value = dimensions || '';
  const normalized = normalizeThicknessValue(thickness);
  if (!/^\d+(?:\.\d+)?mm$/.test(normalized)) return value;
  const replaceWall = (_match: string, prefix: string, _wall: string, suffix: string) =>
    prefix + normalized.slice(0, -2) + suffix;
  return value.replace(rectangularTube, replaceWall).replace(roundTube, replaceWall);
}
