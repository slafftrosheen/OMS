import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { curveBounds } from './cad-curves';
import { cadRevision } from './cad-plans';
import { VectorArtwork } from './VectorArtwork';
import {
  applyMaterialTexture,
  getMaterialTextureDraft,
  materialTextureSelection,
  prepareMaterialTexture,
  readMaterialTexture,
  removeMaterialTexture,
  type MaterialTextureDraft,
  type MaterialTexturePlan,
} from './material-texture';
import { materialTextureError, useMaterialTextureText, type MaterialTextureLabel } from './material-texture-copy';

type Draft = { value: MaterialTextureDraft; shapeId: string; version: number };
type Review = { plan: MaterialTexturePlan; key: string };
type Message = { key: MaterialTextureLabel; error?: boolean };
const number = (value: string) => value.trim() ? Number(value) : NaN;
const within = (value: string, min: number, max: number) => Number.isFinite(number(value)) && number(value) >= min && number(value) <= max;

/** Material visualization shares the paint controls in both drawing hosts. */
export function MaterialTexturePanel({ revision, disabled }: { revision: string; disabled: boolean }) {
  const editor = useEditor(), t = useMaterialTextureText(), id = useId();
  const selection = useValue('material texture selection', () => materialTextureSelection(editor), [editor]);
  const selectedId = selection?.id;
  const materialState = useValue('saved material texture', () => {
    const shape = editor.getOnlySelectedShape(), paint = shape?.meta.omsVectorPaint as any;
    return JSON.stringify([paint?.raster, paint?.fillOpacity, shape?.meta.omsMaterialTexture]);
  }, [editor]);
  const previousSelection = useRef(selectedId);
  const [draft, setDraft] = useState<Draft>();
  const [sourceName, setSourceName] = useState('');
  const [scale, setScale] = useState('100'), [angle, setAngle] = useState('0'), [opacity, setOpacity] = useState('100');
  const [review, setReview] = useState<Review>();
  const [message, setMessage] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftVersion = useRef(0);
  const work = useRef<{ controller: AbortController; revision: string }>();

  useEffect(() => {
    work.current?.controller.abort();
    work.current = undefined;
    setBusy(false);
    setReview(undefined);
    if (previousSelection.current !== selectedId) setMessage(undefined);
    previousSelection.current = selectedId;
    setSourceName('');
    if (fileInput.current) fileInput.current.value = '';
    const current = selectedId ? getMaterialTextureDraft(editor) : null;
    setDraft(current ? { value: current.draft, shapeId: selectedId, version: ++draftVersion.current } : undefined);
    setScale(String(current?.scale ?? 100));
    setAngle(String(current?.angle ?? 0));
    setOpacity(String(current?.opacity ?? 100));
  }, [editor, selectedId, materialState]);

  useEffect(() => {
    if (work.current && (disabled || work.current.revision !== revision)) {
      work.current.controller.abort();
      work.current = undefined;
      setBusy(false);
      setMessage({ key: 'stale', error: true });
    }
  }, [disabled, revision]);

  useEffect(() => () => {
    work.current?.controller.abort();
    work.current = undefined;
  }, []);

  const validScale = within(scale, 100, 2000), validAngle = within(angle, -360, 360), validOpacity = within(opacity, 0, 100);
  const valid = validScale && validAngle && validOpacity;
  const available = !disabled && !!selection;
  const hasDraft = !!draft && draft.shapeId === selectedId;
  const inputKey = JSON.stringify([revision, selectedId, draft?.version, scale, angle, opacity]);
  const stale = !!review && (review.key !== inputKey || review.plan.revision !== revision);
  const bounds = review ? curveBounds(review.plan.contours) : null;
  const padding = bounds ? Math.max(bounds.w, bounds.h, 1) * 0.05 : 0;

  async function load(file: File) {
    work.current?.controller.abort();
    work.current = undefined;
    setDraft(undefined);
    setReview(undefined);
    setMessage(undefined);
    setSourceName(file.name);
    setScale('100');
    setAngle('0');
    setOpacity('100');
    if (!available || !selectedId) return;
    const request = { controller: new AbortController(), revision: cadRevision(editor) };
    work.current = request;
    setBusy(true);
    try {
      const value = await readMaterialTexture(editor, file, request.controller.signal);
      if (work.current !== request || request.controller.signal.aborted) return;
      if (cadRevision(editor) !== request.revision || materialTextureSelection(editor)?.id !== selectedId) throw new Error('stale');
      setDraft({ value, shapeId: selectedId, version: ++draftVersion.current });
      setMessage({ key: 'ready' });
    } catch (error) {
      if (work.current === request) setMessage({ key: request.controller.signal.aborted ? 'cancelled' : materialTextureError(error), error: !request.controller.signal.aborted });
    } finally {
      if (work.current === request) {
        work.current = undefined;
        setBusy(false);
      }
    }
  }

  return <fieldset className="drawing-cad-fields" disabled={!available} aria-describedby={`${id}-help`} data-testid="material-texture">
    <legend className="drawing-cad-preview-title">{t('title')}</legend>
    {!selection && <p className="drawing-help">{t('selectionHelp')}</p>}
    <p id={`${id}-help`} className="drawing-help">{t('help')}</p>
    <label className="drawing-cad-field">
      <span>{t('file')}</span>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${id}-file-help`} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void load(file);
      }} />
    </label>
    <p id={`${id}-file-help`} className="drawing-help">{t('fileHelp')}</p>
    {(sourceName || hasDraft) && <p className="drawing-help">{sourceName || t('existing')}</p>}
    {busy && <div className="drawing-cad-actions">
      <p className="drawing-help" role="status">{t('loading')}</p>
      <button type="button" onClick={() => {
        work.current?.controller.abort();
        work.current = undefined;
        setBusy(false);
        setMessage({ key: 'cancelled' });
      }}>{t('cancel')}</button>
    </div>}
    <label className="drawing-cad-field">
      <span>{t('scale')}</span>
      <input type="number" min="100" max="2000" step="any" value={scale} disabled={busy} aria-invalid={!validScale} aria-describedby={!validScale ? `${id}-invalid` : undefined} onChange={event => { setScale(event.target.value); setMessage(undefined); }} />
    </label>
    <label className="drawing-cad-field">
      <span>{t('angle')}</span>
      <input type="number" min="-360" max="360" step="any" value={angle} disabled={busy} aria-invalid={!validAngle} aria-describedby={!validAngle ? `${id}-invalid` : undefined} onChange={event => { setAngle(event.target.value); setMessage(undefined); }} />
    </label>
    <label className="drawing-cad-field">
      <span>{t('opacity')}</span>
      <input type="number" min="0" max="100" step="any" value={opacity} disabled={busy} aria-invalid={!validOpacity} aria-describedby={!validOpacity ? `${id}-invalid` : undefined} onChange={event => { setOpacity(event.target.value); setMessage(undefined); }} />
    </label>
    {!valid && <p id={`${id}-invalid`} className="drawing-help drawing-cad-message is-error" role="alert">{t('geometry')}</p>}
    <div className="drawing-cad-actions">
      <button type="button" disabled={busy || !hasDraft || !valid} data-testid="material-texture-review" onClick={() => {
        setMessage(undefined);
        if (!available || busy || !hasDraft || !valid) return;
        try {
          setReview({ plan: prepareMaterialTexture(editor, draft.value, { scale: number(scale), angle: number(angle), opacity: number(opacity) }), key: inputKey });
        } catch (error) {
          setReview(undefined);
          setMessage({ key: materialTextureError(error), error: true });
        }
      }}>{t('review')}</button>
      <button type="button" disabled={busy || !selection?.hasTexture} data-testid="material-texture-remove" onClick={() => {
        if (!available || busy || !selection?.hasTexture) return;
        try {
          if (!removeMaterialTexture(editor)) throw new Error('material-failed');
          setDraft(undefined);
          setReview(undefined);
          setSourceName('');
          if (fileInput.current) fileInput.current.value = '';
          setMessage({ key: 'removed' });
        } catch (error) {
          setMessage({ key: materialTextureError(error), error: true });
        }
      }}>{t('remove')}</button>
    </div>
    {review && bounds && <div className="drawing-cad-report" data-testid="material-texture-preview">
      <div className="drawing-vector-comparison"><figure>
        <figcaption>{t('preview')}{selection ? ` · ${selection.name}` : ''}</figcaption>
        <svg role="img" aria-label={t('preview')} viewBox={`${bounds.x - padding} ${bounds.y - padding} ${Math.max(bounds.w, 1) + padding * 2} ${Math.max(bounds.h, 1) + padding * 2}`}>
          <VectorArtwork id={`${id}-material-preview`} contours={review.plan.contours} fillRule={review.plan.fillRule} paint={review.plan.paint} />
        </svg>
      </figure></div>
      {stale && <p className="drawing-help drawing-cad-message" role="status">{t('stale')}</p>}
      <button type="button" disabled={busy || stale || !valid || !hasDraft} data-testid="material-texture-apply" onClick={() => {
        if (!available || busy || stale || !valid || !hasDraft) return;
        setMessage(undefined);
        try {
          if (review.plan.revision !== cadRevision(editor)) throw new Error('stale');
          if (!applyMaterialTexture(editor, review.plan)) throw new Error('material-failed');
          setReview(undefined);
          setMessage({ key: 'done' });
        } catch (error) {
          setMessage({ key: materialTextureError(error), error: true });
        }
      }}>{t('apply')}</button>
    </div>}
    {message && <p className={`drawing-help drawing-cad-message${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{t(message.key)}</p>}
  </fieldset>;
}
