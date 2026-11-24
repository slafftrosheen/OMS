import type { Editor } from '@tldraw/tldraw';
import { findCadSnap, type CadSnapResult } from './cad-snap';
import { validCadPoint, type CadPoint } from './cad-settings';
import { drawingGuideLine, projectToDrawingGuide, type DrawingGuideGeometry } from './drawing-guides';

/** The grabbed part of the line is the snap reference. An angled guide's pivot
 * may be far from the pointer; snapping that pivot would make the line jump. */
export function snapDrawingGuideToObjects(
  editor: Editor, geometry: DrawingGuideGeometry, pointer: CadPoint, enabled: boolean,
): { geometry: DrawingGuideGeometry; snap: CadSnapResult } | null {
  if (!enabled || !validCadPoint(pointer)) return null;
  const query = projectToDrawingGuide(geometry, pointer);
  const snap = findCadSnap(editor, query, null, null, {
    enabled,
    settings: { guidelines: false, page: false, grid: false },
  });
  if (!snap) return null;
  if (geometry.axis !== 'angle') {
    return { geometry: { axis: geometry.axis, position: snap.point[geometry.axis] }, snap };
  }
  const { point, normal } = drawingGuideLine(geometry);
  const offset = (snap.point.x - point.x) * normal.x + (snap.point.y - point.y) * normal.y;
  const pivot = { x: point.x + offset * normal.x, y: point.y + offset * normal.y };
  return validCadPoint(pivot) ? { geometry: { ...geometry, pivot }, snap } : null;
}
