import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { TLShapeId } from '@tldraw/tldraw';
import { applyDrawingCommand, toggleDrawingObjectLock, transformDrawingSelection } from '../../src/lib/components/canvas/drawing-commands';

function fixture() {
  const shape = { id: 'shape:one' as TLShapeId, type: 'geo', x: 10, y: 20, rotation: 0, isLocked: false, parentId: 'page:one', props: { w: 100, h: 80 } };
  const state = { isReadonly: false, isGridMode: false, tool: 'select', selected: [shape], canResize: true, hideRotation: false, parentLocked: false, lockedAspect: false };
  const calls: Array<[string, ...any[]]> = [];
  const editor: any = {
    getInstanceState: () => state, getSelectedShapes: () => state.selected,
    getSelectedShapeIds: () => state.selected.map(s => s.id), getCurrentToolId: () => state.tool,
    getCurrentPageShapeIds: () => new Set([shape.id]), getShapeAndDescendantIds: () => new Set([shape.id]),
    getShape: (id: string) => id === shape.id ? shape : state.parentLocked ? { id, isLocked: true } : undefined,
    isShapeOrAncestorLocked: (s: any) => s.isLocked || state.parentLocked,
    getCanUndo: () => false, getCanRedo: () => false,
    complete: () => {}, setCurrentTool: (tool: string) => { state.tool = tool; },
    mark: (mark: string) => calls.push(['mark', mark]), bailToMark: (mark: string) => calls.push(['rollback', mark]),
    run: (fn: () => void) => fn(), focus: () => {},
    rotateShapesBy: (ids: string[], delta: number) => { calls.push(['rotate', ids, delta]); },
    flipShapes: (ids: string[], axis: string) => calls.push(['flip', ids, axis]),
    toggleLock: (ids: string[]) => { calls.push(['lock', ids]); shape.isLocked = !shape.isLocked; },
    getShapeUtil: () => ({ canResize: () => state.canResize, hideRotateHandle: () => state.hideRotation, isAspectRatioLocked: () => state.lockedAspect }),
    getShapeGeometry: () => ({ bounds: { w: 100, h: 80, point: { x: 0, y: 0 } } }),
    getShapePageTransform: () => ({ point: () => ({ x: 210, y: 320 }), rotation: () => Math.PI / 4, applyToPoint: () => ({ x: 210, y: 320 }) }),
    getPointInParentSpace: (_: unknown, point: { x: number; y: number }) => ({ x: point.x - 200, y: point.y - 300 }),
    updateShapes: (shapes: any[]) => calls.push(['update', shapes]),
    resizeShape: (shape: any, scale: any, options: any) => calls.push(['resize', shape.id, scale, options]),
    zoomIn: () => calls.push(['zoom-in']), zoomOut: () => calls.push(['zoom-out']),
    updateInstanceState: (patch: any) => Object.assign(state, patch),
  };
  return { editor, shape, state, calls };
}

describe('Shared drawing commands', () => {
  it('keeps drawing edits out of readonly documents but still allows camera and grid changes', () => {
    const f = fixture(); f.state.isReadonly = true;
    assert.equal(applyDrawingCommand(f.editor, 'rotate-left'), false);
    assert.equal(transformDrawingSelection(f.editor, 'w', 300), false);
    assert.equal(toggleDrawingObjectLock(f.editor, f.shape.id), false);
    assert.equal(applyDrawingCommand(f.editor, 'zoom-in'), true);
    assert.equal(applyDrawingCommand(f.editor, 'grid'), true);
    assert.equal(f.state.isGridMode, true);
    assert.deepEqual(f.calls, [['zoom-in']]);
  });
  it('applies page coordinates in the parent coordinate system and preserves the other axis', () => {
    const f = fixture();
    assert.equal(transformDrawingSelection(f.editor, 'x', 250), true);
    assert.deepEqual(f.calls.find(call => call[0] === 'update')?.[1], [{ id: f.shape.id, type: 'geo', x: 50, y: 20 }]);
    assert.equal(f.calls.filter(call => call[0] === 'mark').length, 2);
  });
  it('resizes in the object axes from its origin and rotates to an absolute angle', () => {
    const f = fixture();
    assert.equal(transformDrawingSelection(f.editor, 'w', 250), true);
    const resize = f.calls.find(call => call[0] === 'resize')!;
    assert.deepEqual(resize[2], { x: 2.5, y: 1 });
    assert.deepEqual(resize[3].scaleOrigin, { x: 210, y: 320 });
    assert.equal(resize[3].scaleAxisRotation, Math.PI / 4);
    assert.equal(transformDrawingSelection(f.editor, 'rotation', 90), true);
    assert.equal(f.calls.find(call => call[0] === 'rotate')?.[2], Math.PI / 4);
  });
  it('rejects invalid dimensions, unsupported resizing and locked ancestry', () => {
    const f = fixture();
    for (const value of [0, -1, Infinity, NaN, 1_000_001]) assert.equal(transformDrawingSelection(f.editor, 'w', value), false);
    f.state.canResize = false;
    assert.equal(transformDrawingSelection(f.editor, 'w', 250), false);
    f.state.hideRotation = true;
    assert.equal(transformDrawingSelection(f.editor, 'rotation', 90), false);
    f.state.parentLocked = true;
    assert.equal(toggleDrawingObjectLock(f.editor, f.shape.id), false);
    assert.equal(transformDrawingSelection(f.editor, 'x', 250), false);
    assert.equal(f.calls.length, 0);
  });
  it('does not pretend to resize groups and scales aspect-locked images uniformly when shrinking', () => {
    const f = fixture(); f.shape.type = 'group';
    assert.equal(transformDrawingSelection(f.editor, 'w', 50), false);
    assert.equal(f.calls.length, 0);
    f.shape.type = 'image'; f.state.lockedAspect = true;
    assert.equal(transformDrawingSelection(f.editor, 'w', 50), true);
    const resize = f.calls.find(call => call[0] === 'resize')!;
    assert.deepEqual(resize[2], { x: 0.5, y: 0.5 });
    assert.equal(resize[3].isAspectRatioLocked, true);
  });
  it('allows deliberate per-object unlock but never silently unlocks to rotate', () => {
    const f = fixture(); f.shape.isLocked = true;
    assert.equal(applyDrawingCommand(f.editor, 'rotate-right'), false);
    assert.equal(toggleDrawingObjectLock(f.editor, f.shape.id), true);
    assert.equal(f.shape.isLocked, false);
    assert.equal(applyDrawingCommand(f.editor, 'flip-horizontal'), true);
    assert.deepEqual(f.calls.find(call => call[0] === 'flip'), ['flip', [f.shape.id], 'horizontal']);
  });
  it('rolls back a failed transform instead of leaving a partial command in history', () => {
    const f = fixture(); f.editor.resizeShape = () => { throw new Error('unsupported bounds'); };
    assert.equal(transformDrawingSelection(f.editor, 'h', 200), false);
    assert.equal(f.calls.filter(call => call[0] === 'rollback').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'mark').length, 1);
  });
});
