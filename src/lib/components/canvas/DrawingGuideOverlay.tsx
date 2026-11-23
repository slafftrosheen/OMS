import React, { useEffect, useState } from 'react';
import { useEditor, useValue, type Editor } from '@tldraw/tldraw';
import {
  applyDrawingGuideChange, drawingGuideLine, drawingGuideRotationPose, drawingGuidesRevision, guidePositionToUnit, prepareDrawingGuideChange,
  projectToDrawingGuide, readDrawingGuides, selectedDrawingGuide, selectDrawingGuide, type DrawingGuide, type DrawingGuideGeometry,
} from './drawing-guides';
import {
  beginDrawingGuideDrag, cancelDrawingGuideDrag, canDragDrawingGuide, drawingGuideDrag,
  drawingGuideNotice,
} from './drawing-guide-drag';
import { readCadSettings, unitLengthToCanvas, type CadPoint } from './cad-settings';
import { requestDrawingUi } from './drawing-ui-requests';
import { useGuideText } from './guide-copy';
import { drawingPickGuideSnap } from './drawing-pick-guide-snap';

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
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!remove && (guide.axis === 'angle' ? !dx && !dy : !(guide.axis === 'x' ? dx : dy))) return;
    const settings = readCadSettings(editor);
    const step = (settings ? unitLengthToCanvas(settings.nudge, settings) : 1) * (event.shiftKey ? 10 : event.ctrlKey || event.metaKey ? 0.1 : 1);
    const change = remove ? { kind: 'remove' as const, ids: [id] }
      : guide.axis === 'angle' ? { kind: 'pose' as const, id, angle: guide.angle, pivot: { x: guide.pivot.x + step * dx, y: guide.pivot.y + step * dy } }
      : { kind: 'move' as const, id, position: guide.position + step * (guide.axis === 'x' ? dx : dy) };
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
  const [rotation, setRotation] = useState<{ id: string; revision: string; pivot: CadPoint } | null>(null);
  const state = useValue('Document guidelines overlay', () => ({
    pageId: editor.getCurrentPageId(), guides: readDrawingGuides(editor), bounds: editor.getViewportPageBounds(),
    zoom: editor.getZoomLevel(), settings: readCadSettings(editor), selected: selectedDrawingGuide(editor).get(),
    preview: drawingGuideDrag(editor).get(), canEdit: canDragDrawingGuide(editor), pickSnap: drawingPickGuideSnap(editor).get(),
    revision: drawingGuidesRevision(editor),
  }), [editor]);
  useEffect(() => () => cancelDrawingGuideDrag(editor, null), [editor]);
  useEffect(() => { if (!state.canEdit) cancelDrawingGuideDrag(editor, 'stale'); }, [editor, state.canEdit, state.pageId]);
  useEffect(() => {
    if (rotation && (rotation.id !== state.selected || rotation.revision !== state.revision || !state.canEdit)) setRotation(null);
  }, [rotation, state.selected, state.revision, state.canEdit]);
  const scale = 1 / state.zoom;
  const lineProps = (guide: DrawingGuideGeometry) => {
    if (guide.axis === 'x') return { x1: guide.position, y1: state.bounds.y, x2: guide.position, y2: state.bounds.maxY };
    if (guide.axis === 'y') return { x1: state.bounds.x, y1: guide.position, x2: state.bounds.maxX, y2: guide.position };
    const { along } = drawingGuideLine(guide), center = projectToDrawingGuide(guide, state.bounds.center);
    const reach = Math.hypot(state.bounds.w, state.bounds.h) / 2;
    return { x1: center.x - reach * along.x, y1: center.y - reach * along.y, x2: center.x + reach * along.x, y2: center.y + reach * along.y };
  };
  const guideName = (guide: DrawingGuide) => guide.axis === 'angle' ? `${t('angled')} · ${Number(guide.angle.toFixed(2))}°`
    : `${t(guide.axis === 'x' ? 'vertical' : 'horizontal')} · ${Number(guidePositionToUnit(guide.axis, guide.position, state.settings).toFixed(state.settings?.precision ?? 2))} ${state.settings?.unit ?? 'px'}`;
  const visibleGuides = state.guides.visible ? state.guides.guides.filter(guide => guide.visible) : [];
  const selectedGuide = visibleGuides.find(guide => guide.id === state.selected && !guide.locked);
  const selectedPose = selectedGuide && drawingGuideRotationPose(selectedGuide,
    rotation?.id === selectedGuide.id && rotation.revision === state.revision ? rotation.pivot : undefined);
  return <>
    <svg width={1} height={1} className="drawing-guide-overlay" data-testid="drawing-guide-overlay" data-page={state.pageId} aria-hidden="true">
      {visibleGuides.map(guide => <g key={guide.id} data-guide-id={guide.id} data-guide-axis={guide.axis} data-guide-position={guide.position}
        data-guide-angle={guide.angle} data-guide-locked={state.guides.locked || guide.locked}>
        <line {...lineProps(guide)} className={`drawing-guide-line${state.selected === guide.id ? ' is-selected' : ''}`}
          strokeWidth={(state.selected === guide.id ? 2 : 1) * scale} strokeDasharray={`${5 * scale} ${4 * scale}`} />
      </g>)}
      {state.preview?.valid && !state.preview.outside && <line {...lineProps(state.preview)} className="drawing-guide-preview"
        data-testid="drawing-guide-preview" strokeWidth={2 * scale} strokeDasharray={`${6 * scale} ${3 * scale}`} />}
      {state.pickSnap?.guides.map(guide => <line key={guide.id} {...lineProps(guide)} className="drawing-guide-snap"
        data-testid="drawing-pick-guide-snap" data-guide-snap-id={guide.id} data-guide-axis={guide.axis}
        data-guide-anchor={guide.anchor} strokeWidth={2.5 * scale} />)}
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
          onDoubleClick={event => {
            if (event.button !== 0 || !canDragDrawingGuide(editor) || !selected || guide.axis === 'angle') return;
            event.preventDefault(); event.stopPropagation();
            setRotation({ id: guide.id, revision: state.revision, pivot: editor.screenToPage({ x: event.clientX, y: event.clientY }) });
          }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); selectDrawingGuide(editor, guide.id); requestDrawingUi(editor, { kind: 'panel', action: 'guides' }); }}
          onKeyDown={event => handleGuideKey(editor, guide.id, event)}>
          <title>{`${guideName(guide)}. ${t('dragHelp')}`}</title>
        </line>;
    })}
    {state.canEdit && selectedGuide && selectedPose && (() => {
      const pose = state.preview?.guideId === selectedGuide.id && state.preview.axis === 'angle' && state.preview.valid && !state.preview.outside ? state.preview : selectedPose;
      const { along } = drawingGuideLine(pose);
      return (['pivot', 'rotate'] as const).map(mode => {
        const offset = mode === 'rotate' ? 64 * scale : 0;
        return <circle key={mode} cx={pose.pivot.x + along.x * offset} cy={pose.pivot.y + along.y * offset}
          r={5 * scale} strokeWidth={1.5 * scale} className={`drawing-guide-handle is-${mode}`} data-testid={`drawing-guide-${mode}-handle`}
          onPointerDown={event => {
            if (beginDrawingGuideDrag(editor, { axis: selectedGuide.axis, guideId: selectedGuide.id, mode, pivot: selectedPose.pivot }, event.nativeEvent, event.currentTarget)) {
              event.preventDefault(); event.stopPropagation();
            }
          }}><title>{t(mode === 'pivot' ? 'pivotHandle' : 'rotateHandle')}</title></circle>;
      });
    })()}
    </svg>
  </>;
}
