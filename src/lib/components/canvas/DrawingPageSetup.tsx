import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue, type TLPage, type TLPageId } from '@tldraw/tldraw';
import {
  addDrawingPage, drawingPageBounds, DRAWING_PAGE_NAME_LIMIT, DRAWING_PAGE_PRESETS, DRAWING_STOCK_PRESETS,
  fitDrawingPage, readDrawingPageSize, saveDrawingPage,
} from './drawing-pages';
import { useDrawingText } from './drawing-copy';

const pagePresets = { ...DRAWING_PAGE_PRESETS, ...DRAWING_STOCK_PRESETS };

export function DrawingPageSheet() {
  const editor = useEditor();
  const bounds = useValue('drawing page bounds', () => drawingPageBounds(editor), [editor]);
  if (!bounds) return null;
  return <svg className="drawing-page-sheet" width={bounds.w} height={bounds.h} aria-hidden="true" data-testid="drawing-page-sheet">
    <rect x={0} y={0} width={bounds.w} height={bounds.h} vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function DrawingPageNavigator({ pages, active, onSelect }: {
  pages: TLPage[]; active: TLPageId; onSelect: (id: TLPageId) => void;
}) {
  const { label } = useDrawingText();
  return <select className="drawing-page-navigator" aria-label={label('pageNavigator')} value={active}
    data-testid="drawing-page-navigator" onChange={event => onSelect(event.target.value as TLPageId)}>
    {pages.map((page, i) => <option key={page.id} value={page.id}>{i + 1}. {page.name}</option>)}
  </select>;
}

export function DrawingPageSetup({ multiple, focus }: { multiple: boolean; focus?: number }) {
  const editor = useEditor(), { label } = useDrawingText(), title = useRef<HTMLDetailsElement>(null);
  const page = useValue('drawing page setup', () => editor.getCurrentPage(), [editor]);
  const readonly = useValue('drawing page access', () => editor.getInstanceState().isReadonly, [editor]);
  const count = useValue('drawing page count', () => editor.getPages().length, [editor]);
  const canFit = useValue('can fit drawing page', () => !!drawingPageBounds(editor), [editor]);
  const size = readDrawingPageSize(editor);
  const [name, setName] = useState(page.name);
  const [width, setWidth] = useState(String((size ?? DRAWING_PAGE_PRESETS.A4).widthMm));
  const [height, setHeight] = useState(String((size ?? DRAWING_PAGE_PRESETS.A4).heightMm));
  const [message, setMessage] = useState<'changedFailed' | 'pageSaved'>();
  useEffect(() => {
    if (!focus || !title.current) return;
    title.current.open = true;
    title.current.querySelector('summary')?.focus();
    title.current.scrollIntoView?.({ block: 'nearest' });
  }, [focus]);
  useEffect(() => {
    const value = size ?? DRAWING_PAGE_PRESETS.A4;
    setName(page.name); setWidth(String(value.widthMm)); setHeight(String(value.heightMm));
  }, [page.id, page.name, size?.widthMm, size?.heightMm]);
  const widthMm = Number(width), heightMm = Number(height);
  const valid = !!name.trim() && name.trim().length <= DRAWING_PAGE_NAME_LIMIT &&
    [widthMm, heightMm].every(value => Number.isFinite(value) && value >= 1 && value <= 100000);
  const preset = Object.entries(pagePresets).find(([, p]) =>
    p.widthMm === widthMm && p.heightMm === heightMm || p.widthMm === heightMm && p.heightMm === widthMm)?.[0] ?? '';
  const report = (ok: boolean) => setMessage(ok ? 'pageSaved' : 'changedFailed');
  return <details className="drawing-cad-section" ref={title} data-testid="drawing-page-setup">
    <summary>{label('pageSetup')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      if (valid) report(saveDrawingPage(editor, name, { widthMm, heightMm }));
    }}>
      <fieldset disabled={readonly} className="drawing-cad-fields">
        <label className="drawing-cad-field"><span>{label('pageName')}</span>
          <input type="text" maxLength={DRAWING_PAGE_NAME_LIMIT} required value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="drawing-cad-field"><span>{label('pagePreset')}</span>
          <select value={preset} onChange={event => {
            const next = pagePresets[event.target.value as keyof typeof pagePresets];
            if (!next) return;
            setWidth(String(widthMm > heightMm ? next.heightMm : next.widthMm));
            setHeight(String(widthMm > heightMm ? next.widthMm : next.heightMm));
          }}>
            <option value="" disabled>{label('pageCustom')}</option>
            <optgroup label={label('pagePaper')}>
              {Object.keys(DRAWING_PAGE_PRESETS).map(key => <option key={key} value={key}>{key}</option>)}
            </optgroup>
            <optgroup label={label('pageStock')}>
              {Object.keys(DRAWING_STOCK_PRESETS).map(key => <option key={key} value={key}>{key}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="drawing-cad-field"><span>{label('pageWidth')} (mm)</span>
          <input type="number" min={1} max={100000} step="any" required value={width} onChange={e => setWidth(e.target.value)} />
        </label>
        <label className="drawing-cad-field"><span>{label('pageHeight')} (mm)</span>
          <input type="number" min={1} max={100000} step="any" required value={height} onChange={e => setHeight(e.target.value)} />
        </label>
        <div className="drawing-cad-actions">
          <button type="button" onClick={() => { setWidth(height); setHeight(width); }}>{label('pageSwap')}</button>
          <button type="submit" disabled={!valid}>{label('pageApply')}</button>
          {size && <button type="button" onClick={() => report(saveDrawingPage(editor, name, null))}>{label('pageClear')}</button>}
          {multiple && <button type="button" disabled={count >= editor.options.maxPages}
            onClick={() => { if (!addDrawingPage(editor, label('pageNew'))) report(false); }}>{label('pageAdd')}</button>}
        </div>
      </fieldset>
    </form>
    {size && <button type="button" disabled={!canFit} onClick={() => { if (!fitDrawingPage(editor)) report(false); }}>{label('pageFit')}</button>}
    <p className="drawing-help">{label('pageHelp')}</p>
    {message && <p className="drawing-help" role={message === 'changedFailed' ? 'alert' : 'status'}>{label(message)}</p>}
  </details>;
}
