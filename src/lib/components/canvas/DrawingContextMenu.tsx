import React, { useRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  TldrawUiMenuGroup, TldrawUiMenuSubmenu, TldrawUiMenuContextProvider,
  useEditor, useEditorComponents, useMenuIsOpen, useValue, type Editor,
} from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';
import { assertCadEditable } from './cad-plans';
import { useDrawingText } from './drawing-copy';
import { useWorkbenchText } from './workbench-copy';
import { useArrangeTaskText } from './arrange-task-copy';
import { useOutlineText } from './outline-copy';
import { useOutlineToObjectText } from './outline-object-copy';
import { useObjectTreeText } from './object-tree-copy';
import { useDrawingCommandText } from './drawing-command-copy';
import { captureDrawingObjectStack, prepareDrawingObjectOrder } from './drawing-object-tree';
import { requestDrawingUi, type DrawingUiRequest } from './drawing-ui-requests';

/** Reuse the editor's menu positioning, pointer selection, submenus, focus and
 * keyboard handling; every offered edit routes through the OMS command guards. */
export function DrawingContextMenu() {
  const editor = useEditor();
  const { Canvas } = useEditorComponents();
  const blockedPointer = useRef(false);
  const idle = useValue('context menu interaction', () => editor.isIn('select.idle'), [editor]);
  const [open, setOpen] = useMenuIsOpen('context-menu');
  const protectedTarget = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),a[href],button,video,audio,iframe');
  return <div className="drawing-context-surface" onKeyDownCapture={event => {
    if (event.target instanceof Element && event.target.closest('.tlui-menu'))
      (event.nativeEvent as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
  }} onPointerDownCapture={event => {
    blockedPointer.current = protectedTarget(event.target);
  }} onContextMenuCapture={event => {
    const target = event.target;
    blockedPointer.current = protectedTarget(target);
    if (blockedPointer.current) {
      // Keep the browser's text editing and media menus available inside forms.
      event.stopPropagation();
    } else if (!editor.isIn('select.idle')) {
      // Right-click must not finish an in-progress CAD or text gesture.
      event.preventDefault(); event.stopPropagation();
    }
  }}>
    <ContextMenu.Root modal={false} onOpenChange={next => {
      // Radix also opens from a touch/pen long-press without a contextmenu
      // event. Guard that path before useMenuIsOpen can complete a CAD gesture.
      if (next && (blockedPointer.current || !editor.isIn('select.idle'))) return;
      setOpen(next);
    }}>
      <ContextMenu.Trigger disabled={!idle} dir="ltr">{Canvas ? <Canvas /> : null}</ContextMenu.Trigger>
      {open && <ContextMenu.Portal container={editor.getContainer()}>
        <ContextMenu.Content className="tlui-menu scrollable" data-testid="context-menu" alignOffset={-4} collisionPadding={4}
          onContextMenu={event => event.preventDefault()}>
          <TldrawUiMenuContextProvider type="context-menu" sourceId="context-menu">
            <DrawingContextMenuContent />
          </TldrawUiMenuContextProvider>
        </ContextMenu.Content>
      </ContextMenu.Portal>}
    </ContextMenu.Root>
  </div>;
}

/** Shift+F10 uses the selected geometry's visible center, or the viewport center.
 * Dispatch to the actual canvas so the native context-menu trigger receives it. */
export function openDrawingContextMenu(editor: Editor): boolean {
  if (!editor.isIn('select.idle')) return false;
  const canvas = editor.getContainer().querySelector<HTMLElement>('.tl-canvas');
  if (!canvas) return false;
  const viewport = canvas.getBoundingClientRect();
  const selection = editor.getSelectionPageBounds();
  const point = selection ? editor.pageToScreen(selection.center)
    : { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
  canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
    clientX: Math.max(viewport.left + 8, Math.min(viewport.right - 8, point.x)),
    clientY: Math.max(viewport.top + 8, Math.min(viewport.bottom - 8, point.y)) }));
  return true;
}

function DrawingContextMenuContent() {
  const editor = useEditor(), { label, tr } = useDrawingText();
  const workbench = useWorkbenchText(), arrange = useArrangeTaskText();
  const outline = useOutlineText(), outlineObject = useOutlineToObjectText();
  const objects = useObjectTreeText();
  const { commands } = useDrawingCommandText();
  const state = useValue('OMS context selection', () => {
    const controls = captureToolkitControls(editor), shapes = editor.getSelectedShapes();
    let editable = controls.canEditSelection;
    try { assertCadEditable(editor, [...editor.getSelectedShapeIds()]); } catch { editable = false; }
    const stack = captureDrawingObjectStack(editor);
    return { controls, editable, canReverse: !!stack && stack.selected.length > 1,
      canMoveToLayerFront: editable && !!prepareDrawingObjectOrder(editor, { kind: 'layer-edge', side: 'front' }),
      canMoveToLayerBack: editable && !!prepareDrawingObjectOrder(editor, { kind: 'layer-edge', side: 'behind' }),
      text: shapes.length === 1 && shapes[0].type === 'text',
      curve: shapes.length === 1 && ['cad-path', 'cad-bezier'].includes(shapes[0].type),
      drawing: shapes.length > 0 && shapes.every(shape => ['group', 'geo', 'draw', 'highlight', 'line', 'arrow',
        'text', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc'].includes(shape.type)) };
  }, [editor]);
  const { controls, editable } = state;
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const item = (id: string, text: string, request: DrawingUiRequest, enabled = true, kbd?: string) => {
    if (!enabled) return null;
    // tldraw 2.4 splits shortcut strings into single characters; literal key
    // names keep Home, PageUp and the function keys readable as one key.
    const shortcut = kbd?.replace('$!', `${modifier}+Shift+`).replace('$', `${modifier}+`).replace('!', 'Shift+');
    return <ContextMenu.Item key={id} className="tlui-button tlui-button__menu" data-testid={`context-menu.oms-${id}`}
      title={shortcut ? `${text} (${shortcut})` : text} onSelect={() => requestDrawingUi(editor, request)}>
      <span className="tlui-button__label">{text}</span>
      {shortcut && <kbd className="drawing-context-shortcut" aria-hidden="true">{shortcut}</kbd>}
    </ContextMenu.Item>;
  };
  const command = (action: Extract<DrawingUiRequest, { kind: 'command' }>['action'], text: string,
    enabled = editable, kbd?: string) => item(action, text, { kind: 'command', action }, enabled, kbd);
  const panel = (action: Extract<DrawingUiRequest, { kind: 'panel' }>['action'], text: string, enabled = true) =>
    item(action, text, { kind: 'panel', action }, enabled);

  return <>
    <TldrawUiMenuGroup id="oms-history">
      {command('undo', tr('toolkit.canvas.undoTitle'), controls.canUndo, '$z')}
      {command('redo', tr('toolkit.canvas.redoTitle'), controls.canRedo, '$!z')}
    </TldrawUiMenuGroup>
    <TldrawUiMenuGroup id="oms-edit">
      {state.text && panel('text', label('editText'), editable)}
      {state.curve && item('nodes', workbench('nodes'), { kind: 'cad', action: 'nodes' }, editable, 'F10')}
      {command('duplicate', tr('toolkit.toolbar.duplicate'), editable, '$d')}
      {command('delete', tr('toolkit.canvas.deleteSelected'), editable, '⌫')}
      {command('group', tr('toolkit.toolbar.group'), editable && controls.canGroup, '$g')}
      {command('ungroup', tr('toolkit.toolbar.ungroup'), editable && controls.canUngroup, '$u')}
    </TldrawUiMenuGroup>
    <TldrawUiMenuGroup id="oms-arrange">
      <TldrawUiMenuSubmenu id="oms-transform" label={arrange('transform')} disabled={!editable}>
        {panel('transform', arrange('transform'))}
        {panel('align', arrange('align'), controls.canAlign)}
        {panel('repeat', label('repeatGrid'))}
        {panel('radial', arrange('radial'))}
        <TldrawUiMenuGroup id="oms-mirror">
          {command('flip-horizontal', label('flipHorizontal'))}
          {command('flip-vertical', label('flipVertical'))}
          {command('rotate-left', label('rotateLeft'))}
          {command('rotate-right', label('rotateRight'))}
        </TldrawUiMenuGroup>
      </TldrawUiMenuSubmenu>
      <TldrawUiMenuSubmenu id="oms-order" label={label('objectOrder')} disabled={!editable}>
        {command('front', tr('toolkit.toolbar.front'), editable, '$Home')}
        {command('frontLayer', commands.frontLayer, state.canMoveToLayerFront, '!PageUp')}
        {command('forward', label('forward'), editable, '$PageUp')}
        {command('backward', label('backward'), editable, '$PageDown')}
        {command('backLayer', commands.backLayer, state.canMoveToLayerBack, '!PageDown')}
        {command('back', tr('toolkit.toolbar.back'), editable, '$End')}
        {item('relative-order', objects('relativeOrder'), { kind: 'objects', action: 'relative' })}
        {item('reverse-order', objects('reverse'), { kind: 'objects', action: 'reverse' }, state.canReverse)}
      </TldrawUiMenuSubmenu>
      {command('lock', label('lock'))}
    </TldrawUiMenuGroup>
    {editable && state.drawing && <TldrawUiMenuGroup id="oms-curves">
      {command('convert', commands.convert, editable, '$q')}
      {item('outline', outline('title'), { kind: 'cad', action: 'outline' }, true, 'F12')}
      {item('outline-object', outlineObject('title'), { kind: 'cad', action: 'outlineObject' }, true, '$!q')}
      {item('fill', label('fill'), { kind: 'cad', action: 'paint' })}
    </TldrawUiMenuGroup>}
    <TldrawUiMenuGroup id="oms-inspect">
      {panel('properties', label('properties'))}
      {panel('objects', label('objects'))}
      {command('fit-selection', tr('toolkit.toolbar.fitSelection'), controls.canFitSelection, '!F2')}
      {command('fit', tr('toolkit.canvas.fit'), controls.hasShapes, 'F4')}
      {!controls.selected && item('document', workbench('document'), { kind: 'cad', action: 'document' }, !controls.readOnly)}
      {!controls.selected && command('select-all', label('selectAll'), controls.hasShapes, '$a')}
    </TldrawUiMenuGroup>
  </>;
}
