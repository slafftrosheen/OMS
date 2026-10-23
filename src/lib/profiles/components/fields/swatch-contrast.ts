/** Choose the higher-contrast text color for an opaque sRGB hex swatch. */
export function swatchTextColor(hex: string): '#000000' | '#FFFFFF' {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex);
  if (!match) return '#000000';
  const value = match[1].length === 3
    ? [...match[1]].map(character => character.repeat(2)).join('')
    : match[1];
  const linear = (offset: number) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(0) + 0.7152 * linear(2) + 0.0722 * linear(4);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
}
