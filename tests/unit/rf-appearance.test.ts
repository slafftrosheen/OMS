import { describe, expect, it } from 'vitest';
import { appearanceThemeColor, isDarkAppearance, resolvePlace } from '../../src/lib/state/place';
import { stationIcon } from '../../src/lib/ui/station-icon';

describe('OMS appearance', () => {
  it('uses Paper in the office and Night Shift on the production floor', () => {
    expect(resolvePlace('/orders/123', '')).toBe('office');
    expect(resolvePlace('/production', '')).toBe('floor');
    expect(resolvePlace('/kanban', '')).toBe('floor');
    expect(resolvePlace('/production/planner', '')).toBe('office');
    expect(appearanceThemeColor('ByPlace', 'office')).toBe('#F3F2EF');
    expect(appearanceThemeColor('ByPlace', 'floor')).toBe('#121316');
  });

  it('preserves manual themes and honours wall display overrides', () => {
    expect(resolvePlace('/orders', '?place=floor')).toBe('floor');
    expect(resolvePlace('/station/CNC', '?place=office')).toBe('office');
    expect(resolvePlace('/station/CNC', '?place=invalid')).toBe('floor');
    expect(isDarkAppearance('LightVim', 'floor')).toBe(false);
    expect(appearanceThemeColor('DarkVim', 'office')).toBe('#121316');
    expect(appearanceThemeColor('HighContrastVim', 'office')).toBe('#000000');
  });

  it('shares station glyphs across current and older station codes', () => {
    expect(stationIcon(' edge ')).toBe('station-edge');
    expect(stationIcon('PACKAGING')).toBe('station-packaging');
    expect(stationIcon('DELIVERY')).toBe('station-delivery');
    expect(stationIcon('WELDING')).toBe('weld');
    expect(stationIcon('unknown')).toBe('factory');
  });
});
