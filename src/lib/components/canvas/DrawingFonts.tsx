import React, { useEffect, useId, useRef, useState } from 'react';
import { DefaultFontStyle, useEditor, useValue } from '@tldraw/tldraw';
import { useDrawingText } from './drawing-copy';
import { useWorkbenchText } from './workbench-copy';
import { drawingFontErrorLabel, useDrawingFontText, type DrawingFontLabel } from './font-copy';
import { drawingFontFamily, drawingFontInUse, fontSupportsText, getLoadedDrawingFont, getNextDrawingFont, MAX_DRAWING_FONT_BYTES, MAX_DRAWING_FONTS_BYTES, MAX_DRAWING_FONTS, readDrawingFonts, removeDrawingFont, setNextDrawingFont, uploadDrawingFont } from './drawing-fonts';

export function DrawingFontPicker({ value, disabled, onChange, onManage, compact = false, testId }: {
  value: string | undefined; disabled?: boolean; onChange: (value: string) => void; onManage?: () => void; compact?: boolean; testId?: string;
}) {
  const editor = useEditor(), t = useDrawingFontText(), workbench = useWorkbenchText();
  const { tr } = useDrawingText();
  const fonts = useValue('document font choices', () => readDrawingFonts(editor).map(font => ({ font, available: !!getLoadedDrawingFont(editor, font.id) })), [editor]);
  const missing = !!value && !DefaultFontStyle.values.some(font => font === value) && !fonts.some(({ font, available }) => font.id === value && available);
  const helpId = useId();
  return <>
    <div className={compact ? 'drawing-font-control' : 'drawing-font-picker'}>
      <label className={compact ? 'drawing-property-field drawing-property-font' : undefined}><span>{workbench('font')}</span>
        <select aria-label={workbench('font')} value={value ?? ''} disabled={disabled} onChange={event => onChange(event.target.value)}
          aria-invalid={missing} aria-describedby={missing ? helpId : undefined} data-testid={testId}>
          {value === undefined && <option value="" disabled>{tr('toolkit.toolbar.styleFields.mixed')}</option>}
          {missing && !fonts.some(({ font }) => font.id === value) && <option value={value} disabled>{t('missing')}</option>}
          <optgroup label={t('builtInFonts')}>
            {DefaultFontStyle.values.map(font => <option key={font} value={font}>{tr(`toolkit.toolbar.styleValues.font.${font}`)}</option>)}
          </optgroup>
          {fonts.length > 0 && <optgroup label={t('documentFonts')}>
            {fonts.map(({ font, available }) => <option key={font.id} value={font.id} disabled={!available}>{font.name}{font.subfamily ? ` · ${font.subfamily}` : ''}{!available ? ` · ${t('missing')}` : ''}</option>)}
          </optgroup>}
        </select>
      </label>
      {onManage && <div className="drawing-property-actions"><button type="button" className="drawing-button" onClick={onManage}
        aria-label={t('documentFonts')} title={t('documentFonts')} data-testid="drawing-manage-fonts">{t('fonts')}</button></div>}
    </div>
    {missing && <span id={helpId} role="alert" className={compact ? 'drawing-property-error' : 'drawing-help drawing-font-error'}>{t('missingHelp')}</span>}
  </>;
}

export function NextDrawingFontPicker({ disabled, onManage, compact = true }: { disabled: boolean; onManage: () => void; compact?: boolean }) {
  const editor = useEditor(), t = useDrawingFontText();
  const value = useValue('next document font', () => getNextDrawingFont(editor), [editor]);
  const [failed, setFailed] = useState(false);
  return <>
    <DrawingFontPicker compact={compact} value={value} disabled={disabled} onManage={onManage} testId={`drawing-${compact ? 'property' : 'style'}-font`}
      onChange={font => setFailed(!setNextDrawingFont(editor, font))} />
    {failed && <span className={compact ? 'drawing-property-error' : 'drawing-help drawing-font-error'} role="alert">{t('applyFailed')}</span>}
  </>;
}

export function DrawingFontManager({ focusRequest = 0 }: { focusRequest?: number }) {
  const editor = useEditor(), t = useDrawingFontText();
  const titleId = useId(), limitsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true), sequence = useRef(0), uploading = useRef(false);
  const readonly = useValue('document font permissions', () => editor.getInstanceState().isReadonly, [editor]);
  const fonts = useValue('document font manager', () => readDrawingFonts(editor).map(font => ({ font, used: drawingFontInUse(editor, font.id), loaded: getLoadedDrawingFont(editor, font.id) })), [editor]);
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState<string | undefined>();
  const [message, setMessage] = useState<{ key: DrawingFontLabel; name?: string; error?: boolean }>();
  const limits = { file: MAX_DRAWING_FONT_BYTES / (1024 * 1024), total: MAX_DRAWING_FONTS_BYTES / (1024 * 1024), count: MAX_DRAWING_FONTS };
  useEffect(() => {
    alive.current = true; uploading.current = false; sequence.current++; setBusy(false); setMessage(undefined);
    return () => { alive.current = false; sequence.current++; };
  }, [editor]);
  useEffect(() => {
    if (!focusRequest) return;
    input.current?.focus({ preventScroll: true });
    input.current?.scrollIntoView({ block: 'nearest' });
  }, [focusRequest]);
  async function upload(file: File) {
    if (uploading.current || editor.getInstanceState().isReadonly) return;
    uploading.current = true; setBusy(true); setMessage(undefined);
    const request = ++sequence.current;
    try {
      const font = await uploadDrawingFont(editor, file);
      if (alive.current && request === sequence.current) setMessage({ key: 'added', name: font.name });
    } catch (error) {
      if (alive.current && request === sequence.current) setMessage({ key: drawingFontErrorLabel(error), error: true });
    } finally {
      if (alive.current && request === sequence.current) { uploading.current = false; setBusy(false); }
    }
  }
  function remove(id: string, name: string) {
    setMessage(undefined);
    try {
      const success = removeDrawingFont(editor, id);
      setMessage(success ? { key: 'removed', name } : { key: editor.getInstanceState().isReadonly ? 'font-readonly' : drawingFontInUse(editor, id) ? 'font-in-use' : 'failed', error: true });
    } catch (error) { setMessage({ key: drawingFontErrorLabel(error), error: true }); }
  }
  return <section className="drawing-font-manager drawing-workbench-fields" aria-labelledby={titleId} aria-busy={busy} data-testid="drawing-font-manager">
    <h3 id={titleId}>{t('documentFonts')}</h3>
    <p className="drawing-help">{t('embedded')}</p>
    <label><span>{t('upload')}</span><input ref={input} type="file" accept=".ttf,.otf,.woff,.woff2" disabled={readonly || busy}
      aria-describedby={limitsId} data-testid="drawing-font-upload" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file);
      }} /></label>
    <p id={limitsId} className="drawing-help">{t('limits', limits)}</p>
    {busy && <p className="drawing-help" role="status">{t('uploading')}</p>}
    {message && <p className={`drawing-help${message.error ? ' drawing-font-error' : ''}`} role={message.error ? 'alert' : 'status'}>{t(message.key, limits)}{message.name ? `: ${message.name}` : ''}</p>}
    {fonts.length === 0 ? <p className="drawing-help">{t('empty')}</p> : <>
      <label><span>{t('preview')}</span><input type="text" value={preview ?? t('previewText')} maxLength={120} onChange={event => setPreview(event.target.value)} data-testid="drawing-font-preview-text" /></label>
      <ul className="drawing-font-list">{fonts.map(({ font, used, loaded }) => <li key={font.id} data-testid="drawing-document-font">
        <div className="drawing-font-name"><strong>{font.name}</strong><span>{[font.family, font.subfamily].filter(Boolean).join(' · ')}</span></div>
        {loaded ? (fontSupportsText(loaded.font, preview ?? t('previewText'))
          ? <p className="drawing-font-preview" style={{ fontFamily: drawingFontFamily(font) }}>{preview ?? t('previewText')}</p>
          : <p className="drawing-help drawing-font-error">{t('glyphMissing')}</p>)
          : <p className="drawing-help drawing-font-error">{t('missing')}. {t('missingHelp')}</p>}
        <button type="button" disabled={readonly || busy || used} onClick={() => remove(font.id, font.name)}
          aria-label={`${t('remove')}: ${font.name}`} title={used ? t('inUse') : t('remove')}>{t('remove')}</button>
        {used && <p className="drawing-help">{t('inUse')}</p>}
      </li>)}</ul>
    </>}
  </section>;
}
