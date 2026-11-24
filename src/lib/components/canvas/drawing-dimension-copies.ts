import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import type { CadDimensionLink } from './cad-dimension-links';

/** Native 2.4.6 duplication and content placement remap hierarchy/bindings but
 * do not know about associative dimension IDs in custom shape props. Both
 * methods prepare one complete createShapes batch. Remap that batch before it
 * enters the store so native group geometry, Alt-copy and history see the new
 * references from the start, with no follow-up edit or extra undo mark.
 *
 * The source order below follows the pinned native implementations: reversed
 * descendant order for duplicateShapes, migrated content order for placement.
 * Tests exercise both paths, including nested groups and native Alt rollback. */
function withDimensionCopyLinks(editor: Editor, sources: TLShape[], run: () => Editor): Editor {
  if (!sources.some(shape => shape.type === 'cad-dimension' && (shape.props as { link?: CadDimensionLink }).link)) return run();
  const original = editor.createShapes;
  let consumed = false;
  const create: Editor['createShapes'] = function (shapes) {
    if (consumed || shapes.length !== sources.length || shapes.some((shape, index) => shape.type !== sources[index].type || !shape.id))
      return original.call(editor, shapes);
    consumed = true;
    const ids = new Map(sources.map((shape, index) => [shape.id, shapes[index].id!]));
    return original.call(editor, shapes.map(shape => {
      const link = shape.type === 'cad-dimension' ? (shape.props as { link?: CadDimensionLink | null })?.link : null;
      if (!link) return shape;
      const sourceIds = link.sourceIds.map(id => ids.get(id as TLShapeId) ?? id);
      if (sourceIds.every((id, index) => id === link.sourceIds[index])) return shape;
      return { ...shape, props: { ...shape.props, link: { ...link, sourceIds } } };
    }));
  };
  editor.createShapes = create;
  try { return run(); }
  finally { if (editor.createShapes === create) editor.createShapes = original; }
}

export function installDrawingDimensionCopies(editor: Editor): () => void {
  const originalDuplicate = editor.duplicateShapes, originalPut = editor.putContentOntoCurrentPage;
  const duplicate: Editor['duplicateShapes'] = function (shapes, offset) {
    const ids = shapes.map(shape => typeof shape === 'string' ? shape : shape.id);
    const sources = [...editor.getShapeAndDescendantIds(ids)].reverse().map(id => editor.getShape(id)).filter((shape): shape is TLShape => !!shape);
    return withDimensionCopyLinks(editor, sources, () => originalDuplicate.call(editor, shapes, offset));
  };
  const put: Editor['putContentOntoCurrentPage'] = function (content, options) {
    return withDimensionCopyLinks(editor, content.shapes, () => originalPut.call(editor, content, options));
  };
  editor.duplicateShapes = duplicate;
  editor.putContentOntoCurrentPage = put;
  return () => {
    if (editor.duplicateShapes === duplicate) editor.duplicateShapes = originalDuplicate;
    if (editor.putContentOntoCurrentPage === put) editor.putContentOntoCurrentPage = originalPut;
  };
}
