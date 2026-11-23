import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Editor } from '@tldraw/tldraw';
import {
  ariaDrawingKeys, drawingCommands, drawingCycleIndex, drawingDockers, drawingEventKeys, drawingMenuCommands,
  drawingOwnCommandForKeys, drawingReadOnlyTools, drawingToolForKeys, drawingToolIds, drawingToolKeys, drawingToolTargets,
  formatDrawingKeys,
} from '../../src/lib/components/canvas/drawing-command-map';
import { isDrawingUiRequest, routeCanvasCadImport } from '../../src/lib/components/canvas/drawing-ui-requests';
import { drawingFileKind, DRAWING_FILE_ACCEPT, DXF_FILE_ACCEPT, VECTOR_FILE_ACCEPT } from '../../src/lib/components/canvas/drawing-file-types';

const readCanvas = (file: string) => readFileSync(`src/lib/components/canvas/${file}`, 'utf8');

describe('drawing workspace tool wiring', () => {
  it('assigns every tool a registered editor mode, shape, or reachable command', () => {
    assert.deepEqual(Object.keys(drawingToolTargets).sort(), [...drawingToolIds].sort());
    const reachable = new Set(drawingMenuCommands());
    for (const [id, target] of Object.entries(drawingToolTargets)) {
      if (target.kind === 'command') assert.ok(reachable.has(target.command), id);
      if (target.kind === 'geometry') assert.equal(target.shape, id);
      if ('panel' in target) assert.ok(drawingDockers.includes(target.panel), id);
    }
    const app = readCanvas('CanvasApp.tsx');
    const registered = app.match(/tools=\{\[([^\]]+)\]\}/)?.[1].split(',').map(name => name.trim());
    assert.ok(registered?.length);
    const sources = ['CadPolylineTool', 'CadBezierTool', 'CadFreehandTool', 'CadTwoPointTool', 'CadThreePointTool']
      .map(name => readCanvas(`${name}.ts`)).join('\n');
    const declared = new Map([...sources.matchAll(/class (\w+) extends \w+\s*\{\s*static override id\s*=\s*'([^']+)'/g)]
      .map(([, name, id]) => [name, id]));
    const custom = Object.values(drawingToolTargets)
      .flatMap(target => target.kind === 'editor' && target.tool.startsWith('cad-') ? [target.tool] : []);
    assert.deepEqual(registered.map(name => declared.get(name)).sort(), custom.sort());
  });

  it('resolves every catalog command through the workspace', () => {
    const source = readCanvas('DrawingWorkspace.tsx');
    const editor = source.match(/const editorCommands = \[([\s\S]*?)\] as const/)?.[1] ?? '';
    const resolver = source.split('function commandState(')[1]?.split('commandRef.current = (id')[0] ?? '';
    const shared = [...editor.matchAll(/'([^']+)'/g)].map(([, id]) => id);
    const routed = [...resolver.matchAll(/case '([^']+)'/g)].map(([, id]) => id);
    assert.deepEqual([...shared, ...routed].sort(), Object.keys(drawingCommands).sort());
  });

  it('routes the advertised shortcuts with exact modifiers', () => {
    const keys = (key: string, flags = {}) =>
      drawingEventKeys({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...flags });
    for (const [tool, shortcut] of Object.entries(drawingToolKeys)) assert.equal(drawingToolForKeys(shortcut), tool);
    assert.equal(drawingToolForKeys(keys('F6')), 'rectangle');
    assert.equal(drawingToolForKeys(keys('F6', { shiftKey: true })), undefined);
    assert.equal(drawingOwnCommandForKeys(keys('D', { ctrlKey: true, shiftKey: true })), 'repeat');
    assert.equal(drawingOwnCommandForKeys(keys('d', { ctrlKey: true })), 'duplicate');
    assert.equal(drawingOwnCommandForKeys(keys('+', { code: 'NumpadAdd' })), 'duplicateInPlace');
    assert.equal(drawingOwnCommandForKeys(keys('+', { ctrlKey: true })), undefined);
    assert.equal(ariaDrawingKeys('+'), 'Shift+Equal Add');
    assert.equal(formatDrawingKeys('+', true), '+');
  });

  it('keeps view tools on read-only drawings and starts backwards at the last object', () => {
    assert.deepEqual([...drawingReadOnlyTools].sort(), ['cad-measure-tools', 'clipart', 'hand', 'nodes', 'paint', 'select', 'zoom']);
    assert.equal(drawingCycleIndex(4, -1, -1), 3);
    assert.equal(drawingCycleIndex(4, -1, 1), 0);
    assert.equal(drawingCycleIndex(4, 3, 1), 0);
    assert.equal(drawingCycleIndex(4, 0, -1), 3);
    assert.equal(drawingCycleIndex(0, -1, 1), -1);
  });

  it('queues each accepted drawing format for review, preserving the placement point', () => {
    const container = new EventTarget();
    const received: unknown[] = [];
    container.addEventListener('oms:drawing-ui-request', event => received.push((event as CustomEvent).detail));
    const editor = { getContainer: () => container, getInstanceState: () => ({ isReadonly: false }) } as unknown as Editor;
    const point = { x: 50, y: 75 };
    const fileTypes = ['.cdr', '.dxf', '.eps', '.pdf', '.svg'];
    const extensions = (accept: string) => accept.split(',').filter(value => value.startsWith('.')).sort();
    assert.deepEqual(extensions(DRAWING_FILE_ACCEPT), fileTypes);
    assert.deepEqual(extensions(VECTOR_FILE_ACCEPT), ['.cdr', '.eps', '.pdf', '.svg']);
    assert.deepEqual(extensions(DXF_FILE_ACCEPT), ['.dxf']);
    for (const extension of fileTypes) {
      const file = new File(['sample'], `artwork${extension.toUpperCase()}`);
      assert.deepEqual(routeCanvasCadImport(editor, [file], undefined, true), []);
      assert.deepEqual(received.pop(), { kind: 'import', action: 'reviewFiles', files: [file] });
      if (extension === '.pdf') {
        assert.deepEqual(routeCanvasCadImport(editor, [file], point), [file], 'a dropped PDF remains an attachment');
        continue;
      }
      assert.deepEqual(routeCanvasCadImport(editor, [file], point), []);
      assert.deepEqual(received.pop(), { kind: 'import', action: 'reviewFiles', files: [file], dropPoint: point });
    }
    const png = new File(['photo'], 'photo.png');
    assert.deepEqual(routeCanvasCadImport(editor, [png], point), [png]);
  });

  it('separates editable drawings and attachments without losing either', () => {
    const container = new EventTarget();
    let notice: unknown, isReadonly = false;
    container.addEventListener('oms:drawing-ui-request', event => { notice = (event as CustomEvent).detail; });
    const editor = { getContainer: () => container, getInstanceState: () => ({ isReadonly }) } as unknown as Editor;
    const dxf = new File(['sample'], 'artwork', { type: 'application/x-dxf' });
    const png = new File(['photo'], 'photo.png', { type: 'image/png' });
    assert.equal(drawingFileKind(dxf), 'dxf');
    assert.equal(drawingFileKind(new File(['sample'], 'artwork.pdf', { type: 'image/svg+xml' })), 'pdf');
    assert.deepEqual(routeCanvasCadImport(editor, [dxf, png], { x: 0, y: 0 }, true), [png]);
    assert.deepEqual(notice, { kind: 'import', action: 'reviewFiles', files: [dxf], dropPoint: { x: 0, y: 0 } });
    assert.ok(isDrawingUiRequest(notice));
    assert.deepEqual(routeCanvasCadImport(editor, [png, png]), [png, png]);
    isReadonly = true;
    notice = undefined;
    assert.deepEqual(routeCanvasCadImport(editor, [dxf], undefined, true), []);
    assert.equal(notice, undefined);
  });
});
