import type { Editor } from '@tldraw/tldraw';
import { regularPolygon, cornerContour } from './cad-corners';
import { NODE_FILLET_TOLERANCE_MM } from './cad-node-corners';
import { mapContours, nodeAt, type CadContour } from './cad-curves';
import { cadPointToCanvas, unitMm, validateCadSettings, type CadSettings } from './cad-settings';
import { CadOperationError } from './cad-plans';
import { makeNewCadShapePlan } from './drawing-outline-defaults';

export type ParametricShapeKind = 'polygon' | 'star' | 'complex-star';
export interface ParametricShapeOptions {
  kind: ParametricShapeKind; points: number; step: number; innerRatio: number;
  width: number; height: number; centerX: number; centerY: number; rotation: number;
  corner: 'sharp' | 'fillet' | 'chamfer'; cornerSize: number;
}

/** Width/height describe the outer ellipse before rotation/corner finishing.
 * Coordinates and corner size are in document units, angles are CAD Y-up.
 * Complex-star cycles visit every vertex once, including disconnected cycles
 * when point count and skip step have a common divisor (six/2 = two triangles). */
export function parametricShapeContours(options: ParametricShapeOptions, tolerance = NODE_FILLET_TOLERANCE_MM): CadContour[] {
  const { kind, points, step, innerRatio, width, height, centerX, centerY, rotation, corner, cornerSize } = options;
  if (!['polygon', 'star', 'complex-star'].includes(kind) || !Number.isInteger(points) || points < 3 || points > 64 ||
      ![width, height, centerX, centerY, rotation].every(Number.isFinite) || width <= 0 || height <= 0 ||
      Math.abs(rotation) > 360 || !['sharp', 'fillet', 'chamfer'].includes(corner)) throw new CadOperationError('shape-input');
  if (kind === 'star' && (!Number.isFinite(innerRatio) || innerRatio < 0.1 || innerRatio >= 1)) throw new CadOperationError('shape-ratio');
  if (kind === 'complex-star' && (!Number.isInteger(step) || step < 2 || step > Math.floor((points - 1) / 2))) throw new CadOperationError('shape-step');
  if (corner !== 'sharp' && (kind !== 'polygon' || !Number.isFinite(cornerSize) || cornerSize <= 0)) throw new CadOperationError('shape-corner');
  // regularPolygon starts at the top in canvas space. Flip Y once so every
  // option here uses the shared CAD convention before cadPointToCanvas.
  const source = regularPolygon(points, 1, 0, kind === 'star' ? innerRatio : 1);
  const scaled = mapContours([source], p => ({ x: p.x * width, y: -p.y * height }))[0];
  let contours: CadContour[] = [scaled];
  if (kind === 'complex-star') {
    const visited = new Set<number>(); contours = [];
    for (let first = 0; first < points; first++) {
      if (visited.has(first)) continue;
      const nodes = []; let index = first;
      do { visited.add(index); nodes.push(nodeAt(scaled.nodes[index])); index = (index + step) % points; } while (index !== first);
      contours.push({ closed: true, nodes });
    }
  } else if (corner !== 'sharp') contours = [cornerContour(scaled, cornerSize, corner, cornerSize, tolerance)];
  const a = rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return mapContours(contours, p => ({ x: centerX + p.x * c - p.y * s, y: centerY + p.x * s + p.y * c }));
}

export function prepareParametricShape(editor: Editor, settings: CadSettings, options: ParametricShapeOptions) {
  if (!validateCadSettings(settings) || Math.max(options.width, options.height) * unitMm(settings.unit) > 1_000_000)
    throw new CadOperationError('shape-input');
  const contours = mapContours(parametricShapeContours(options, NODE_FILLET_TOLERANCE_MM / unitMm(settings.unit)), p => cadPointToCanvas(p, settings));
  return makeNewCadShapePlan(editor, settings, contours, options.kind === 'polygon' ? 'Polygon' : options.kind === 'star' ? 'Star' : 'Complex star');
}
