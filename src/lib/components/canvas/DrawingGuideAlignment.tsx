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
    return prepareArrangePlan(editor, { kind: 'align-guide', point, normal, alignment, together });
  }
  const ready = useValue('Guideline alignment readiness', () => {
    const result = { start: false, center: false, end: false, edgeUnsupported: false };
    if (!guide || busy) return result;
    for (const alignment of ['start', 'center', 'end'] as const) {
      try { result[alignment] = !!planFor(guide, alignment); }
      catch (error) { if ((error as { code?: string }).code === 'arrangeGuideGeometry') result.edgeUnsupported = true; }
    }
    return result;
  }, [editor, guide?.id, guide?.axis, guide?.position, guide?.pivot?.x, guide?.pivot?.y, guide?.angle, together, revision, readonly, busy]);
  if (!guide) return null;
  const alignmentLabels = guide.axis === 'x' ? ['alignLeft', 'alignCenterX', 'alignRight'] as const
    : guide.axis === 'y' ? ['alignTop', 'alignCenterY', 'alignBottom'] as const
      : ['alignStartGuide', 'alignCenterGuide', 'alignEndGuide'] as const;
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
    <label className="drawing-cad-check"><input type="checkbox" checked={together} disabled={readonly || busy} onChange={event => { setTogether(event.target.checked); setMessage(null); }}
      data-testid="drawing-guide-align-together" /><span>{t('keepTogether')}</span></label>
    <div className="drawing-guide-align-actions">
      {(['start', 'center', 'end'] as const).map((alignment, index) => <button key={alignment} type="button" disabled={!ready[alignment]}
        aria-describedby={guide.axis === 'angle' && alignment !== 'center' && ready.edgeUnsupported ? 'drawing-guide-edge-unavailable' : undefined}
        data-testid={`drawing-guide-align-${alignment}`} onClick={() => align(alignment)}>
        {t(alignmentLabels[index])}
      </button>)}
    </div>
    <p className="drawing-help">{t(guide.axis === 'angle' ? 'angledAlignmentHelp' : 'alignmentHelp')}</p>
    {guide.axis === 'angle' && <p className="drawing-help">{t('angledEdgeAlignmentHelp')}</p>}
    {ready.edgeUnsupported && <p className="drawing-help" id="drawing-guide-edge-unavailable">{t('angledEdgeUnsupported')}</p>}
    {!ready.start && !ready.center && !ready.end && !busy && <p className="drawing-help">{t('alignFailed')}</p>}
    {message && <p className={`drawing-help${message === 'alignFailed' ? ' is-error' : ''}`} role={message === 'alignFailed' ? 'alert' : 'status'}>{t(message)}</p>}
  </section>;
}
