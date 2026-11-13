import React, { useEffect, useId, useRef, useState } from 'react';
import { DefaultFontStyle, useEditor, useValue } from '@tldraw/tldraw';
import { useDrawingText } from './drawing-copy';
import { useWorkbenchText } from './workbench-copy';
import { drawingFontErrorLabel, useDrawingFontText, type DrawingFontLabel } from './font-copy';
import { drawingFontFamily, drawingFontInUse, DrawingFontUploadError, exportDrawingFontSet, fontSupportsText, getLoadedDrawingFont, getNextDrawingFont, MAX_DRAWING_FONT_BYTES, MAX_DRAWING_FONTS_BYTES, MAX_DRAWING_FONTS, readDrawingFonts, removeDrawingFont, setNextDrawingFont, uploadDrawingFonts, type DrawingFont } from './drawing-fonts';

function fontOptionName(font: DrawingFont): string {
  const normalize = (value: string) => ` ${value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')} `;
  return font.subfamily && !normalize(font.name).includes(normalize(font.subfamily)) ? `${font.name} · ${font.subfamily}` : font.name;
}

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
            {fonts.map(({ font, available }) => <option key={font.id} value={font.id} disabled={!available}>{fontOptionName(font)}{!available ? ` · ${t('missing')}` : ''}</option>)}
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
  const titleId = useId(), limitsId = useId(), exportHelpId = useId(), searchSummaryId = useId();
  const input = useRef<HTMLInputElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true), sequence = useRef(0), operating = useRef(false);
  const readonly = useValue('document font permissions', () => editor.getInstanceState().isReadonly, [editor]);
  const fonts = useValue('document font manager', () => readDrawingFonts(editor).map(font => ({ font, used: drawingFontInUse(editor, font.id), loaded: getLoadedDrawingFont(editor, font.id) })), [editor]);
  const [operation, setOperation] = useState<'upload' | 'export'>(), [preview, setPreview] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ key: DrawingFontLabel; values?: Record<string, string | number>; name?: string; fileName?: string; error?: boolean; noFontsAdded?: boolean }>();
  const busy = operation !== undefined;
  const limits = { file: MAX_DRAWING_FONT_BYTES / (1024 * 1024), total: MAX_DRAWING_FONTS_BYTES / (1024 * 1024), count: MAX_DRAWING_FONTS };
  const capacity = { count: MAX_DRAWING_FONTS, usedCount: fonts.length, usedKiB: Math.ceil(fonts.reduce((total, { font }) => total + font.bytes, 0) / 1024), totalKiB: MAX_DRAWING_FONTS_BYTES / 1024 };
  const search = query.trim().toLowerCase();
  const visibleFonts = fonts.filter(({ font }) => [font.name, font.family, font.subfamily].some(value => value.toLowerCase().includes(search)));
  const unavailable = fonts.some(({ loaded }) => !loaded);
  useEffect(() => {
    alive.current = true; operating.current = false; sequence.current++; setOperation(undefined); setMessage(undefined); setQuery('');
    return () => { alive.current = false; sequence.current++; };
  }, [editor]);
  useEffect(() => {
    if (!focusRequest) return;
    const target = input.current?.disabled ? searchInput.current : input.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [focusRequest]);
  async function upload(files: readonly File[]) {
    if (operating.current || editor.getInstanceState().isReadonly) return;
    operating.current = true; setOperation('upload'); setMessage(undefined);
    const request = ++sequence.current;
    try {
      const result = await uploadDrawingFonts(editor, files);
      if (alive.current && request === sequence.current) setMessage({ key: 'batchAdded', values: { added: result.added, reused: result.reused } });
    } catch (error) {
      if (alive.current && request === sequence.current) setMessage({ key: drawingFontErrorLabel(error), fileName: error instanceof DrawingFontUploadError ? error.fileName : undefined, error: true, noFontsAdded: true });
    } finally {
      if (alive.current && request === sequence.current) { operating.current = false; setOperation(undefined); }
    }
  }
  async function exportFonts() {
    if (operating.current || !fonts.length || unavailable) return;
    operating.current = true; setOperation('export'); setMessage(undefined);
    const request = ++sequence.current;
    try {
      const json = await exportDrawingFontSet(editor);
      if (!alive.current || request !== sequence.current) return;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      try {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'OMS-fonts.omsfonts'; anchor.click();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 30_000); }
      setMessage({ key: 'exported' });
    } catch (error) {
      if (alive.current && request === sequence.current) setMessage({ key: drawingFontErrorLabel(error), error: true });
    } finally {
      if (alive.current && request === sequence.current) { operating.current = false; setOperation(undefined); }
    }
  }
  function remove(id: string, name: string) {
    if (operating.current) return;
    setMessage(undefined);
    try {
      const success = removeDrawingFont(editor, id);
      setMessage(success ? { key: 'removed', name } : { key: editor.getInstanceState().isReadonly ? 'font-readonly' : drawingFontInUse(editor, id) ? 'font-in-use' : 'failed', error: true });
    } catch (error) { setMessage({ key: drawingFontErrorLabel(error), error: true }); }
  }
  return <section className="drawing-font-manager drawing-workbench-fields" aria-labelledby={titleId} aria-busy={busy} data-testid="drawing-font-manager">
    <h3 id={titleId}>{t('documentFonts')}</h3>
    <p className="drawing-help">{t('embedded')}</p>
    <label><span>{t('upload')}</span><input ref={input} type="file" multiple accept=".ttf,.otf,.woff,.woff2,.omsfonts" disabled={readonly || busy}
      aria-describedby={limitsId} data-testid="drawing-font-upload" onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void upload(files);
      }} /></label>
    <p id={limitsId} className="drawing-help">{t('limits', limits)}</p>
    <p className="drawing-help" data-testid="drawing-font-capacity">{t('capacity', capacity)}</p>
    <div className="drawing-workbench-actions drawing-font-actions"><button type="button" className="drawing-button" disabled={busy || !fonts.length || unavailable}
      aria-describedby={exportHelpId} onClick={() => void exportFonts()} data-testid="drawing-font-export">{t('exportSet')}</button></div>
    <p id={exportHelpId} className="drawing-help">{t('reuseHelp')}{unavailable ? ` ${t('missingHelp')}` : ''}</p>
    {operation && <p className="drawing-help" role="status">{t(operation === 'upload' ? 'uploading' : 'exporting')}</p>}
    {message && <p className={`drawing-help${message.error ? ' drawing-font-error' : ''}`} role={message.error ? 'alert' : 'status'}>
      {message.fileName ? `${message.fileName}: ` : ''}{t(message.key, { ...limits, ...message.values })}{message.name ? `: ${message.name}` : ''}{message.noFontsAdded ? ` ${t('noFontsAdded')}` : ''}
    </p>}
    {fonts.length === 0 ? <p className="drawing-help">{t('empty')}</p> : <>
      <label><span>{t('search')}</span><input ref={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)}
        aria-describedby={searchSummaryId} data-testid="drawing-font-search" /></label>
      <div className="drawing-workbench-actions drawing-font-actions">
        <p id={searchSummaryId} className="drawing-help" role="status">{t('searchCount', { visible: visibleFonts.length, total: fonts.length })}</p>
        {query && <button type="button" className="drawing-button" onClick={() => { setQuery(''); searchInput.current?.focus(); }}>{t('clearSearch')}</button>}
      </div>
      <label><span>{t('preview')}</span><input type="text" value={preview ?? t('previewText')} maxLength={120} onChange={event => setPreview(event.target.value)} data-testid="drawing-font-preview-text" /></label>
      {visibleFonts.length === 0 ? <p className="drawing-help">{t('noResults')}</p> : <ul className="drawing-font-list">{visibleFonts.map(({ font, used, loaded }) => <li key={font.id} data-testid="drawing-document-font">
        <div className="drawing-font-name"><strong>{font.name}</strong><span>{[font.family, font.subfamily].filter(Boolean).join(' · ')}</span></div>
        {loaded ? (fontSupportsText(loaded.font, preview ?? t('previewText'))
          ? <p className="drawing-font-preview" style={{ fontFamily: drawingFontFamily(font) }}>{preview ?? t('previewText')}</p>
          : <p className="drawing-help drawing-font-error">{t('glyphMissing')}</p>)
          : <p className="drawing-help drawing-font-error">{t('missing')}. {t('missingHelp')}</p>}
        <button type="button" disabled={readonly || busy || used} onClick={() => remove(font.id, font.name)}
          aria-label={`${t('remove')}: ${font.name}`} title={used ? t('inUse') : t('remove')}>{t('remove')}</button>
        {used && <p className="drawing-help">{t('inUse')}</p>}
      </li>)}</ul>}
    </>}
  </section>;
}
