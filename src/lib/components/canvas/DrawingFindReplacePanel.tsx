import { fitDrawingSelection } from './drawing-camera';
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { applyDrawingTextReplacement, drawingTextSearchRevision, prepareDrawingTextSearch,
  type DrawingTextSearchError, type DrawingTextSearchOptions, type DrawingTextSearchPlan } from './drawing-find-replace';
import { useFindReplaceText } from './find-replace-copy';

type Session = { options: DrawingTextSearchOptions; plan?: DrawingTextSearchPlan; checked: TLShapeId[] };
const sessions = new WeakMap<Editor, Session>();
const defaults: DrawingTextSearchOptions = { query: '', replacement: '', matchCase: false, wholeWord: false, scope: 'page' };
const excerpt = (text: string) => text.length > 180 ? text.slice(0,180) + '…' : text;
export function DrawingFindReplacePanel({ focusRequest = 0 }: { focusRequest?: number }) {
  const editor = useEditor(), t = useFindReplaceText();
  const session = sessions.get(editor);
  const [options,setOptions] = useState<DrawingTextSearchOptions>(() => session?.options ?? defaults);
  const [plan,setPlan] = useState<DrawingTextSearchPlan | undefined>(() => session?.plan);
  const [checked,setChecked] = useState<TLShapeId[]>(() => session?.checked ?? []);
  const [message,setMessage] = useState<{ key: DrawingTextSearchError | 'applied' | 'unchanged'; count?: number }>();
  const section = useRef<HTMLDetailsElement>(null), input = useRef<HTMLInputElement>(null);
  const state = useValue('drawing text search state', () => ({
    revision: drawingTextSearchRevision(editor), readOnly: editor.getInstanceState().isReadonly,
  }), [editor]);
  useEffect(() => { sessions.set(editor, { options, plan, checked }); }, [editor, options, plan, checked]);
  useEffect(() => {
    if (!focusRequest) return;
    if (section.current) section.current.open = true;
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); section.current?.scrollIntoView({ block: 'nearest' }); });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const stale = !!plan && (plan.revision !== state.revision || JSON.stringify(plan.options) !== JSON.stringify(options));
  const update = (patch: Partial<DrawingTextSearchOptions>) => { setOptions(previous => ({ ...previous, ...patch })); setMessage(undefined); };
  const replace = (ids?: TLShapeId[]) => {
    if (!plan || stale) return;
    const result = applyDrawingTextReplacement(editor,plan,ids);
    if (result.ok === true) {
      setMessage({ key: result.value ? 'applied' : 'unchanged', count: result.value });
      setPlan(undefined); setChecked([]);
    } else setMessage({ key: result.error });
  };
  const count = (key: 'summary' | 'applied' | 'checked', value: number) => t(key).replace('{count}',String(value));
  return <details ref={section} className="drawing-shortcuts drawing-find-replace" data-testid="drawing-find-replace">
    <summary>{t('title')}</summary>
    <p className="drawing-help">{t('hint')}</p>
    <form onSubmit={event => {
      event.preventDefault(); setMessage(undefined);
      const result = prepareDrawingTextSearch(editor,options);
      if (result.ok === true) { setPlan(result.value); setChecked(result.value.matches.filter(match => !match.protected).map(match => match.id)); }
      else { setPlan(undefined); setChecked([]); setMessage({ key: result.error }); }
    }}>
      <div className="drawing-style-fields">
        <label><span>{t('find')}</span><input ref={input} value={options.query} maxLength={256} required
          onChange={event => update({ query: event.target.value })}/></label>
        <label><span>{t('replacement')}</span><textarea rows={2} value={options.replacement} maxLength={10000}
          onChange={event => update({ replacement: event.target.value })}/></label>
        <label><span>{t('scope')}</span><select value={options.scope} onChange={event => update({ scope: event.target.value as DrawingTextSearchOptions['scope'] })}>
          <option value="page">{t('page')}</option><option value="selection">{t('selection')}</option>
        </select></label>
        <label><input type="checkbox" checked={options.matchCase} onChange={event => update({ matchCase: event.target.checked })}/><span>{t('matchCase')}</span></label>
        <label><input type="checkbox" checked={options.wholeWord} onChange={event => update({ wholeWord: event.target.checked })}/><span>{t('wholeWord')}</span></label>
        <button type="submit" disabled={!options.query.length}>{t('search')}</button>
      </div>
    </form>
    {state.readOnly && <p className="drawing-help">{t('readOnly')}</p>}
    {plan && <div className="drawing-cad-report">
      <p role="status">{plan.matches.length ? count('summary',plan.occurrences).replace('{objects}',String(plan.matches.length)) : t('noMatches')}</p>
      {stale && <p role="status">{t('stale')}</p>}
      {!!plan.matches.length && <>
        <div className="drawing-arrange">
          <button type="button" onClick={() => setChecked(plan.matches.filter(match => !match.protected).map(match => match.id))}>{t('checkAll')}</button>
          <button type="button" onClick={() => setChecked([])}>{t('clear')}</button>
        </div>
        <div className="drawing-text-search-results" style={{ maxHeight: '22rem', overflowY: 'auto' }}>
          {plan.matches.map(match => <div key={match.id} className="drawing-cad-section">
            <label><input type="checkbox" checked={checked.includes(match.id)} disabled={match.protected}
              onChange={event => setChecked(previous => event.target.checked ? [...previous,match.id] : previous.filter(id => id !== match.id))}/>{match.name || t('emptyText')}</label>
            <button type="button" disabled={stale} onClick={() => {
              const shape = editor.getShape(match.id);
              if (!shape || plan.revision !== drawingTextSearchRevision(editor)) return;
              editor.complete(); editor.setCurrentTool('select');
              if (plan.revision !== drawingTextSearchRevision(editor)) return;
              editor.setSelectedShapes([match.id]); fitDrawingSelection(editor); editor.focus();
            }}>{t('locate')}</button>
            <p className="drawing-help">{match.occurrences} {t('matches')}{match.protected ? ' · ' + t('locked') : ''}</p>
            <p className="drawing-help"><strong>{t('before')}:</strong> <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{excerpt(match.before) || t('emptyText')}</span></p>
            <p className="drawing-help"><strong>{t('after')}:</strong> <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{excerpt(match.after) || t('emptyText')}</span></p>
          </div>)}
        </div>
        <p className="drawing-help">{count('checked',checked.length)}</p>
        <div className="drawing-arrange">
          <button type="button" disabled={state.readOnly || stale || !checked.length} onClick={() => replace(checked)}>{t('replaceChecked')}</button>
          <button type="button" disabled={state.readOnly || stale || plan.matches.some(match => match.protected)} onClick={() => replace()}>{t('replaceAll')}</button>
        </div>
        {plan.matches.some(match => match.protected) && <p className="drawing-help">{t('lockedHelp')}</p>}
      </>}
    </div>}
    {message && <p className="drawing-help" role="status">{message.key === 'applied' ? count('applied',message.count!) : t(message.key)}</p>}
    <p className="drawing-help">{t('limits')}</p>
  </details>;
}
