import { describe, expect, it } from 'vitest';
import {
  MATERIAL_SELECTION_COLORS,
  materialColorVariables,
  materialSelectionTone,
  materialSwatch
} from '../../src/lib/materials/selection-colors';
import { getTextColor } from '../../src/lib/profiles/helpers';

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((left, right) => left - right);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

describe('material selection colors', () => {
  it('keeps every light and dark role palette above normal-text contrast', () => {
    for (const palette of Object.values(MATERIAL_SELECTION_COLORS)) {
      for (const [background, text] of [palette.light, palette.dark]) {
        expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses the configured role for assembly parts and unresolved saved selections', () => {
    expect(materialSelectionTone('', '', 'led')).toBe('led');
    expect(materialSelectionTone('', '', 'psu')).toBe('psu');
    expect(materialSelectionTone('', 'mainCable')).toBe('cable');
    expect(materialSelectionTone('ALU_SHEET', 'frame')).toBe('frame');
    expect(materialSelectionTone('ACRYLIC_GS', 'back')).toBe('back');
    expect(materialSelectionTone('FDM')).toBe('print3d');
    expect(materialSelectionTone('LED_ACCESSORY')).toBe('connector');
    expect(materialSelectionTone('VINYL_ORACAL')).toBe('film');
    expect(materialSelectionTone('PAINT_PANTONE')).toBe('paint');
    expect(materialSelectionTone('')).toBe('material');
  });

  it('uses a real swatch only for an opaque hex value, retaining safe role colors otherwise', () => {
    expect(materialSwatch(' #abc ')).toBe('#AABBCC');
    expect(materialSwatch('#12aF09')).toBe('#12AF09');
    for (const invalid of ['', null, 123, 'red', 'transparent', '#0000', '#ffffff00', 'var(--text)', '#fff;background:red']) {
      expect(materialSwatch(invalid)).toBeUndefined();
      expect(materialColorVariables('frame', invalid).includes('--material-swatch:')).toBe(false);
    }
    expect(materialColorVariables('paint', '#000')).toContain('--material-swatch:#000000;--material-swatch-ink:#FFFFFF;');
    expect(materialColorVariables('paint', '#fff')).toContain('--material-swatch:#FFFFFF;--material-swatch-ink:#000000;');
  });

  it('keeps actual swatch text readable, including midtones the old brightness shortcut misclassified', () => {
    for (const hex of ['#808000', '#FF0000', '#00A0FF', '#FF6B00', '#777777', '#E60000', '#003087']) {
      expect(contrast(hex, getTextColor(hex))).toBeGreaterThanOrEqual(4.5);
    }
    expect(getTextColor('#FF0000')).toBe('#000000');
    expect(getTextColor('#003087')).toBe('#FFFFFF');
  });

  it('keeps at least 4.5:1 across a representative RGB swatch grid', () => {
    for (let red = 0; red <= 255; red += 17) {
      for (let green = 0; green <= 255; green += 17) {
        for (let blue = 0; blue <= 255; blue += 17) {
          const hex = '#' + [red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('');
          expect(contrast(hex, getTextColor(hex))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
