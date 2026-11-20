import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadAdvancedText, type CadAdvancedLabel } from './cad-advanced-copy';
import { curveBounds, curvePathData } from './cad-curves';
import { applyNodeReduction, nodeReductionTolerance, prepareNodeReduction, type NodeReductionPlan } from './cad-node-reduction';
import { getSelectedCadNodes, setCadNodeEditing } from './cad-node-selection';
import type { CadSettings } from './cad-settings';

export function CadNodeReducePanel({ settings, revision, disabled, focusSequence }: {
  settings: CadSettings | null; revision: string; disabled: boolean; focusSequence?: number;
}) {
  const editor = useEditor(), { label } = useCadAdvancedText(), details = useRef<HTMLDetailsElement>(null), errorId = useId();
  const isCurve = useValue('CAD reduction source', () => editor.getOnlySelectedShape()?.type === 'cad-bezier', [editor]);
  const selected = useValue('CAD reduction selection', () => JSON.stringify(getSelectedCadNodes(editor)), [editor]);
  const hasNodes = selected !== '[]';
  const unit = settings ? 'mm' : 'px', { min, max } = nodeReductionTolerance(unit);
  const [physical, setPhysical] = useState('0.05'), [pixels, setPixels] = useState('0.2');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [review, setReview] = useState<NodeReductionPlan>();
  const [message, setMessage] = useState<CadAdvancedLabel>();
  const tolerance = settings ? physical : pixels, value = tolerance.trim() ? Number(tolerance) : NaN;
  const valid = Number.isFinite(value) && value >= min && value <= max;
  const stale = !!review && (review.revision !== revision || review.options.tolerance !== value ||
    review.options.selectedOnly !== selectedOnly || review.unit !== unit || JSON.stringify(review.selected) !== selected);
  const bounds = review ? curveBounds([...review.source, ...review.result]) : null;
  const padding = bounds ? Math.max(bounds.w, bounds.h, 1) * .05 : 0;

  useEffect(() => {
    if (!focusSequence || !details.current) return;
    details.current.open = true;
    details.current.querySelector('summary')?.focus();
    details.current.scrollIntoView?.({ block: 'nearest' });
  }, [focusSequence]);

  return <details ref={details} className="drawing-cad-section" data-testid="drawing-cad-node-reduce"
    onFocusCapture={() => setCadNodeEditing(editor, true)}>
    <summary>{label('reduceNodes')}</summary>
    {!isCurve ? <p className="drawing-help">{label('noCurve')}</p> : <>
      <p className="drawing-help">{label('reduceNodesHelp')}</p>
      <form onSubmit={event => {
        event.preventDefault();
        if (disabled || !valid || selectedOnly && !hasNodes) return;
        try { setReview(prepareNodeReduction(editor, { tolerance: value, selectedOnly })); setMessage(undefined); }
        catch (error) {
          setReview(undefined);
          const code = (error as { code?: string }).code;
          setMessage(code === 'unsupported' ? 'reduceClipped' : code === 'bound' ? 'bound' : 'failed');
        }
      }}>
        <fieldset className="drawing-cad-fields" disabled={disabled}>
          <label className="drawing-cad-field">
            <span>{label('reduceTolerance')} ({unit})</span>
            <input type="number" min={min} max={max} step="any" required value={tolerance}
              aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined}
              onChange={event => { (settings ? setPhysical : setPixels)(event.target.value); setMessage(undefined); }} />
          </label>
          {!valid && <p id={errorId} className="drawing-help is-error">{label('reduceToleranceRange')} {min}–{max} {unit}.</p>}
          <label className="drawing-cad-check">
            <input type="checkbox" checked={selectedOnly} onChange={event => { setSelectedOnly(event.target.checked); setMessage(undefined); }} />
            <span>{label('reduceSelected')}</span>
          </label>
          {selectedOnly && !hasNodes && <p className="drawing-help">{label('reduceSelectNodes')}</p>}
          <button type="submit" disabled={!valid || selectedOnly && !hasNodes}>{label('preview')}</button>
        </fieldset>
      </form>
      {review && bounds && <div className="drawing-cad-report" data-testid="drawing-node-reduction-review">
        <svg className="drawing-cad-preview" role="img" aria-label={label('reducePreview')}
          viewBox={[bounds.x - padding, bounds.y - padding, bounds.w + 2 * padding, bounds.h + 2 * padding].join(' ')}>
          <path d={curvePathData(review.source)} fill="none" stroke="currentColor" opacity={.4} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={curvePathData(review.result)} fill="none" stroke="var(--brand)" vectorEffect="non-scaling-stroke" />
        </svg>
        <dl className="drawing-cad-values">
          <dt>{label('nodeCount')}</dt><dd>{review.before} → {review.before - review.removed}</dd>
          <dt>{label('reduceErrorBound')}</dt><dd>≤ {Math.ceil(review.error * 1e6) / 1e6} {review.unit}</dd>
        </dl>
        {review.limited && <p className="drawing-help">{label('reduceLimited')}</p>}
        {!review.removed && <p className="drawing-help" role="status">{label('reduceNoChanges')}</p>}
        {stale && <p className="drawing-help" role="status">{label('stale')}</p>}
        <button type="button" disabled={disabled || stale || !review.removed} onClick={() => {
          const applied = applyNodeReduction(editor, review);
          setMessage(applied ? 'updated' : 'failed');
          if (applied) setReview(undefined);
        }}>{label('apply')}</button>
      </div>}
      {message && <p className={`drawing-help drawing-cad-message${message === 'updated' ? '' : ' is-error'}`}
        role={message === 'updated' ? 'status' : 'alert'}>{label(message)}</p>}
    </>}
  </details>;
}
