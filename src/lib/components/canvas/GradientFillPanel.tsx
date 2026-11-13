import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { curveBounds } from './cad-curves';
import { cadRevision } from './cad-plans';
import type { CadSettings } from './cad-settings';
import { VectorArtwork } from './VectorArtwork';
import {
  applyGradientFill,
  getGradientFillSettings,
  gradientFillSelection,
  prepareGradientFill,
  removeGradientFill,
  type GradientFillPlan,
  type GradientFillSettings,
} from './gradient-fill';
import { gradientFillError, useGradientFillText, type GradientFillLabel } from './gradient-fill-copy';

type Stop = { color: string; position: string };
type Draft = { type: GradientFillSettings['type']; angle: string; opacity: string; stops: Stop[] };
type Review = { plan: GradientFillPlan; key: string; name: string };
type Message = { key: GradientFillLabel; error?: boolean; revision?: string };
const MAX_STOPS = 256;
const number = (value: string) => value.trim() ? Number(value) : NaN;
const within = (value: string, min: number, max: number) => Number.isFinite(number(value)) && number(value) >= min && number(value) <= max;
const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

function draftFrom(settings: GradientFillSettings | null): Draft {
  return {
    type: settings?.type ?? 'linear',
    angle: String(settings?.angle ?? 0),
    opacity: String(settings?.opacity ?? 100),
    stops: (settings?.stops ?? [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }])
      .map(stop => ({ color: stop.color, position: String(stop.offset * 100) })),
  };
}

function addStop(stops: Stop[]): Stop[] {
  let index = 0;
  for (let i = 1; i < stops.length - 1; i++) {
    if (number(stops[i + 1].position) - number(stops[i].position) > number(stops[index + 1].position) - number(stops[index].position)) index = i;
  }
  const left = stops[index], right = stops[index + 1];
  const color = '#' + [1, 3, 5].map(channel =>
    Math.round((parseInt(left.color.slice(channel, channel + 2), 16) + parseInt(right.color.slice(channel, channel + 2), 16)) / 2).toString(16).padStart(2, '0')
  ).join('');
  return [...stops.slice(0, index + 1), { color, position: String((number(left.position) + number(right.position)) / 2) }, ...stops.slice(index + 1)];
}

/** Shared fill controls for the order drawing and the standalone workbench. */
export function GradientFillPanel({ settings, revision, disabled }: { settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), t = useGradientFillText(), id = useId();
  const selection = useValue('gradient fill selection', () => gradientFillSelection(editor), [editor]);
  const selectedId = useValue('gradient selected shape', () => editor.getOnlySelectedShape()?.id, [editor]);
  const readonly = useValue('gradient readonly', () => editor.getInstanceState().isReadonly, [editor]);
  const savedPaint = useValue('saved gradient paint', () => {
    const shape = editor.getOnlySelectedShape();
    return JSON.stringify([shape?.meta.omsVectorPaint, (shape?.props as { color?: string } | undefined)?.color]);
  }, [editor]);
  const previousSelection = useRef(selectedId);
  const hydratedPaint = useRef<string>();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(getGradientFillSettings(editor)));
  const [review, setReview] = useState<Review>();
  const [message, setMessage] = useState<Message>();

  useEffect(() => {
    // Geometry, document units and unrelated changes only stale the review.
    // Hydrate the controls when the selected object's actual paint changes.
    if (previousSelection.current !== selectedId) {
      setMessage(undefined);
      setReview(undefined);
    }
    previousSelection.current = selectedId;
    const paintKey = JSON.stringify([selectedId, savedPaint]);
    if (hydratedPaint.current === paintKey) return;
    const current = getGradientFillSettings(editor);
    setDraft(draftFrom(current));
    setReview(undefined);
    // An initially locked curve is hydrated when it becomes editable. Toggling
    // locks after hydration preserves the user's existing draft.
    hydratedPaint.current = current ? paintKey : undefined;
  }, [editor, selectedId, savedPaint, selection?.id]);

  const validAngle = draft.type === 'radial' || within(draft.angle, -360, 360);
  const validOpacity = within(draft.opacity, 0, 100);
  const positions = draft.stops.map(stop => number(stop.position));
  const validPositions = positions.map((position, index) => Number.isFinite(position) && position >= 0 && position <= 100 &&
    (index === 0 ? position === 0 : position > positions[index - 1]) &&
    (index === positions.length - 1 ? position === 100 : position < positions[index + 1]));
  const validStops = draft.stops.length >= 2 && draft.stops.length <= MAX_STOPS &&
    validPositions.every(Boolean) && draft.stops.every(stop => validColor(stop.color));
  const valid = validAngle && validOpacity && validStops;
  const available = !disabled && !readonly && !!selection;
  const inputKey = JSON.stringify([revision, settings, selectedId, draft]);
  const stale = !!review && (!available || review.key !== inputKey || review.plan.revision !== revision || review.plan.shapeId !== selectedId);
  const bounds = review ? curveBounds(review.plan.contours) : null;
  const padding = bounds ? Math.max(bounds.w, bounds.h, 1) * 0.05 : 0;

  function canEdit() {
    return !disabled && !editor.getInstanceState().isReadonly && !!selectedId && gradientFillSelection(editor)?.id === selectedId;
  }

  function change(update: (current: Draft) => Draft) {
    if (!canEdit()) return;
    setDraft(update);
    setMessage(undefined);
  }

  return <details className="drawing-cad-section" data-testid="gradient-fill-section">
    <summary>{t('title')}</summary>
    <fieldset className="drawing-cad-fields" disabled={!available} aria-describedby={`${id}-help`} data-testid="gradient-fill">
      <legend className="drawing-cad-preview-title">{t('title')}</legend>
      {readonly ? <p className="drawing-help">{t('readonly')}</p> : !selection && <p className="drawing-help">{t('selectionHelp')}</p>}
      <p id={`${id}-help`} className="drawing-help">{t('help')}</p>
      {selection?.hasTexture && <p className="drawing-help">{t('replaceTexture')}</p>}
      <label className="drawing-cad-field">
        <span>{t('type')}</span>
        <select value={draft.type} data-testid="gradient-fill-type" onChange={event => {
          const type = event.target.value as GradientFillSettings['type'];
          change(current => ({ ...current, type }));
        }}>
          <option value="linear">{t('linear')}</option>
          <option value="radial">{t('radial')}</option>
        </select>
      </label>
      {draft.type === 'linear' && <label className="drawing-cad-field">
        <span>{t('angle')}</span>
        <input type="number" min="-360" max="360" step="any" value={draft.angle} aria-invalid={!validAngle} aria-describedby={!validAngle ? `${id}-invalid` : `${id}-help`} data-testid="gradient-fill-angle" onChange={event => {
          const angle = event.target.value;
          change(current => ({ ...current, angle }));
        }} />
      </label>}
      <label className="drawing-cad-field">
        <span>{t('opacity')}</span>
        <input type="number" min="0" max="100" step="any" value={draft.opacity} aria-invalid={!validOpacity} aria-describedby={!validOpacity ? `${id}-invalid` : undefined} data-testid="gradient-fill-opacity" onChange={event => {
          const opacity = event.target.value;
          change(current => ({ ...current, opacity }));
        }} />
      </label>
      <p id={`${id}-stops-help`} className="drawing-help">{t('stopsHelp')}</p>
      {draft.stops.map((stop, index) => <fieldset key={index} className="drawing-cad-fields" aria-describedby={`${id}-stops-help`}>
        <legend className="drawing-cad-preview-title">{t('stop')} {index + 1}</legend>
        <label className="drawing-cad-field">
          <span>{t('color')}</span>
          <input type="color" value={stop.color} aria-label={`${t('color')} ${index + 1}`} data-testid={`gradient-fill-color-${index}`} onChange={event => {
            const color = event.target.value;
            change(current => ({ ...current, stops: current.stops.map((item, i) => i === index ? { ...item, color } : item) }));
          }} />
        </label>
        <label className="drawing-cad-field">
          <span>{t('position')}</span>
          <input type="number" min="0" max="100" step="any" value={stop.position} disabled={index === 0 || index === draft.stops.length - 1} aria-label={`${t('stop')} ${index + 1} · ${t('position')}`} aria-invalid={!validPositions[index]} aria-describedby={!validPositions[index] ? `${id}-invalid` : `${id}-stops-help`} data-testid={`gradient-fill-position-${index}`} onChange={event => {
            const position = event.target.value;
            if (index === 0 || index === draft.stops.length - 1) return;
            change(current => ({ ...current, stops: current.stops.map((item, i) => i === index ? { ...item, position } : item) }));
          }} />
        </label>
        {index > 0 && index < draft.stops.length - 1 && <div className="drawing-cad-actions">
          <button type="button" aria-label={`${t('removeStop')} ${index + 1}`} data-testid={`gradient-fill-remove-stop-${index}`} onClick={() => change(current => ({ ...current, stops: current.stops.filter((_, i) => i !== index) }))}>{t('removeStop')}</button>
        </div>}
      </fieldset>)}
      <div className="drawing-cad-actions">
        <button type="button" disabled={!validStops || draft.stops.length >= MAX_STOPS} data-testid="gradient-fill-add" onClick={() => {
          if (!validStops || draft.stops.length >= MAX_STOPS) return;
          change(current => ({ ...current, stops: addStop(current.stops) }));
        }}>{t('add')}</button>
        <button type="button" disabled={!validStops} data-testid="gradient-fill-reverse" onClick={() => {
          if (!validStops) return;
          change(current => ({ ...current, stops: [...current.stops].reverse().map(stop => ({ ...stop, position: String(100 - number(stop.position)) })) }));
        }}>{t('reverse')}</button>
      </div>
      {!valid && <p id={`${id}-invalid`} className="drawing-help drawing-cad-message is-error" role="alert">{t('geometry')}</p>}
      <div className="drawing-cad-actions">
        <button type="button" disabled={!valid} data-testid="gradient-fill-review" onClick={() => {
          if (!canEdit() || !valid || !selection) return;
          setMessage(undefined);
          try {
            const plan = prepareGradientFill(editor, {
              type: draft.type, angle: draft.type === 'linear' ? number(draft.angle) : 0, opacity: number(draft.opacity),
              stops: draft.stops.map(stop => ({ color: stop.color, offset: number(stop.position) / 100 })),
            });
            setReview({ plan, key: inputKey, name: selection.name });
          } catch (error) {
            setReview(undefined);
            setMessage({ key: gradientFillError(error), error: true });
          }
        }}>{t('review')}</button>
        <button type="button" disabled={!selection?.hasGradient} data-testid="gradient-fill-remove" onClick={() => {
          if (!canEdit() || !gradientFillSelection(editor)?.hasGradient) return;
          setMessage(undefined);
          try {
            if (!removeGradientFill(editor)) throw new Error('gradient-failed');
            setReview(undefined);
            setMessage({ key: 'removed', revision: cadRevision(editor) });
          } catch (error) {
            setMessage({ key: gradientFillError(error), error: true });
          }
        }}>{t('remove')}</button>
      </div>
      <p className="drawing-help">{t('clearHelp')}</p>
      {review && bounds && <div className="drawing-cad-report" data-testid="gradient-fill-preview">
        <div className="drawing-vector-comparison"><figure>
          <figcaption>{t('preview')} · {review.name}</figcaption>
          <svg role="img" aria-label={t('preview')} viewBox={`${bounds.x - padding} ${bounds.y - padding} ${Math.max(bounds.w, 1) + padding * 2} ${Math.max(bounds.h, 1) + padding * 2}`}>
            <VectorArtwork id={`${id}-gradient-preview`} contours={review.plan.contours} fillRule={review.plan.fillRule} paint={review.plan.paint} />
          </svg>
        </figure></div>
        {stale && <p className="drawing-help drawing-cad-message" role="status">{t('stale')}</p>}
        <button type="button" disabled={stale || !valid} data-testid="gradient-fill-apply" onClick={() => {
          if (!canEdit() || stale || !valid) return;
          setMessage(undefined);
          try {
            if (review.plan.revision !== cadRevision(editor)) throw new Error('stale');
            if (!applyGradientFill(editor, review.plan)) throw new Error('gradient-failed');
            setReview(undefined);
            setMessage({ key: 'done', revision: cadRevision(editor) });
          } catch (error) {
            setMessage({ key: gradientFillError(error), error: true });
          }
        }}>{t('apply')}</button>
      </div>}
      {message && (!message.revision || message.revision === revision) && <p className={`drawing-help drawing-cad-message${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{t(message.key)}</p>}
    </fieldset>
  </details>;
}
