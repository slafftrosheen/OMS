import React, { useEffect, useId, useRef, useState } from 'react';
import { DefaultTextAlignStyle, useEditor, useValue, type TLShapeId, type TLTextShape } from '@tldraw/tldraw';
import { useDrawingText } from './drawing-copy';
import { useWorkbenchText } from './workbench-copy';
import { useDrawingFontText } from './font-copy';
import { DrawingFontPicker } from './DrawingFonts';
import { applySelectedDrawingFont, drawingFontValue, getNextDrawingFont, setNextDrawingFont } from './drawing-fonts';
import { applySelectedDrawingTextStyle, drawingTextPointSizeDisplay, type DrawingTextStylePatch } from './drawing-text-style';
import { getDrawingTextSpacing } from './drawing-text-spacing';
import { getNextDrawingTextStyle, setNextDrawingTextStyle } from './drawing-text-defaults';
import { TEXT_PIXELS, textPointSize } from './workbench-operations';
import { canKeepDrawingTextWidth, drawingTextFixedWidthAtScale } from './drawing-text-formatting';

const numericFields = {
  pointSize: { label: 'fontSize', min: 1, max: 3000, suffix: 'point-size' },
  letterSpacing: { label: 'letterSpacing', min: -50, max: 200, suffix: 'letter-spacing' },
  lineHeight: { label: 'lineSpacing', min: 50, max: 500, suffix: 'line-spacing' },
} as const;

export function TextNumericStyleField({ field, selected, value, disabled, next = false, compact = true, prefix = 'drawing-text' }: {
  field: keyof typeof numericFields; selected: readonly TLShapeId[]; value: number | undefined; disabled: boolean;
  next?: boolean; compact?: boolean; prefix?: string;
}) {
  const editor = useEditor(), { label, tr } = useDrawingText(), t = useWorkbenchText();
  const config = numericFields[field], errorId = useId();
  const displayed = value === undefined ? '' : String(drawingTextPointSizeDisplay(value));
  const selectionKey = selected.join('|');
  const [draft, setDraft] = useState(displayed);
  const [error, setError] = useState<'invalid' | 'changedFailed' | 'textSizeFixedWidth' | null>(null);
  const dirty = useRef(false);
  useEffect(() => { setDraft(displayed); setError(null); dirty.current = false; }, [displayed, field, selectionKey, next, disabled]);
  const reset = () => { dirty.current = false; setDraft(displayed); setError(null); };
  const commit = () => {
    if (!dirty.current) return true;
    if (disabled) { reset(); return false; }
    const number = draft.trim() ? Number(draft) : NaN;
    if (!Number.isFinite(number) || number < config.min || number > config.max) { setError('invalid'); return false; }
    if (field === 'pointSize' && !next && selected.some(id => {
      const shape = editor.getShape<TLTextShape>(id);
      return shape?.type === 'text' && !shape.props.autoSize && !canKeepDrawingTextWidth(drawingTextFixedWidthAtScale(editor, shape, number / (TEXT_PIXELS[shape.props.size] * .75)));
    })) { setError('textSizeFixedWidth'); return false; }
    const patch = { [field]: field === 'lineHeight' ? number / 100 : number };
    const applied = next ? setNextDrawingTextStyle(editor, patch) : applySelectedDrawingTextStyle(editor, selected, patch);
    if (!applied) { setError('changedFailed'); return false; }
    dirty.current = false; setDraft(String(drawingTextPointSizeDisplay(number))); setError(null); return true;
  };
  return <>
    <label className={compact ? `drawing-property-field ${field === 'pointSize' ? 'drawing-property-point-size' : 'drawing-property-text-spacing'}` : undefined}>
      <span title={t(config.label)}>{t(config.label)}</span>
      <input type="number" aria-label={t(config.label)} min={config.min} max={config.max} step="any" value={draft}
        placeholder={value === undefined ? tr('toolkit.toolbar.styleFields.mixed') : undefined} disabled={disabled}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined} data-testid={`${prefix}-${config.suffix}`}
        onChange={event => { dirty.current = true; setDraft(event.target.value); setError(null); }} onBlur={commit}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); if (commit()) event.currentTarget.blur(); }
          if (event.key === 'Escape') { event.preventDefault(); reset(); event.currentTarget.blur(); }
        }} />
    </label>
    {error && <span className={compact ? 'drawing-property-error' : 'drawing-help is-error'} id={errorId} role="alert">{
      error === 'changedFailed' || error === 'textSizeFixedWidth' ? label(error) : field === 'pointSize' ? label('textSizeInvalid') : t(field === 'letterSpacing' ? 'letterSpacingInvalid' : 'lineSpacingInvalid')
    }</span>}
  </>;
}

/** Both the property bar and docker operate on the same selection snapshot. */
export function SelectedTextStyleFields({ shapes, disabled, onFonts, compact = true, prefix = 'drawing-text' }: {
  shapes: TLTextShape[]; disabled: boolean; onFonts?: () => void; compact?: boolean; prefix?: string;
}) {
  const editor = useEditor(), { label, tr } = useDrawingText(), t = useWorkbenchText(), fontLabel = useDrawingFontText();
  const [failed, setFailed] = useState(false), [fontFailed, setFontFailed] = useState(false);
  const selected = shapes.map(shape => shape.id), selectionKey = selected.join('|');
  useEffect(() => { setFailed(false); setFontFailed(false); }, [selectionKey, disabled]);
  const shared = <T,>(read: (shape: TLTextShape) => T): T | undefined => {
    if (!shapes.length) return undefined;
    const value = read(shapes[0]); return shapes.every(shape => read(shape) === value) ? value : undefined;
  };
  const font = shared(drawingFontValue), align = shared(shape => shape.props.textAlign), autoWidth = shared(shape => shape.props.autoSize);
  const points = shared(shape => drawingTextPointSizeDisplay(textPointSize(shape)));
  const letterSpacing = shared(shape => drawingTextPointSizeDisplay(getDrawingTextSpacing(shape).letterSpacing));
  const lineSpacing = shared(shape => drawingTextPointSizeDisplay(getDrawingTextSpacing(shape).lineHeight * 100));
  const mixed = tr('toolkit.toolbar.styleFields.mixed');
  const apply = (patch: DrawingTextStylePatch) => { setFontFailed(false); setFailed(disabled || !applySelectedDrawingTextStyle(editor, selected, patch)); };
  return <>
    <DrawingFontPicker compact={compact} value={font} disabled={disabled} testId={`${prefix}-font`} onManage={onFonts}
      onChange={value => { setFailed(false); setFontFailed(disabled || !applySelectedDrawingFont(editor, selected, value)); }} />
    <TextNumericStyleField key={shapes.map(shape => `${shape.id}:${shape.props.autoSize}:${shape.props.w}`).join('|')} field="pointSize" selected={selected} value={points} disabled={disabled} compact={compact} prefix={prefix} />
    <TextNumericStyleField field="letterSpacing" selected={selected} value={letterSpacing} disabled={disabled} compact={compact} prefix={prefix} />
    <TextNumericStyleField field="lineHeight" selected={selected} value={lineSpacing} disabled={disabled} compact={compact} prefix={prefix} />
    <label className={compact ? 'drawing-property-field' : undefined}><span>{t('align')}</span>
      <select aria-label={t('align')} disabled={disabled} value={align ?? ''} data-testid={`${prefix}-align`}
        onChange={event => apply({ textAlign: event.target.value as TLTextShape['props']['textAlign'] })}>
        {align === undefined && <option value="" disabled>{mixed}</option>}
        {DefaultTextAlignStyle.values.map(value => <option key={value} value={value}>{tr(`toolkit.toolbar.styleValues.horizontal.${value}`)}</option>)}
      </select>
    </label>
    <label className={compact ? 'drawing-property-field' : undefined}><span>{t('width')}</span>
      <select aria-label={t('autoWidth')} disabled={disabled} value={autoWidth === undefined ? '' : String(autoWidth)} data-testid={`${prefix}-auto-width`}
        onChange={event => apply({ autoSize: event.target.value === 'true' })}>
        {autoWidth === undefined && <option value="" disabled>{mixed}</option>}
        <option value="true">{t('autoWidth')}</option><option value="false">{label('fixedTextWidth')}</option>
      </select>
    </label>
    {failed && <span className={compact ? 'drawing-property-error' : 'drawing-help is-error'} role="alert">{label('changedFailed')}</span>}
    {fontFailed && <span className={compact ? 'drawing-property-error' : 'drawing-help is-error'} role="alert">{fontLabel('applyFailed')}</span>}
  </>;
}

export function NextTextProperties({ disabled, onFonts, compact = true }: { disabled: boolean; onFonts?: () => void; compact?: boolean }) {
  const editor = useEditor(), { label, tr } = useDrawingText(), t = useWorkbenchText(), fontLabel = useDrawingFontText();
  const state = useValue('next text typography', () => ({ ...getNextDrawingTextStyle(editor), font: getNextDrawingFont(editor), selected: editor.getSelectedShapeIds() }), [editor]);
  const [failed, setFailed] = useState(false);
  const prefix = compact ? 'drawing-next-text' : 'drawing-next-text-docker';
  return <fieldset className={compact ? 'drawing-context-properties' : 'drawing-workbench-fields'} disabled={disabled} aria-label={label('nextText')} data-testid={compact ? 'drawing-next-text-properties' : 'drawing-next-text-docker-properties'}>
    <DrawingFontPicker compact={compact} value={state.font} disabled={disabled} onManage={onFonts} testId={compact ? 'drawing-property-font' : `${prefix}-font`}
      onChange={value => setFailed(disabled || !setNextDrawingFont(editor, value))} />
    <TextNumericStyleField field="pointSize" selected={state.selected} value={state.pointSize} disabled={disabled} next compact={compact} prefix={prefix} />
    <TextNumericStyleField field="letterSpacing" selected={state.selected} value={state.letterSpacing} disabled={disabled} next compact={compact} prefix={prefix} />
    <TextNumericStyleField field="lineHeight" selected={state.selected} value={state.lineHeight * 100} disabled={disabled} next compact={compact} prefix={prefix} />
    <label className={compact ? 'drawing-property-field' : undefined}><span>{t('align')}</span>
      <select aria-label={t('align')} value={state.textAlign} disabled={disabled} data-testid={`${prefix}-align`}
        onChange={event => setFailed(disabled || !setNextDrawingTextStyle(editor, { textAlign: event.target.value as TLTextShape['props']['textAlign'] }))}>
        {DefaultTextAlignStyle.values.map(value => <option key={value} value={value}>{tr(`toolkit.toolbar.styleValues.horizontal.${value}`)}</option>)}
      </select>
    </label>
    {failed && <span className={compact ? 'drawing-property-error' : 'drawing-help is-error'} role="alert">{fontLabel('applyFailed')}</span>}
  </fieldset>;
}
