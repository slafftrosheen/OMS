import { DefaultSizeStyle, DefaultTextAlignStyle, type Editor, type TLTextShape } from '@tldraw/tldraw';
import { TEXT_PIXELS } from './workbench-operations';
import { DEFAULT_DRAWING_TEXT_SPACING, drawingTextSpacingMeta, getDrawingTextSpacing, validDrawingTextSpacing, type DrawingTextSpacing } from './drawing-text-spacing';

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
  if (keys.every(key => current[key as keyof DrawingTextDefaults] === patch[key as keyof DrawingTextDefaults])) return true;
  const next = { ...current, ...patch };
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

/** Only the native text tool's blank creation receives defaults. Existing
 * records, paste, duplicates, imports and remote updates retain their styling. */
export function installDrawingTextDefaults(editor: Editor): () => void {
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
    return { ...shape, props: { ...text.props, scale: next.pointSize / (TEXT_PIXELS[text.props.size] * 0.75), textAlign: next.textAlign },
      ...(spacingChanged ? { meta: drawingTextSpacingMeta(shape, { letterSpacing: next.letterSpacing, lineHeight: next.lineHeight }) } : {}) };
  });
  return () => { stopCreate(); stopPresets(); };
}
