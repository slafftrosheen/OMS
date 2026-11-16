import type { TLShape } from '@tldraw/tldraw';
import { CAD_APPEARANCE_TYPES, cadAppearanceGeometry } from './cad-shape-appearance';
import { paintMetadata, vectorPaint } from './cad-vector';

/** Palette click fills closed CAD; open paths and right-click change the outline. */
export function cadPalettePatch(shape: TLShape, color: string, target: 'fill' | 'stroke') {
  if (!CAD_APPEARANCE_TYPES.has(shape.type)) return undefined;
  try {
    const geometry = cadAppearanceGeometry(shape);
    const paint = vectorPaint(shape.meta, (shape.props as { color?: string }).color);
    if (target === 'fill' && geometry.closed) {
      paint.fill = color;
      delete paint.gradient;
      delete paint.raster;
    } else {
      // Keep latent fill data on open paths so closing the path restores it.
      paint.stroke = color;
    }
    return { id: shape.id, type: shape.type, meta: { ...shape.meta, ...(target === 'fill' && geometry.closed ? { omsMaterialTexture: null } : {}), omsVectorPaint: paintMetadata(paint) } };
  } catch {
    // Legacy schema-valid shapes can have invalid geometry. Keep them editable
    // through their native colour property without corrupting their metadata.
    return undefined;
  }
}
