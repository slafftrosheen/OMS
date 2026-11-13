import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue, type TLShapeId } from '@tldraw/tldraw';
import { curveBounds } from './cad-curves';
import { cadRevision } from './cad-plans';
import { unitMm, type CadSettings } from './cad-settings';
import { VectorArtwork } from './VectorArtwork';
import {
  applyMaterialAlignment,
  materialAlignmentSelection,
  prepareMaterialAlignment,
  type MaterialAlignmentPlan,
} from './material-alignment';
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
import { materialAlignmentError, materialTextureError, useMaterialTextureText, type MaterialTextureLabel } from './material-texture-copy';

type Draft = { value: MaterialTextureDraft; shapeId: string; version: number };
type Review = { plan: MaterialTexturePlan; key: string };
type AlignmentReview = { plan: MaterialAlignmentPlan; key: string };
type Message = { key: MaterialTextureLabel; error?: boolean };
type AlignmentMessage = Message & { revision?: string };
const number = (value: string) => value.trim() ? Number(value) : NaN;
const within = (value: string, min: number, max: number) => Number.isFinite(number(value)) && number(value) >= min && number(value) <= max;
const physical = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(14)) : value;
const controlsKey = (mode: string, values: number[]) => JSON.stringify([mode, ...values.map(physical)]);
const DEFAULT_TILE_WIDTH_MM = 50;
const MIN_TILE_WIDTH_MM = 0.01;
const MAX_TILE_LENGTH_MM = 1_000_000;

/** Material visualization shares the paint controls in both drawing hosts. */
export function MaterialTexturePanel({ settings, revision, disabled }: { settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), t = useMaterialTextureText(), id = useId();
  const unit = settings?.unit ?? 'mm', mmPerUnit = unitMm(unit);
  const selection = useValue('material texture selection', () => materialTextureSelection(editor), [editor]);
  const alignmentSelection = useValue('material alignment selection', () => materialAlignmentSelection(editor), [editor]);
  const alignmentSelectedIdsKey = useValue('material alignment selected ids', () => JSON.stringify([...editor.getSelectedShapeIds()].sort()), [editor]);
  const readonly = useValue('material alignment readonly', () => editor.getInstanceState().isReadonly, [editor]);
  const [alignmentSourceId, setAlignmentSourceId] = useState<TLShapeId>();
  const [alignmentReview, setAlignmentReview] = useState<AlignmentReview>();
  const [alignmentMessage, setAlignmentMessage] = useState<AlignmentMessage>();
  const alignmentSourcesKey = JSON.stringify(alignmentSelection.sources.map(source => source.id));
  const selectedId = selection?.id;
  const materialState = useValue('saved material texture', () => {
    const shape = editor.getOnlySelectedShape(), paint = shape?.meta.omsVectorPaint as any;
    return JSON.stringify([paint?.raster, paint?.fillOpacity, shape?.meta.omsMaterialTexture]);
  }, [editor]);
  const savedMapping = useValue('saved material texture mapping', () => {
    const current = getMaterialTextureDraft(editor);
    return current ? JSON.stringify([current.mode, current.scale, current.angle, current.opacity, current.tileWidthMm, current.offsetXmm, current.offsetYmm]) : null;
  }, [editor]);
  const mappingKey = JSON.stringify([settings?.scale, savedMapping]);
  const previousSelection = useRef(selectedId);
  const [draft, setDraft] = useState<Draft>();
  const [sourceName, setSourceName] = useState('');
  const [scale, setScale] = useState('100'), [angle, setAngle] = useState('0'), [opacity, setOpacity] = useState('100');
  const [mode, setMode] = useState<'cover' | 'tile'>('cover');
  const [tileWidth, setTileWidth] = useState(() => String(DEFAULT_TILE_WIDTH_MM / mmPerUnit));
  const [offsetX, setOffsetX] = useState('0'), [offsetY, setOffsetY] = useState('0');
  const previousUnit = useRef(unit);
  const previousMapping = useRef(mappingKey);
  const persistedControls = useRef<{ version: number; key: string }>();
  const [review, setReview] = useState<Review>();
  const [message, setMessage] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftVersion = useRef(0);
  const work = useRef<{ controller: AbortController; revision: string }>();

  useEffect(() => {
    if (alignmentSelection.sources.some(source => source.id === alignmentSourceId)) return;
    // A temporarily invalid target suppresses all source candidates. Preserve
    // the chosen source while it is still selected so fixing the target does
    // not silently switch the material to another selected curve.
    if (!alignmentSelection.sources.length && alignmentSourceId && editor.getSelectedShapeIds().includes(alignmentSourceId)) return;
    setAlignmentSourceId(alignmentSelection.sources[0]?.id);
    setAlignmentMessage(undefined);
  }, [editor, alignmentSourcesKey, alignmentSelectedIdsKey, alignmentSourceId]);

  useEffect(() => {
    setAlignmentMessage(undefined);
  }, [alignmentSelectedIdsKey]);

  useEffect(() => {
    setAlignmentMessage(current => current?.revision && current.revision !== revision ? undefined : current);
  }, [revision]);

  function hydrate(current: ReturnType<typeof getMaterialTextureDraft>) {
    const nextDraft = current && selectedId ? { value: current.draft, shapeId: selectedId, version: ++draftVersion.current } : undefined;
    const nextMode = current?.mode ?? 'cover', nextScale = current?.scale ?? 100;
    const nextAngle = current?.angle ?? 0, nextOpacity = current?.opacity ?? 100;
    const nextWidth = physical(current?.tileWidthMm ?? DEFAULT_TILE_WIDTH_MM);
    const nextX = physical(current?.offsetXmm ?? 0), nextY = physical(current?.offsetYmm ?? 0);
    setDraft(nextDraft);
    setMode(nextMode);
    setScale(String(nextScale));
    setAngle(String(nextAngle));
    setOpacity(String(nextOpacity));
    setTileWidth(String(nextWidth / mmPerUnit));
    setOffsetX(String(nextX / mmPerUnit));
    setOffsetY(String(nextY / mmPerUnit));
    previousUnit.current = unit;
    previousMapping.current = mappingKey;
    persistedControls.current = nextDraft ? { version: nextDraft.version, key: controlsKey(nextMode, [nextScale, nextAngle, nextOpacity, nextWidth, nextX, nextY]) } : undefined;
  }

  useEffect(() => {
    work.current?.controller.abort();
    work.current = undefined;
    setBusy(false);
    setReview(undefined);
    if (previousSelection.current !== selectedId) setMessage(undefined);
    previousSelection.current = selectedId;
    setSourceName('');
    if (fileInput.current) fileInput.current.value = '';
    hydrate(selectedId ? getMaterialTextureDraft(editor) : null);
  }, [editor, selectedId, materialState]);

  useEffect(() => {
    if (previousMapping.current === mappingKey) return;
    previousMapping.current = mappingKey;
    const saved = persistedControls.current, previousMmPerUnit = unitMm(previousUnit.current);
    const key = controlsKey(mode, [number(scale), number(angle), number(opacity), number(tileWidth) * previousMmPerUnit, number(offsetX) * previousMmPerUnit, number(offsetY) * previousMmPerUnit]);
    // Refresh only untouched persisted controls; edited and newly uploaded drafts
    // retain the physical sizes the user requested and their review becomes stale.
    if (!saved || saved.version !== draft?.version) return;
    if (saved.key !== key) {
      // Keep this physical request independent of later scale or bounds changes.
      persistedControls.current = undefined;
      return;
    }
    const current = selectedId ? getMaterialTextureDraft(editor) : null;
    if (current) hydrate(current);
  }, [mappingKey]);

  useEffect(() => {
    const previousMmPerUnit = unitMm(previousUnit.current);
    previousUnit.current = unit;
    if (previousMmPerUnit === mmPerUnit) return;
    const convert = (value: string) => Number.isFinite(number(value)) ? String(physical(number(value) * previousMmPerUnit) / mmPerUnit) : value;
    setTileWidth(convert);
    setOffsetX(convert);
    setOffsetY(convert);
  }, [unit]);

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
  const tileWidthMm = physical(number(tileWidth) * mmPerUnit), offsetXmm = physical(number(offsetX) * mmPerUnit), offsetYmm = physical(number(offsetY) * mmPerUnit);
  const validTileWidth = Number.isFinite(tileWidthMm) && tileWidthMm >= MIN_TILE_WIDTH_MM && tileWidthMm <= MAX_TILE_LENGTH_MM;
  const validOffsetX = Number.isFinite(offsetXmm) && Math.abs(offsetXmm) <= MAX_TILE_LENGTH_MM;
  const validOffsetY = Number.isFinite(offsetYmm) && Math.abs(offsetYmm) <= MAX_TILE_LENGTH_MM;
  const validGeometry = validAngle && validOpacity && (mode === 'cover' ? validScale : validTileWidth && validOffsetX && validOffsetY);
  const valid = validGeometry && (mode === 'cover' || !!settings);
  const available = !disabled && !!selection;
  const hasDraft = !!draft && draft.shapeId === selectedId;
  const inputKey = JSON.stringify([revision, settings, selectedId, draft?.version, mode, scale, tileWidth, offsetX, offsetY, angle, opacity]);
  const stale = !!review && (review.key !== inputKey || review.plan.revision !== revision);
  const bounds = review ? curveBounds(review.plan.contours) : null;
  const padding = bounds ? Math.max(bounds.w, bounds.h, 1) * 0.05 : 0;
  const alignmentSource = alignmentSelection.sources.find(source => source.id === alignmentSourceId);
  const alignmentKey = JSON.stringify([revision, alignmentSourceId]);
  const alignmentStale = !!alignmentReview && (alignmentReview.key !== alignmentKey || alignmentReview.plan.revision !== revision || alignmentReview.plan.sourceId !== alignmentSourceId);
  const alignmentBounds = alignmentReview ? curveBounds(alignmentReview.plan.paths.flatMap(path => path.contours)) : null;
  const alignmentPadding = alignmentBounds ? Math.max(alignmentBounds.w, alignmentBounds.h, 1) * 0.05 : 0;
  const alignmentError = alignmentSelection.error ?? (readonly ? 'readonly' : !settings ? 'settings' : disabled ? 'locked' : undefined);
  const alignmentAvailable = !disabled && !busy && !alignmentError && !!alignmentSource;

  async function load(file: File) {
    work.current?.controller.abort();
    work.current = undefined;
    persistedControls.current = undefined;
    setDraft(undefined);
    setReview(undefined);
    setMessage(undefined);
    setSourceName(file.name);
    setScale('100');
    setAngle('0');
    setOpacity('100');
    setMode('cover');
    setTileWidth(String(DEFAULT_TILE_WIDTH_MM / mmPerUnit));
    setOffsetX('0');
    setOffsetY('0');
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

  if (alignmentSelection.count >= 2) return <fieldset className="drawing-cad-fields" disabled={disabled || busy} aria-describedby={`${id}-alignment-help`} data-testid="material-alignment">
    <legend className="drawing-cad-preview-title">{t('alignTitle')}</legend>
    <p id={`${id}-alignment-help`} className="drawing-help">{t('alignHelp')}</p>
    <p className="drawing-help">{t('alignBehavior')}</p>
    <p className="drawing-help">{t('alignSelected')}: {alignmentSelection.count} · {t('alignTargets')}: {alignmentSource ? alignmentSelection.count - 1 : 0}</p>
    <label className="drawing-cad-field">
      <span>{t('alignSource')}</span>
      <select value={alignmentSourceId ?? ''} disabled={!alignmentSelection.sources.length} aria-describedby={`${id}-alignment-source-help`} data-testid="material-alignment-source" onChange={event => {
        setAlignmentSourceId(event.target.value as TLShapeId);
        setAlignmentMessage(undefined);
      }}>
        {!alignmentSelection.sources.length && <option value="">{t('alignNoSource')}</option>}
        {alignmentSelection.sources.map((source, index) => <option key={source.id} value={source.id}>{`${source.name} · ${index + 1}`}</option>)}
      </select>
    </label>
    <p id={`${id}-alignment-source-help`} className="drawing-help">{t('alignSourceHelp')}</p>
    {alignmentError && <p className="drawing-help drawing-cad-message is-error" role="alert">{t(materialAlignmentError({ code: alignmentError }))}</p>}
    {busy && <p className="drawing-help" role="status">{t('loading')}</p>}
    <div className="drawing-cad-actions">
      <button type="button" disabled={!alignmentAvailable} data-testid="material-alignment-review" onClick={() => {
        if (!alignmentAvailable || !alignmentSourceId) return;
        setAlignmentMessage(undefined);
        try {
          setAlignmentReview({ plan: prepareMaterialAlignment(editor, alignmentSourceId), key: alignmentKey });
        } catch (error) {
          setAlignmentReview(undefined);
          setAlignmentMessage({ key: materialAlignmentError(error), error: true });
        }
      }}>{t('alignReview')}</button>
    </div>
    {alignmentReview && alignmentBounds && <div className="drawing-cad-report" data-testid="material-alignment-preview">
      <div className="drawing-vector-comparison"><figure>
        <figcaption>{t('alignPreview')}</figcaption>
        <svg role="img" aria-label={t('alignPreview')} viewBox={`${alignmentBounds.x - alignmentPadding} ${alignmentBounds.y - alignmentPadding} ${Math.max(alignmentBounds.w, 1) + alignmentPadding * 2} ${Math.max(alignmentBounds.h, 1) + alignmentPadding * 2}`}>
          {alignmentReview.plan.paths.map((path, index) => <VectorArtwork key={index} id={`${id}-alignment-preview-${index}`} contours={path.contours} fillRule={path.fillRule} paint={path.paint} />)}
        </svg>
      </figure></div>
      <p className="drawing-help">{t('alignTargets')}: {alignmentReview.plan.targetIds.length} · {t('tileCount')}: {alignmentReview.plan.tileCount}</p>
      {alignmentStale && <p className="drawing-help drawing-cad-message" role="status">{t('alignStale')}</p>}
      <div className="drawing-cad-actions">
        <button type="button" disabled={!alignmentAvailable || alignmentStale} data-testid="material-alignment-apply" onClick={() => {
          if (!alignmentAvailable || alignmentStale) return;
          setAlignmentMessage(undefined);
          try {
            if (alignmentReview.plan.revision !== cadRevision(editor) || alignmentReview.plan.sourceId !== alignmentSourceId) throw new Error('stale');
            if (!applyMaterialAlignment(editor, alignmentReview.plan)) throw new Error('material-failed');
            setAlignmentReview(undefined);
            setAlignmentMessage({ key: 'alignDone', revision: cadRevision(editor) });
          } catch (error) {
            setAlignmentMessage({ key: materialAlignmentError(error), error: true });
          }
        }}>{t('alignApply')}</button>
      </div>
    </div>}
    {alignmentMessage && (!alignmentMessage.revision || alignmentMessage.revision === revision) && <p className={`drawing-help drawing-cad-message${alignmentMessage.error ? ' is-error' : ''}`} role={alignmentMessage.error ? 'alert' : 'status'}>{t(alignmentMessage.key)}</p>}
  </fieldset>;

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
      <span>{t('mapping')}</span>
      <select value={mode} disabled={busy} aria-describedby={`${id}-mapping-help`} onChange={event => { setMode(event.target.value as 'cover' | 'tile'); setMessage(undefined); }}>
        <option value="cover">{t('cover')}</option>
        <option value="tile">{t('tile')}</option>
      </select>
    </label>
    <p id={`${id}-mapping-help`} className="drawing-help">{t(mode === 'cover' ? 'coverHelp' : 'tileHelp')}</p>
    {mode === 'cover' ? <label className="drawing-cad-field">
      <span>{t('scale')}</span>
      <input type="number" min="100" max="2000" step="any" value={scale} disabled={busy} aria-invalid={!validScale} aria-describedby={!validScale ? `${id}-invalid` : undefined} onChange={event => { setScale(event.target.value); setMessage(undefined); }} />
    </label> : <>
      <label className="drawing-cad-field">
        <span>{`${t('tileWidth')} (${unit})`}</span>
        <input type="number" min={MIN_TILE_WIDTH_MM / mmPerUnit} max={MAX_TILE_LENGTH_MM / mmPerUnit} step="any" value={tileWidth} disabled={busy} aria-invalid={!validTileWidth} aria-describedby={!validTileWidth ? `${id}-invalid` : `${id}-mapping-help`} onChange={event => { setTileWidth(event.target.value); setMessage(undefined); }} />
      </label>
      <label className="drawing-cad-field">
        <span>{`${t('offsetX')} (${unit})`}</span>
        <input type="number" min={-MAX_TILE_LENGTH_MM / mmPerUnit} max={MAX_TILE_LENGTH_MM / mmPerUnit} step="any" value={offsetX} disabled={busy} aria-invalid={!validOffsetX} aria-describedby={!validOffsetX ? `${id}-invalid` : `${id}-mapping-help`} onChange={event => { setOffsetX(event.target.value); setMessage(undefined); }} />
      </label>
      <label className="drawing-cad-field">
        <span>{`${t('offsetY')} (${unit})`}</span>
        <input type="number" min={-MAX_TILE_LENGTH_MM / mmPerUnit} max={MAX_TILE_LENGTH_MM / mmPerUnit} step="any" value={offsetY} disabled={busy} aria-invalid={!validOffsetY} aria-describedby={!validOffsetY ? `${id}-invalid` : `${id}-mapping-help`} onChange={event => { setOffsetY(event.target.value); setMessage(undefined); }} />
      </label>
    </>}
    <label className="drawing-cad-field">
      <span>{t('angle')}</span>
      <input type="number" min="-360" max="360" step="any" value={angle} disabled={busy} aria-invalid={!validAngle} aria-describedby={!validAngle ? `${id}-invalid` : undefined} onChange={event => { setAngle(event.target.value); setMessage(undefined); }} />
    </label>
    <label className="drawing-cad-field">
      <span>{t('opacity')}</span>
      <input type="number" min="0" max="100" step="any" value={opacity} disabled={busy} aria-invalid={!validOpacity} aria-describedby={!validOpacity ? `${id}-invalid` : undefined} onChange={event => { setOpacity(event.target.value); setMessage(undefined); }} />
    </label>
    {!validGeometry && <p id={`${id}-invalid`} className="drawing-help drawing-cad-message is-error" role="alert">{t('geometry')}</p>}
    {mode === 'tile' && !settings && <p className="drawing-help drawing-cad-message is-error" role="alert">{t('settings')}</p>}
    <div className="drawing-cad-actions">
      <button type="button" disabled={busy || !hasDraft || !valid} data-testid="material-texture-review" onClick={() => {
        setMessage(undefined);
        if (!available || busy || !hasDraft || !valid) return;
        try {
          setReview({ plan: prepareMaterialTexture(editor, draft.value, { mode, scale: mode === 'cover' ? number(scale) : 100, angle: number(angle), opacity: number(opacity), ...(mode === 'tile' ? { tileWidthMm, offsetXmm, offsetYmm } : {}) }), key: inputKey });
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
      {review.plan.tileCount !== undefined && <p className="drawing-help">{t('tileCount')}: {review.plan.tileCount}</p>}
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
