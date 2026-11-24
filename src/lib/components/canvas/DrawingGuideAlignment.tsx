import React, { useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { applyArrangePlan, prepareArrangePlan } from './drawing-arrange';
import { cadRevision } from './cad-plans';
import { drawingGuidesBusy, readDrawingGuides, type DrawingGuide } from './drawing-guides';
import { useGuideText } from './guide-copy';

export function DrawingGuideAlignment({ guide }: { guide: DrawingGuide | null }) {
  const editor = useEditor(), t = useGuideText();
  const [together, setTogether] = useState(true);
  const [message, setMessage] = useState<'aligned' | 'alignFailed' | 'busy' | null>(null);
  const revision = useValue('Guideline alignment selection', () => cadRevision(editor), [editor]);
  const readonly = useValue('Guideline alignment readonly', () => editor.getInstanceState().isReadonly, [editor]);
  const busy = drawingGuidesBusy(editor);
  const ready = useValue('Guideline alignment readiness', () => {
    if (!guide || guide.axis === 'angle' || busy) return false;
    try { return !!prepareArrangePlan(editor, { kind: 'align', axis: guide.axis, alignment: 'center', reference: { position: guide.position, together } }); }
    catch { return false; }
  }, [editor, guide?.id, guide?.axis, guide?.position, together, revision, readonly, busy]);
  if (!guide || guide.axis === 'angle') return null;
  const alignmentLabels = guide.axis === 'x' ? ['alignLeft', 'alignCenterX', 'alignRight'] as const
    : ['alignTop', 'alignCenterY', 'alignBottom'] as const;
  function align(alignment: 'start' | 'center' | 'end') {
    if (drawingGuidesBusy(editor)) { setMessage('busy'); return; }
    const current = readDrawingGuides(editor).guides.find(item => item.id === guide!.id);
    if (!current || current.axis === 'angle' || current.axis !== guide!.axis || current.position !== guide!.position || cadRevision(editor) !== revision) { setMessage('alignFailed'); return; }
    try {
      const plan = prepareArrangePlan(editor, { kind: 'align', axis: current.axis, alignment, reference: { position: current.position, together } });
      setMessage(applyArrangePlan(editor, plan) ? 'aligned' : 'alignFailed');
    } catch { setMessage('alignFailed'); }
  }
  return <section className="drawing-guide-alignment" data-testid="drawing-guide-alignment">
    <h3>{t('alignTitle')}</h3>
    <label className="drawing-cad-check"><input type="checkbox" checked={together} onChange={event => { setTogether(event.target.checked); setMessage(null); }}
      data-testid="drawing-guide-align-together" /><span>{t('keepTogether')}</span></label>
    <div className="drawing-guide-align-actions">
      {(['start', 'center', 'end'] as const).map((alignment, index) => <button key={alignment} type="button" disabled={!ready}
        data-testid={`drawing-guide-align-${alignment}`} onClick={() => align(alignment)}>
        {t(alignmentLabels[index])}
      </button>)}
    </div>
    <p className="drawing-help">{t('alignmentHelp')}</p>
    {!ready && !busy && <p className="drawing-help">{t('alignFailed')}</p>}
    {message && <p className={`drawing-help${message === 'alignFailed' ? ' is-error' : ''}`} role={message === 'alignFailed' ? 'alert' : 'status'}>{t(message)}</p>}
  </section>;
}
