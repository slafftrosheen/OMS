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

const number = '\\d+(?:[.,]\\d+)?';
const sizeNotation = `(?:[dø⌀]\\s*${number}(?:\\s*[x×]\\s*${number})?|${number}\\s*[x×]\\s*${number}(?:\\s*[x×]\\s*${number})?)(?:\\s*mm)?`;
const trailingSize = new RegExp(`(?:^|\\s)(${sizeNotation})\\s*$`, 'i');
const rectangularSize = new RegExp(`^(${number})\\s*[x×]\\s*(${number})(?:\\s*[x×]\\s*(${number}))?(?:\\s*mm)?$`, 'i');
const circularSize = new RegExp(`^[dø⌀]\\s*(${number})(?:\\s*[x×]\\s*(${number}))?(?:\\s*mm)?$`, 'i');

function frameSize(value: string) {
  const numeric = (part: string) => Number(part.replace(',', '.'));
  const rect = rectangularSize.exec(value.trim());
  if (rect) return {
    section: `rect:${numeric(rect[1])}:${numeric(rect[2])}`,
    wall: normalizeThicknessValue(rect[3] || '')
  };
  const circle = circularSize.exec(value.trim());
  return circle ? {
    section: `round:${numeric(circle[1])}`,
    wall: normalizeThicknessValue(circle[2] || '')
  } : null;
}

/** Presentation only: collapse matching geometry, preserve conflicts/custom text. */
export function frameBadgeLabel(materialLabel: string, dimensions?: string, thickness?: string): string {
  let label = materialLabel;
  const size = dimensions?.trim() || '';
  const suffix = trailingSize.exec(materialLabel);
  const namedSize = suffix ? frameSize(suffix[1]) : null;
  const selectedSize = frameSize(size);
  let displayedWall = namedSize?.wall || '';

  if (size) {
    if (suffix && namedSize && selectedSize && namedSize.section === selectedSize.section &&
        (!namedSize.wall || !selectedSize.wall || namedSize.wall === selectedSize.wall)) {
      // Prefer the complete geometry; e.g. "tube 40x40" + "40x40x2".
      if (!namedSize.wall || selectedSize.wall) {
        label = `${materialLabel.slice(0, suffix.index).trimEnd()} ${size}`.trim();
        displayedWall = selectedSize.wall;
      }
    } else {
      label = `${label} · ${size}`;
      displayedWall = selectedSize?.wall || '';
    }
  }
  const wall = normalizeThicknessValue(thickness);
  if (wall && wall !== displayedWall) label += ` · ${wall}`;
  return label;
}
