import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { applyDrawingAppearance, canCopyDrawingAppearance, copyDrawingAppearance, getDrawingAppearance,
  inspectDrawingAppearanceTargets, subscribeDrawingAppearance, type DrawingAppearanceFields, type DrawingAppearanceError } from './drawing-appearance';
import { useAppearanceText } from './appearance-copy';

export function DrawingAppearancePanel({ focusRequest }: { focusRequest?: number }) {
  const editor = useEditor(), label = useAppearanceText(), panel = useRef<HTMLDetailsElement>(null);
  const subscribe = useCallback((notify: () => void) => subscribeDrawingAppearance(editor, notify), [editor]);
  const snapshot = useCallback(() => getDrawingAppearance(editor), [editor]);
  const source = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [fields, setFields] = useState<DrawingAppearanceFields>({ fill: true, outline: true, opacity: true });
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<DrawingAppearanceError | 'copied' | 'applied' | 'unchanged' | null>(null);
  useEffect(() => { if (source) { setFields({ ...source.available }); setNotice('copied'); } }, [source]);
  useEffect(() => {
    if (!focusRequest) return;
    setExpanded(true);
    const frame = requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ block: 'nearest' });
      (panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? panel.current?.querySelector('summary'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const state = useValue('drawing appearance', () => ({ canCopy: canCopyDrawingAppearance(editor),
    targets: inspectDrawingAppearanceTargets(editor, fields) }), [editor, source, fields]);
  return <details ref={panel} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}
    className="drawing-shortcuts drawing-appearance" data-testid="drawing-appearance-panel">
    <summary>{label('title')}</summary>
    <p className="drawing-help">{label('hint')}</p>
    <div className="drawing-arrange"><button type="button" disabled={!state.canCopy} onClick={() => {
      const result = copyDrawingAppearance(editor); setNotice(result.ok === true ? 'copied' : result.error);
    }}>{label('copy')}</button></div>
    {source && <p className="drawing-help"><strong>{label('source')}:</strong> {source.name} · {label(source.kind)}</p>}
    <fieldset className="drawing-style-fields" disabled={!source}>
      <legend>{label('title')}</legend>
      {(['fill', 'outline', 'opacity'] as const).map(key => <label key={key}>
        <input type="checkbox" checked={fields[key]} disabled={!source?.available[key]} onChange={event => {
          setFields(previous => ({ ...previous, [key]: event.target.checked })); setNotice(null);
        }}/><span>{label(key)}</span>
      </label>)}
    </fieldset>
    <p className="drawing-help">{state.targets.ok === true ? label('targetCount').replace('{count}', String(state.targets.count)) : label(!source && !state.canCopy ? 'sourceRequired' : state.targets.error)}</p>
    <div className="drawing-arrange"><button type="button" disabled={!state.targets.ok} onClick={() => {
      const result = applyDrawingAppearance(editor, fields);
      setNotice(result.ok === true ? result.count ? 'applied' : 'unchanged' : result.error);
    }}>{label('apply')}</button></div>
    {notice && <p className="drawing-help" role="status">{label(notice)}</p>}
    <p className="drawing-help">{label('limits')}</p>
  </details>;
}
