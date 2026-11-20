import type { Editor, TLShape } from '@tldraw/tldraw';
import { mapContours, type CadContour } from './cad-curves';
import { CadOperationError, type CadPlannedShape } from './cad-plans';
import { convertedCurvePaint } from './cad-editing';
import { paintMetadata } from './cad-vector';
import { validVectorPaint, type VectorPaint } from './cad-paint';

/** The result inherits the reference object's local coordinate system, so its
 * paint matrices and clip paths keep their position when the geometry changes. */
export function sourceCurveResult(
  editor: Editor,
  source: TLShape,
  contours: CadContour[],
  fillRule: 'evenodd' | 'nonzero',
  paint: VectorPaint = convertedCurvePaint(editor, source),
  space: 'page' | 'local' = 'page'
): CadPlannedShape {
  const props = source.props as { color?: string };
  return {
    type: 'cad-bezier', aboveSourceId: source.id,
    x: source.x, y: source.y, rotation: source.rotation, opacity: source.opacity,
    props: {
      contours: space === 'local' ? contours : mapContours(contours, point => editor.getPointInShapeSpace(source, point)),
      color: props.color ?? 'black', fillRule
    },
    meta: { ...source.meta, omsVectorPaint: paintMetadata(paint) }
  };
}

export function assertCadMergeContext(shapes: TLShape[], reference: TLShape): void {
  if (shapes.some(shape => shape.parentId !== reference.parentId))
    throw new CadOperationError('mixed-parents');
  // One result cannot retain the individually clipped silhouettes of its inputs.
  if (shapes.length > 1 && shapes.some(shape => {
    const paint = shape.meta.omsVectorPaint;
    return validVectorPaint(paint) && paint.clips?.length;
  })) throw new CadOperationError('mixed-clips');
}

export function cadReferencePaintWarnings(editor: Editor, shapes: TLShape[], reference: TLShape): string[] {
  const paint = JSON.stringify(convertedCurvePaint(editor, reference));
  return shapes.some(shape => shape.id !== reference.id &&
    (shape.opacity !== reference.opacity || JSON.stringify(convertedCurvePaint(editor, shape)) !== paint))
    ? ['reference-appearance'] : [];
}
