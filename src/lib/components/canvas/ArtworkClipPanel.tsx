import React, { useEffect, useState } from 'react';
import { atom, useEditor, useValue, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { applyArtworkClip, canReleaseArtworkClip, isArtworkClipGuide, releaseArtworkClip, reviewArtworkClip,
  type ArtworkClipReview } from './cad-artwork-clip';
import { cadRevision, CadOperationError } from './cad-plans';
import { drawingObjectName } from './drawing-operations';
import { useArrangeTaskText } from './arrange-task-copy';
import { useArtworkClipText } from './artwork-clip-copy';

const createReview = () => atom<ArtworkClipReview | null>('artwork clip review', null);
const reviews = new WeakMap<Editor, ReturnType<typeof createReview>>();
function clipReview(editor: Editor) {
  let review = reviews.get(editor);
  if (!review) {
    review = createReview();
    reviews.set(editor, review);
  }
  return review;
}

export function DrawingArtworkClipOverlay() {
  const editor = useEditor();
  const review = useValue('artwork clip overlay', () => clipReview(editor).get(), [editor]);
  if (!review) return null;
  return <svg width={1} height={1} className="drawing-repeat-overlay" data-testid="drawing-clip-overlay" aria-hidden="true">
    <path className="drawing-repeat-overlay-copy" d={review.outline} fillRule={review.fillRule} vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function ArtworkClipPanel() {
  const editor = useEditor(), t = useArtworkClipText(), arrange = useArrangeTaskText();
  const [picked, setPicked] = useState<TLShapeId>();
  const [review, setReview] = useState<ArtworkClipReview>();
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const state = useValue('artwork clip selection', () => {
    const selected = editor.getSelectedShapes();
    return { guides: selected.length > 1 && selected.length <= 201 ? selected.filter(shape => isArtworkClipGuide(editor, shape)) : [],
      editable: !editor.getInstanceState().isReadonly, canRelease: canReleaseArtworkClip(editor),
      revision: review ? cadRevision(editor) : undefined };
  }, [editor, review]);
  const guide = state.guides.find(shape => shape.id === picked) ?? state.guides.at(-1);
  const ready = state.editable && review && guide?.id === review.guideId && review.revision === state.revision ? review : null;
  useEffect(() => {
    const overlay = clipReview(editor);
    overlay.set(ready);
    return () => { if (overlay.get() === ready) overlay.set(null); };
  }, [editor, ready]);

  function report(error: unknown) {
    const code = error instanceof CadOperationError ? error.code : '';
    const message = code === 'locked' || code === 'readonly' ? 'locked'
      : code === 'clipGuide' ? 'clipGuide' : code === 'clipLimit' ? 'clipLimit'
      : code === 'clipArtwork' || code === 'unsupported' || code === 'geometry' ? 'clipArtwork' : 'failed';
    setNotice({ text: t(message), error: true });
  }

  function preview() {
    if (!guide) return;
    setReview(undefined);
    setNotice(undefined);
    try { setReview(reviewArtworkClip(editor, guide.id)); }
    catch (error) { report(error); }
  }

  function change(action: () => boolean, message: 'applied' | 'released') {
    setReview(undefined);
    try {
      setNotice(action() ? { text: t(message) } : { text: t('failed'), error: true });
    } catch (error) { report(error); }
  }

  return <section className="drawing-cad-section" aria-label={arrange('artworkClip')} data-testid="drawing-artwork-clip">
    <p className="drawing-help">{t('help')}</p>
    {guide && <label className="drawing-cad-field"><span>{t('guide')}</span>
      <select disabled={!state.editable} value={guide.id} onChange={event => {
        setPicked(event.target.value as TLShapeId);
        setReview(undefined);
        setNotice(undefined);
      }} data-testid="drawing-clip-guide">
        {state.guides.map(shape => <option key={shape.id} value={shape.id}>{drawingObjectName(shape)}</option>)}
      </select>
    </label>}
    <div className="drawing-nest-actions">
      <button type="button" disabled={!state.editable || !guide} onClick={preview} data-testid="drawing-clip-preview">{t('preview')}</button>
      <button type="button" disabled={!ready} onClick={() => ready && change(() => applyArtworkClip(editor, ready), 'applied')}
        data-testid="drawing-clip-apply">{t('apply')}</button>
      <button type="button" disabled={!state.canRelease} onClick={() => change(() => releaseArtworkClip(editor), 'released')}
        data-testid="drawing-clip-release">{t('release')}</button>
    </div>
    {ready && <p className="drawing-help">{t('targets').replace('{count}', String(ready.count))}</p>}
    {review && !ready && <p className="drawing-help" role="status">{t('stale')}</p>}
    {notice && <p className="drawing-help" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
  </section>;
}
