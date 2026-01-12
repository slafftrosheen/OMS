export type ColorSpec = {
  system: 'RAL' | 'Pantone' | 'HEX' | 'Other';
  code: string;
  hex?: string;
  name?: string;
};

const RAL: Record<string, string> = {
  'RAL 9016': '#F6F7F1',
  'RAL 9005': '#0A0A0A',
  'RAL 3020': '#CC1928',
  'RAL 5005': '#004389',
  'RAL 1023': '#F7B500'
};

export function resolveHex(color: ColorSpec): string {
  if (color.system === 'HEX' && /^#?[0-9a-f]{6}$/i.test(color.code)) {
    return color.code.startsWith('#') ? color.code : `#${color.code}`;
  }
  if (color.system === 'RAL' && RAL[color.code]) {
    return RAL[color.code];
  }
  return color.hex || '#888888';
}

export function isKnownRal(code: string): boolean {
  return Boolean(RAL[code]);
}
