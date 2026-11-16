import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { applySelectSame, inspectSelectSameReference, prepareSelectSame, selectSameRevision, type SelectSameFields, type SelectSamePlan, type SelectSameError } from './drawing-select-same';
import { useSelectSameText } from './select-same-copy';

export function DrawingSelectSamePanel({ focusRequest = 0 }: { focusRequest?: number }) {
  const editor = useEditor(), label = useSelectSameText(), panel = useRef<HTMLDetailsElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<SelectSameFields>({ type: true, fill: false, outline: false, opacity: false });
  const [plan, setPlan] = useState<SelectSamePlan>(), [notice, setNotice] = useState<SelectSameError | 'selected' | ''>('');
  const [count, setCount] = useState(0);
  const revision = useValue('select same revision', () => plan ? selectSameRevision(editor) : '', [editor, !!plan]);
  const available = useValue('select same availability', () => inspectSelectSameReference(editor, fields), [editor, fields]);
  const stale = !!plan && (plan.revision !== revision || JSON.stringify(plan.fields) !== JSON.stringify(fields));
  useEffect(() => {
    if (!focusRequest) return;
    if (panel.current) panel.current.open = true;
    first.current?.focus();
  }, [focusRequest]);
  return <details className="drawing-shortcuts drawing-select-same" ref={panel} data-testid="drawing-select-same">
    <summary>{label('title')}</summary>
    <p className="drawing-help">{label('hint')}</p>
    <fieldset className="drawing-style-fields">
      <legend>{label('criteria')}</legend>
      {(['type', 'fill', 'outline', 'opacity'] as const).map((key, index) => <label key={key}>
        <input ref={index === 0 ? first : undefined} type="checkbox" checked={fields[key]}
          onChange={event => { setFields(current => ({ ...current, [key]: event.target.checked })); setNotice(''); }}/>
        <span>{label(key)}</span>
      </label>)}
    </fieldset>
    <div className="drawing-arrange"><button type="button" disabled={!available.ok} onClick={() => {
      const result = prepareSelectSame(editor, fields); setNotice('');
      if (result.ok) setPlan(result.value); else { setPlan(undefined); setNotice(result.error); }
    }}>{label('preview')}</button></div>
    {!available.ok && (!plan || stale) && <p className="drawing-help">{label(available.error)}</p>}
    {plan && <div className="drawing-cad-report">
      <p>{label('matches').replace('{count}', String(plan.ids.length)).replace('{total}', String(plan.inspected))}</p>
      <p className="drawing-help">{label('reviewHint')}</p>
      {stale && <p role="status">{label('changed')}</p>}
      <div className="drawing-arrange">{(['replace', 'add'] as const).map(mode => <button key={mode} type="button" disabled={stale} onClick={() => {
        const result = applySelectSame(editor, plan, mode);
        if (result.ok) { setCount(result.value); setNotice('selected'); setPlan(undefined); }
        else setNotice(result.error);
      }}>{label(mode)}</button>)}</div>
    </div>}
    {notice && <p className="drawing-help" role="status">{label(notice).replace('{count}', String(count))}</p>}
    <p className="drawing-help">{label('limits')}</p>
  </details>;
}
