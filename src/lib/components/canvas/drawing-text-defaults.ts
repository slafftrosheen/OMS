import { DefaultFontStyle, DefaultSizeStyle, DefaultTextAlignStyle, type Editor, type StateNode, type TLShapeId, type TLTextShape, type Vec } from '@tldraw/tldraw';
import { TEXT_PIXELS, drawingTextScaleForPointSize, textPointSize } from './drawing-text-size';
import { CAD_MAX_COORDINATE, readCadSettings } from './cad-settings';
import { DEFAULT_DRAWING_TEXT_SPACING, drawingTextSpacingMeta, getDrawingTextSpacing, validDrawingTextSpacing, type DrawingTextSpacing } from './drawing-text-spacing';
import { drawingTextBoundsInsideCanvas, drawingTextPageBounds, reportDrawingTextBounds } from './drawing-text-formatting';

export interface DrawingTextDefaults extends DrawingTextSpacing {
  pointSize: number;
  textAlign: TLTextShape['props']['textAlign'];
}

/** Preferences are local to this editor instance. Native size presets remain
 * meaningful: choosing a different preset replaces an earlier exact size. */
export function getNextDrawingTextStyle(editor: Editor): DrawingTextDefaults {
  const size = editor.getStyleForNextShape(DefaultSizeStyle);
  const value = editor.getInstanceState().meta.omsNextTextStyle;
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const pointSize = saved.size === size && typeof saved.pointSize === 'number' && Number.isFinite(saved.pointSize) && saved.pointSize >= 1 && saved.pointSize <= 3000
    ? saved.pointSize : TEXT_PIXELS[size] * 0.75;
  const spacing = getDrawingTextSpacing({ meta: { omsTextSpacing: saved } });
  return { pointSize, ...spacing, textAlign: editor.getStyleForNextShape(DefaultTextAlignStyle) };
}

export function setNextDrawingTextStyle(editor: Editor, patch: Partial<DrawingTextDefaults>): boolean {
  const keys = Object.keys(patch);
  if (editor.isDisposed || editor.getInstanceState().isReadonly || !keys.length || keys.some(key => !['pointSize', 'letterSpacing', 'lineHeight', 'textAlign'].includes(key))) return false;
  if (!validDrawingTextSpacing(patch)
    || ('pointSize' in patch && (!Number.isFinite(patch.pointSize) || patch.pointSize! < 1 || patch.pointSize! > 3000))
    || ('textAlign' in patch && !['start', 'middle', 'end'].includes(patch.textAlign!))) return false;
  const current = getNextDrawingTextStyle(editor);
  const next = { ...current, ...patch };
  if (!canPlaceNextDrawingText(editor, next)) { reportDrawingTextBounds(editor); return false; }
  if (keys.every(key => current[key as keyof DrawingTextDefaults] === patch[key as keyof DrawingTextDefaults])) return true;
  // Instance-only preferences must not become an artwork undo step.
  editor.run(() => {
    if ('textAlign' in patch) editor.setStyleForNextShapes(DefaultTextAlignStyle, next.textAlign);
    const state = editor.getInstanceState();
    editor.updateInstanceState({ meta: { ...state.meta, omsNextTextStyle: {
      size: editor.getStyleForNextShape(DefaultSizeStyle), pointSize: next.pointSize,
      letterSpacing: next.letterSpacing, lineHeight: next.lineHeight,
    } } });
  }, { history: 'ignore' });
  return true;
}

/** Check the measured blank without inserting artwork. This excludes sizes
 * that cannot fit anywhere; the actual point/parent is checked at creation. */
function canPlaceNextDrawingText(editor: Editor, next: DrawingTextDefaults): boolean {
  try {
    const util = editor.getShapeUtil<TLTextShape>('text'), size = editor.getStyleForNextShape(DefaultSizeStyle);
    const fontId = editor.getInstanceState().meta.omsNextFont;
    const probe = {
      id: 'shape:oms-next-text-probe', typeName: 'shape', type: 'text', parentId: editor.getCurrentPageId(),
      index: 'a1', x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1,
      props: { ...util.getDefaultProps(), text: '', autoSize: true, size, font: editor.getStyleForNextShape(DefaultFontStyle),
        scale: drawingTextScaleForPointSize(size, next.pointSize, readCadSettings(editor)), textAlign: next.textAlign },
      meta: drawingTextSpacingMeta({ meta: typeof fontId === 'string' && fontId ? { omsFontId: fontId } : {} }, { letterSpacing: next.letterSpacing, lineHeight: next.lineHeight }),
    } as TLTextShape;
    const bounds = util.getGeometry(probe).bounds;
    return [bounds.w, bounds.h].every(value => Number.isFinite(value) && value > 0 && value <= CAD_MAX_COORDINATE * 2);
  } catch { return false; }
}

type NativeTextPointing = StateNode & {
  markId: string;
  createTextShape(id: TLShapeId, point: Vec, autoSize: boolean): TLTextShape | undefined;
};
let textCreationSequence = 0;

/** Only the native text tool's blank creation receives defaults. Existing
 * records, paste, duplicates, imports and remote updates retain their styling. */
export function installDrawingTextDefaults(editor: Editor): () => void {
  const pointing = editor.getStateDescendant('text.pointing') as NativeTextPointing | undefined;
  const createText = pointing?.createTextShape;
  const checkedCreate: typeof createText = (id, point, autoSize) => {
    if (editor.getInstanceState().isReadonly) { editor.setCurrentTool('text.idle'); return; }
    const mark = `drawing-text-create-${++textCreationSequence}`, previousMark = pointing!.markId;
    const requested = getNextDrawingTextStyle(editor).pointSize, settings = readCadSettings(editor);
    let created: TLTextShape | undefined, nativeCanceled = false;
    // Keep the native creation + typed content in one undo step. There is no
    // completion mark here. Native missing-record cancellation also receives a
    // known current mark, so it cannot bail through unrelated earlier artwork.
    editor.mark(mark); pointing!.markId = mark;
    try {
      editor.run(() => {
        const result = createText!.call(pointing, id, point, autoSize);
        if (!result) { nativeCanceled = true; return; }
        created = editor.getShape<TLTextShape>(result.id);
        if (!created || !drawingTextBoundsInsideCanvas(drawingTextPageBounds(editor, created)) ||
          Math.abs(textPointSize(created, settings) - requested) > Math.max(1e-7, requested * 1e-9)) {
          throw new Error('Text could not be placed at its requested size');
        }
      });
    } catch {
      if (!nativeCanceled) editor.bailToMark(mark);
      created = undefined;
    } finally { pointing!.markId = previousMark; }
    if (!created) {
      if (editor.isIn('text.pointing')) editor.setCurrentTool('text.idle');
      reportDrawingTextBounds(editor);
    }
    return created;
  };
  if (pointing && createText) pointing.createTextShape = checkedCreate;
  const resizing = editor.getStateDescendant('select.resizing'), enterResizing = resizing?.onEnter;
  const pointerUp = resizing?.onPointerUp, completeResizing = resizing?.onComplete;
  let paragraph: TLShapeId | null = null;
  const finishParagraph = (): boolean => {
    if (!paragraph) return true;
    const shape = editor.getShape<TLTextShape>(paragraph);
    if (shape && drawingTextBoundsInsideCanvas(drawingTextPageBounds(editor, shape))) return true;
    resizing?.onCancel?.({ type: 'misc', name: 'cancel' }); reportDrawingTextBounds(editor); return false;
  };
  const checkedPointerUp: typeof pointerUp = info => { if (finishParagraph()) pointerUp?.call(resizing, info); };
  const checkedComplete: typeof completeResizing = info => { if (finishParagraph()) completeResizing?.call(resizing, info); };
  if (resizing && pointerUp) resizing.onPointerUp = checkedPointerUp;
  if (resizing && completeResizing) resizing.onComplete = checkedComplete;
  // Native 2.4 starts a dragged paragraph with a 20px blank and subtracts a
  // fixed 18px cursor offset. Exact physical type can make that blank hundreds
  // of page units wide. Use its actual page-space handle so the drag defines
  // the box width independently of type size, zoom and parent rotation.
  const enterTextResize: typeof enterResizing = (info, from) => {
    const shape = editor.getOnlySelectedShape();
    paragraph = null;
    if (info?.isCreating && info.onInteractionEnd === 'text' && shape?.type === 'text' &&
      !(shape as TLTextShape).props.autoSize && (shape as TLTextShape).props.text === '') {
      const bounds = editor.getShapeGeometry(shape).bounds;
      const handle = editor.getShapePageTransform(shape).applyToPoint({ x: bounds.maxX, y: bounds.midY });
      const origin = editor.inputs.originPagePoint;
      info = { ...info, creationCursorOffset: { x: handle.x - origin.x, y: handle.y - origin.y } };
      paragraph = shape.id;
    }
    enterResizing?.call(resizing, info, from);
  };
  if (resizing && enterResizing) resizing.onEnter = enterTextResize;
  const stopPresets = editor.sideEffects.registerBeforeChangeHandler('instance', (prev, next) => {
    const before = prev.stylesForNextShape[DefaultSizeStyle.id] ?? DefaultSizeStyle.defaultValue;
    const after = next.stylesForNextShape[DefaultSizeStyle.id] ?? DefaultSizeStyle.defaultValue;
    const saved = next.meta.omsNextTextStyle;
    if (before === after || !saved || typeof saved !== 'object' || Array.isArray(saved) || typeof after !== 'string' || !(after in TEXT_PIXELS)) return next;
    return { ...next, meta: { ...next.meta, omsNextTextStyle: { ...saved, size: after, pointSize: TEXT_PIXELS[after as keyof typeof TEXT_PIXELS] * 0.75 } } };
  });
  const stopCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    if (source !== 'user' || shape.type !== 'text' || !editor.isIn('text.pointing') || editor.getInstanceState().isReadonly) return shape;
    const text = shape as TLTextShape;
    if (text.props.text !== '') return shape;
    const next = getNextDrawingTextStyle(editor);
    const spacingChanged = next.letterSpacing !== DEFAULT_DRAWING_TEXT_SPACING.letterSpacing || next.lineHeight !== DEFAULT_DRAWING_TEXT_SPACING.lineHeight;
    return { ...shape, props: { ...text.props, scale: drawingTextScaleForPointSize(text.props.size, next.pointSize, readCadSettings(editor)), textAlign: next.textAlign },
      ...(spacingChanged ? { meta: drawingTextSpacingMeta(shape, { letterSpacing: next.letterSpacing, lineHeight: next.lineHeight }) } : {}) };
  });
  return () => {
    stopCreate(); stopPresets();
    if (pointing?.createTextShape === checkedCreate) pointing.createTextShape = createText;
    if (resizing?.onEnter === enterTextResize) resizing.onEnter = enterResizing;
    if (resizing?.onPointerUp === checkedPointerUp) resizing.onPointerUp = pointerUp;
    if (resizing?.onComplete === checkedComplete) resizing.onComplete = completeResizing;
  };
}
