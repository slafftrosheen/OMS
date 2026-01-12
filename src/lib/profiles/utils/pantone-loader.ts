// src/lib/profiles/utils/pantone-loader.ts

/**
 * PANTONE Color Loader Utility
 *
 * For production use, install: npm install pantone-colors
 * This ensures legally compliant and accurate PANTONE colors.
 */

interface PantoneColor {
  code: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  cmyk?: [number, number, number, number];
}

/**
 * Load PANTONE colors from official library (when installed)
 */
export async function loadPantoneColors(): Promise<PantoneColor[]> {
  try {
    // Dynamically import pantone-colors package if available
    const pantone = await import('pantone-colors');

    // Convert to our format
    return Object.entries(pantone.default).map(([code, color]: [string, any]) => ({
      code,
      name: `PANTONE ${code} C`,
      hex: color.hex,
      rgb: color.rgb,
      cmyk: color.cmyk
    }));
  } catch (error) {
    console.warn('pantone-colors package not installed, falling back to local data');
    // Fall back to local JSON file
    const localColors = await import('../data/pantone-solid-coated.json');
    return localColors.default;
  }
}

/**
 * Search PANTONE colors by code
 */
export async function findPantoneColor(code: string): Promise<PantoneColor | null> {
  const colors = await loadPantoneColors();
  return colors.find(c => c.code === code) || null;
}

/**
 * Get PANTONE color categories for UI organization
 */
export function getPantoneCategories() {
  return [
    { id: 'base', name: 'Base Colors', range: ['Yellow', 'Orange', 'Red', 'Purple', 'Violet', 'Blue', 'Green', 'Black'] },
    { id: 'yellows', name: 'Yellows', range: ['100-199'] },
    { id: 'oranges', name: 'Oranges', range: ['150-199'] },
    { id: 'reds', name: 'Reds', range: ['185-220'] },
    { id: 'pinks', name: 'Pinks', range: ['200-220'] },
    { id: 'purples', name: 'Purples', range: ['250-290'] },
    { id: 'blues', name: 'Blues', range: ['280-320'] },
    { id: 'greens', name: 'Greens', range: ['320-390'] },
    { id: 'grays', name: 'Grays', range: ['Cool Gray', 'Warm Gray', '420-432'] }
  ];
}
