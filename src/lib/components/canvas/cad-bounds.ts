import { Box, type Editor, type TLShape } from '@tldraw/tldraw';

import { curveBounds, mapContours } from './cad-curves';

const normalize = (angle: number) => ((angle % 360) + 360) % 360;

/** Physical extents must not depend on the editor's sampled hit-test vertices. */
export function getCadShapePageBounds(editor: Editor, shape: TLShape): Box | undefined {
  const p = shape.props as Record<string, any>;
  const matrix = editor.getShapePageTransform(shape);
  if (shape.type === 'cad-bezier') { const b = curveBounds(mapContours(p.contours, point => matrix.applyToPoint(point))); return new Box(b.x, b.y, b.w, b.h); }
  if (shape.type === 'cad-path') return Box.FromPoints(p.points.map((point: { x: number; y: number }) => matrix.applyToPoint(point)));
  if (shape.type === 'cad-ellipse' || shape.type === 'geo' && p.geo === 'ellipse') {
    const { w, h } = editor.getShapeGeometry(shape).bounds;
    const center = matrix.applyToPoint({ x: w / 2, y: h / 2 });
    const angle = matrix.rotation(), c = Math.cos(angle), s = Math.sin(angle);
    const dx = Math.hypot(w / 2 * c, h / 2 * s), dy = Math.hypot(w / 2 * s, h / 2 * c);
    return new Box(center.x - dx, center.y - dy, dx * 2, dy * 2);
  }
  if (shape.type === 'cad-arc') {
    const center = matrix.point(), start = p.startAngle - matrix.rotation() * 180 / Math.PI;
    const sweep = p.endAngle - p.startAngle;
    const angles = [start, start + sweep, ...[0, 90, 180, 270].filter(a => normalize(a - start) <= sweep)];
    return Box.FromPoints(angles.map(a => ({ x: center.x + p.radius * Math.cos(a * Math.PI / 180), y: center.y - p.radius * Math.sin(a * Math.PI / 180) })));
  }
  return editor.getShapePageBounds(shape);
}

export function getCadSelectionPageBounds(editor: Editor): Box | undefined {
  const bounds: Box[] = [];
  for (const id of editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])) {
    const shape = editor.getShape(id);
    if (!shape || shape.type === 'group') continue;
    const box = getCadShapePageBounds(editor, shape);
    if (box) bounds.push(box);
  }
  return bounds.length ? Box.Common(bounds) : undefined;
}
