// src/lib/profiles/constants.ts

export const MATERIAL_TYPES = {
  ACRYLIC: 'Acrylic',
  PVC: 'PVC',
  ALUMINUM: 'Aluminum',
  DIBOND: 'Dibond',
  WOOD: 'Wood',
  METAL: 'Metal',
  FILM: 'Film'
} as const;

export const STANDARD_THICKNESSES = [1, 2, 3, 4, 5, 8, 10, 12, 15, 18, 19, 20, 24, 30];

export const PROFILE_CODES = {
  P1: 'P1',
  P4: 'P4',
  P6: 'P6',
  P7ST: 'P7st',
  BOX: 'BOX',
  FLAT: 'FLAT',
  LIGHTBOX: 'LIGHTBOX'
} as const;

export const COLOR_SYSTEMS = {
  RAL: 'RAL',
  PANTONE: 'PANTONE',
  ORACAL: 'ORACAL',
  HEX: 'HEX'
} as const;

export const UNITS = {
  MM: 'mm',
  CM: 'cm',
  M: 'm'
} as const;
