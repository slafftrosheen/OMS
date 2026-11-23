import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  ariaDrawingKeys, drawingCommandPath, drawingCommands, drawingEventKeys, drawingKeyBindings, drawingMenuBar, drawingMenuCommands,
  drawingMenuIds, drawingOwnCommandForKeys, drawingToolbox, drawingToolIds, drawingToolKeys, formatDrawingKeys, type DrawingCommandId,
} from '../../src/lib/components/canvas/drawing-command-map';
import { drawingCommandDictionaries } from '../../src/lib/components/canvas/drawing-command-copy';
import { drawingIconPaths } from '../../src/lib/components/canvas/drawing-icons';
import { matchQuickAccess, type QuickAccessItem } from '../../src/lib/components/canvas/DrawingCommandUi';
import { summarizeDrawingSelection } from '../../src/lib/components/canvas/drawing-status';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';

const commandIds = Object.keys(drawingCommands) as DrawingCommandId[];

describe('OMS Draw command map', () => {
  it('lists the eleven desktop menus in order', () => {
    assert.deepEqual(drawingMenuBar.map(menu => menu.id), [...drawingMenuIds]);
    assert.deepEqual([...drawingMenuIds], ['file', 'edit', 'view', 'layout', 'object', 'effects', 'bitmaps', 'text', 'tools', 'window', 'help']);
  });

  it('reaches every command from at least one menu', () => {
    const reachable = new Set(drawingMenuCommands());
    assert.deepEqual(commandIds.filter(id => !reachable.has(id)), []);
  });

  it('draws an icon for every command and tool', () => {
    for (const id of commandIds) assert.ok(drawingIconPaths[drawingCommands[id].icon], `command ${id}`);
    for (const tool of drawingToolIds) assert.ok(drawingIconPaths[tool], `tool ${tool}`);
  });

  it('places every tool exactly once in the toolbox', () => {
    const placed = drawingToolbox.flatMap(section => section.groups.flatMap(group => group.tools));
    assert.deepEqual([...placed].sort(), [...drawingToolIds].sort());
    assert.equal(new Set(placed).size, placed.length);
  });

  it('keeps toolbox group ids that existing flows rely on', () => {
    const groups = drawingToolbox.flatMap(section => section.groups.map(group => group.id));
    for (const id of ['select', 'nodes', 'hand', 'curves', 'rectangle', 'ellipse', 'shapes', 'text', 'dimension', 'paint', 'clipart']) assert.ok(groups.includes(id), id);
  });

  it('never gives two different actions the same keys', () => {
    // A tool and the command that opens the same thing may share keys (F10 Shape tool = Edit nodes).
    const same: Record<string, string> = { 'tool:nodes': 'command:nodes', 'tool:paint': 'command:paint', 'tool:outline': 'command:outline', 'tool:fx-contour': 'command:contour' };
    // Single-letter align keys only act with two or more objects selected; tools own them otherwise.
    const contextual = new Set(['L', 'R', 'T', 'B', 'C', 'E']);
    const seen = new Map<string, string>();
    for (const binding of drawingKeyBindings()) {
      const id = `${binding.kind}:${binding.id}`;
      const previous = seen.get(binding.keys);
      if (previous && !contextual.has(binding.keys)) {
        assert.ok(same[id] === previous || same[previous] === id, `${binding.keys} is bound to ${previous} and ${id}`);
      }
      if (!previous) seen.set(binding.keys, id);
    }
  });

  it('translates every menu, submenu, command, section and group into LV and RU', () => {
    const { en, lv, ru } = drawingCommandDictionaries;
    for (const dictionary of [lv, ru]) {
      for (const part of ['menus', 'submenus', 'commands', 'sections', 'groups', 'ui', 'shapes'] as const) {
        assert.deepEqual(Object.keys(dictionary[part]).sort(), Object.keys(en[part]).sort(), part);
        for (const [key, value] of Object.entries(dictionary[part])) assert.ok(String(value).trim(), `${part}.${key}`);
      }
      assert.deepEqual(Object.keys(dictionary.tools).sort(), Object.keys(en.tools).sort());
    }
    assert.notEqual(lv.commands.combine, en.commands.combine);
    assert.notEqual(ru.menus.object, en.menus.object);
  });

  it('formats keys for Windows and macOS and for assistive technology', () => {
    assert.equal(formatDrawingKeys('Ctrl+Shift+D', false), 'Ctrl+Shift+D');
    assert.equal(formatDrawingKeys('Ctrl+Shift+D', true), '⌘⇧D');
    assert.equal(formatDrawingKeys('Ctrl+PageUp', false), 'Ctrl+PgUp');
    assert.equal(ariaDrawingKeys('Ctrl+L'), 'Control+L Meta+L');
    assert.equal(ariaDrawingKeys('F12'), 'F12');
    assert.equal(ariaDrawingKeys('Ctrl+/'), 'Control+Slash Meta+Slash');
  });

  it('routes workspace keys to commands and leaves native keys alone', () => {
    const key = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string }> = {}) =>
      drawingOwnCommandForKeys(drawingEventKeys({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }));
    assert.equal(key('e', { ctrlKey: true }), 'export');
    assert.equal(key('i', { metaKey: true }), 'import');
    assert.equal(key('F9'), 'fullscreen');
    assert.equal(key('F7', { altKey: true }), 'transform');
    assert.equal(key('F9', { ctrlKey: true }), 'contour');
    assert.equal(key('F11', { shiftKey: true }), 'paint');
    assert.equal(key('/', { ctrlKey: true }), 'quickAccess');
    assert.equal(key('F1'), 'shortcuts');
    assert.equal(key('Enter', { altKey: true }), 'dock-properties');
    assert.equal(key('®', { altKey: true, shiftKey: true, code: 'KeyR' }), 'rulers');
    assert.equal(key('z', { ctrlKey: true }), undefined, 'undo stays native');
    assert.equal(key('l'), undefined, 'align keys are contextual');
  });

  it('gives every command a menu path for Quick access breadcrumbs', () => {
    assert.deepEqual(drawingCommandPath('combine'), ['object']);
    assert.deepEqual(drawingCommandPath('front'), ['object', 'order']);
    assert.deepEqual(drawingCommandPath('dock-objects'), ['window', 'dockers']);
    for (const id of commandIds) assert.ok(drawingCommandPath(id), id);
  });

  it('lists the tool keys of the desktop suites', () => {
    assert.equal(drawingToolKeys['cad-freehand'], 'F5');
    assert.equal(drawingToolKeys.rectangle, 'F6');
    assert.equal(drawingToolKeys.ellipse, 'F7');
    assert.equal(drawingToolKeys.text, 'F8');
    assert.equal(drawingToolKeys.nodes, 'F10');
    assert.equal(drawingToolKeys.pentagon, 'Y');
    assert.equal(drawingToolKeys.outline, 'F12');
  });
});

describe('Quick access search', () => {
  const item = (label: string, alias = label, enabled = true, keys?: string): QuickAccessItem =>
    ({ key: label, kind: 'command', label, alias, path: 'Object', keys, icon: 'combine', enabled, run: () => undefined });
  const items = [item('Apvienot', 'Combine', true, 'Ctrl+L'), item('Sadalīt', 'Break apart'), item('Convert to curves'), item('Contour (offset)', 'Contour (offset)', false)];

  it('finds commands by local label, English alias, accents or keys', () => {
    assert.equal(matchQuickAccess(items, 'combine')[0].label, 'Apvienot');
    assert.equal(matchQuickAccess(items, 'sadalit')[0].label, 'Sadalīt');
    assert.equal(matchQuickAccess(items, 'ctrl+l')[0].label, 'Apvienot');
  });

  it('ranks label prefixes first and disabled commands last', () => {
    const results = matchQuickAccess(items, 'con').map(result => result.label);
    assert.deepEqual(results, ['Convert to curves', 'Contour (offset)']);
  });

  it('returns everything for an empty query and nothing for noise', () => {
    assert.equal(matchQuickAccess(items, '  ').length, items.length);
    assert.equal(matchQuickAccess(items, 'zzqx').length, 0);
  });
});

describe('Status bar selection summary', () => {
  const theme = { black: { solid: '#1d1d1d' }, red: { solid: '#e03131' } };
  const geo = (color: string, fill: string, geoType = 'rectangle') => ({ id: `shape:${color}${fill}`, type: 'geo', props: { color, fill, geo: geoType }, meta: {} }) as any;

  it('names one object and reports its fill and outline', () => {
    const summary = summarizeDrawingSelection([geo('red', 'solid')], theme);
    assert.equal(summary.type, 'rectangle');
    assert.deepEqual(summary.fill, { kind: 'colour', hex: '#e03131' });
    assert.deepEqual(summary.outline, { kind: 'colour', hex: '#e03131' });
  });

  it('shows no fill as a crossed well and mixed colours as mixed', () => {
    assert.deepEqual(summarizeDrawingSelection([geo('black', 'none')], theme).fill, { kind: 'none' });
    const mixed = summarizeDrawingSelection([geo('black', 'solid'), geo('red', 'solid', 'ellipse')], theme);
    assert.deepEqual(mixed.fill, { kind: 'mixed' });
    assert.equal(mixed.type, null);
    assert.equal(mixed.count, 2);
  });

  it('reads CAD vector paint, including a missing outline', () => {
    const cad = { id: 'shape:cad', type: 'cad-path', props: { color: 'black' }, meta: { omsVectorPaint: { ...structuredClone(VECTOR_DEFAULT_PAINT), fill: '#24412f', stroke: 'none', strokeWidth: 0 } } } as any;
    const summary = summarizeDrawingSelection([cad], theme);
    assert.deepEqual(summary.fill, { kind: 'colour', hex: '#24412f' });
    assert.deepEqual(summary.outline, { kind: 'none' });
  });

  it('reports nothing selected', () => {
    const summary = summarizeDrawingSelection([], theme);
    assert.equal(summary.count, 0);
    assert.equal(summary.fill, null);
  });
});
