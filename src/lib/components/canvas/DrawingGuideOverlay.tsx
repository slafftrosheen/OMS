import React, { useEffect } from 'react';
import { useEditor, useValue, type Editor } from '@tldraw/tldraw';
import {
  applyDrawingGuideChange, drawingGuidesRevision, guidePositionToUnit, prepareDrawingGuideChange,
  readDrawingGuides, selectedDrawingGuide, selectDrawingGuide, type DrawingGuide,
} from './drawing-guides';
import {
  beginDrawingGuideDrag, cancelDrawingGuideDrag, canDragDrawingGuide, drawingGuideDrag,
  drawingGuideNotice,
} from './drawing-guide-drag';
import { readCadSettings, unitLengthToCanvas } from './cad-settings';
import { requestDrawingUi } from './drawing-ui-requests';
import { useGuideText } from './guide-copy';

function guardGuideControlKey(event: React.KeyboardEvent<SVGSVGElement>) {
  if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key) && event.target instanceof Element && event.target.closest('[data-drawing-guide-control]'))
    (event.nativeEvent as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
}

function handleGuideKey(editor: Editor, id: string, event: React.KeyboardEvent<SVGLineElement>) {
  if (!['Enter', ' ', 'Escape', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  (event.nativeEvent as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
  if (event.key === 'Enter' || event.key === ' ') { selectDrawingGuide(editor, id); requestDrawingUi(editor, { kind: 'panel', action: 'guides' }); return; }
  if (event.key === 'Escape') { selectDrawingGuide(editor, null); editor.focus(); return; }
  if (!canDragDrawingGuide(editor) || event.altKey || event.nativeEvent.isComposing) return;
  const guide = readDrawingGuides(editor).guides.find(item => item.id === id);
  if (!guide || guide.locked) return;
  try {
    const remove = event.key === 'Delete' || event.key === 'Backspace';
    const direction = guide.axis === 'x' ? event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!remove && !direction) return;
    const settings = readCadSettings(editor);
    const step = (settings ? unitLengthToCanvas(settings.nudge, settings) : 1) * (event.shiftKey ? 10 : event.ctrlKey || event.metaKey ? 0.1 : 1);
    const change = remove ? { kind: 'remove' as const, ids: [id] }
      : { kind: 'move' as const, id, position: guide.position + step * direction };
    const plan = prepareDrawingGuideChange(editor, change, drawingGuidesRevision(editor));
    if (applyDrawingGuideChange(editor, plan)) {
      drawingGuideNotice(editor).set(remove ? 'removed' : 'moved');
      if (remove) editor.focus();
    } else drawingGuideNotice(editor).set('failed');
  } catch { drawingGuideNotice(editor).set('failed'); }
}

/** OnTheCanvas already applies the editor's camera transform. Guidelines are UI
 * in page coordinates and never enter the shape list, fit bounds or exports. */
export function DrawingGuideOverlay() {
  const editor = useEditor(), t = useGuideText();
  const state = useValue('Document guidelines overlay', () => ({
    pageId: editor.getCurrentPageId(), guides: readDrawingGuides(editor), bounds: editor.getViewportPageBounds(),
    zoom: editor.getZoomLevel(), settings: readCadSettings(editor), selected: selectedDrawingGuide(editor).get(),
    preview: drawingGuideDrag(editor).get(), canEdit: canDragDrawingGuide(editor),
  }), [editor]);
  useEffect(() => () => cancelDrawingGuideDrag(editor, null), [editor]);
  useEffect(() => { if (!state.canEdit) cancelDrawingGuideDrag(editor, 'stale'); }, [editor, state.canEdit, state.pageId]);
  const scale = 1 / state.zoom;
  const lineProps = (guide: Pick<DrawingGuide, 'axis' | 'position'>) => guide.axis === 'x'
    ? { x1: guide.position, y1: state.bounds.y, x2: guide.position, y2: state.bounds.maxY }
    : { x1: state.bounds.x, y1: guide.position, x2: state.bounds.maxX, y2: guide.position };
  const guideName = (guide: DrawingGuide) => `${t(guide.axis === 'x' ? 'vertical' : 'horizontal')}: ${Number(guidePositionToUnit(guide.axis, guide.position, state.settings).toFixed(state.settings?.precision ?? 2))} ${state.settings?.unit ?? 'px'}`;
  const visibleGuides = state.guides.visible ? state.guides.guides.filter(guide => guide.visible) : [];
  return <>
    <svg width={1} height={1} className="drawing-guide-overlay" data-testid="drawing-guide-overlay" data-page={state.pageId} aria-hidden="true">
      {visibleGuides.map(guide => <g key={guide.id} data-guide-id={guide.id} data-guide-axis={guide.axis} data-guide-position={guide.position}
        data-guide-locked={state.guides.locked || guide.locked}>
        <line {...lineProps(guide)} className={`drawing-guide-line${state.selected === guide.id ? ' is-selected' : ''}`}
          strokeWidth={(state.selected === guide.id ? 2 : 1) * scale} strokeDasharray={`${5 * scale} ${4 * scale}`} />
      </g>)}
      {state.preview?.valid && !state.preview.outside && <line {...lineProps(state.preview)} className="drawing-guide-preview"
        data-testid="drawing-guide-preview" strokeWidth={2 * scale} strokeDasharray={`${6 * scale} ${3 * scale}`} />}
    </svg>
    {/* Hit bands sit below the real shape DOM: form fields and embedded media
        must receive their own pointer events where a guideline crosses them. */}
    <svg width={1} height={1} className="drawing-guide-controls" data-testid="drawing-guide-controls"
      onKeyDownCapture={guardGuideControlKey} onKeyUpCapture={guardGuideControlKey}>
    {state.canEdit && visibleGuides.filter(guide => !guide.locked).map(guide => {
      const selected = state.selected === guide.id;
      return <line key={guide.id} {...lineProps(guide)} strokeWidth={16 * scale} className={`drawing-guide-hit is-${guide.axis}`}
          data-drawing-guide-control={guide.id} role="button" tabIndex={selected ? 0 : -1} aria-label={guideName(guide)}
          onPointerDown={event => {
            if (beginDrawingGuideDrag(editor, { axis: guide.axis, guideId: guide.id }, event.nativeEvent, event.currentTarget)) {
              event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
            }
          }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); selectDrawingGuide(editor, guide.id); requestDrawingUi(editor, { kind: 'panel', action: 'guides' }); }}
          onKeyDown={event => handleGuideKey(editor, guide.id, event)}>
          <title>{`${guideName(guide)}. ${t('dragHelp')}`}</title>
        </line>;
    })}
    </svg>
  </>;
}
