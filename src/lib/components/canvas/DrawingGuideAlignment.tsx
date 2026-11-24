import React, { useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { applyArrangePlan, prepareArrangePlan } from './drawing-arrange';
import { cadRevision } from './cad-plans';
import { drawingGuideLine, drawingGuidesBusy, readDrawingGuides, type DrawingGuide } from './drawing-guides';
import { useGuideText } from './guide-copy';

export function DrawingGuideAlignment({ guide }: { guide: DrawingGuide | null }) {
  const editor = useEditor(), t = useGuideText();
  const [together, setTogether] = useState(true);
  const [message, setMessage] = useState<'aligned' | 'alignFailed' | 'busy' | null>(null);
  const revision = useValue('Guideline alignment selection', () => cadRevision(editor), [editor]);
  const readonly = useValue('Guideline alignment readonly', () => editor.getInstanceState().isReadonly, [editor]);
  const busy = drawingGuidesBusy(editor);
  function planFor(current: DrawingGuide, alignment: 'start' | 'center' | 'end' = 'center') {
    if (current.axis !== 'angle') return prepareArrangePlan(editor, { kind: 'align', axis: current.axis, alignment, reference: { position: current.position, together } });
    const { point, normal } = drawingGuideLine(current);
    return prepareArrangePlan(editor, { kind: 'align-guide', point, normal, together });
  }
  const ready = useValue('Guideline alignment readiness', () => {
    if (!guide || busy) return false;
    try { return !!planFor(guide); }
    catch { return false; }
  }, [editor, guide?.id, guide?.axis, guide?.position, guide?.pivot?.x, guide?.pivot?.y, guide?.angle, together, revision, readonly, busy]);
  if (!guide) return null;
  const alignmentLabels = guide.axis === 'x' ? ['alignLeft', 'alignCenterX', 'alignRight'] as const
    : ['alignTop', 'alignCenterY', 'alignBottom'] as const;
  function align(alignment: 'start' | 'center' | 'end') {
    if (drawingGuidesBusy(editor)) { setMessage('busy'); return; }
    const current = readDrawingGuides(editor).guides.find(item => item.id === guide!.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(guide) || cadRevision(editor) !== revision) { setMessage('alignFailed'); return; }
    try {
      const plan = planFor(current, alignment);
      setMessage(applyArrangePlan(editor, plan) ? 'aligned' : 'alignFailed');
    } catch { setMessage('alignFailed'); }
  }
  return <section className="drawing-guide-alignment" data-testid="drawing-guide-alignment">
    <h3>{t('alignTitle')}</h3>
    <label className="drawing-cad-check"><input type="checkbox" checked={together} onChange={event => { setTogether(event.target.checked); setMessage(null); }}
      data-testid="drawing-guide-align-together" /><span>{t('keepTogether')}</span></label>
    <div className={`drawing-guide-align-actions${guide.axis === 'angle' ? ' is-angle' : ''}`}>
      {(guide.axis === 'angle' ? ['center'] as const : ['start', 'center', 'end'] as const).map((alignment, index) => <button key={alignment} type="button" disabled={!ready}
        data-testid={`drawing-guide-align-${alignment}`} onClick={() => align(alignment)}>
        {t(guide.axis === 'angle' ? 'alignCenterGuide' : alignmentLabels[index])}
      </button>)}
    </div>
    <p className="drawing-help">{t(guide.axis === 'angle' ? 'angledAlignmentHelp' : 'alignmentHelp')}</p>
    {!ready && !busy && <p className="drawing-help">{t('alignFailed')}</p>}
    {message && <p className={`drawing-help${message === 'alignFailed' ? ' is-error' : ''}`} role={message === 'alignFailed' ? 'alert' : 'status'}>{t(message)}</p>}
  </section>;
}
