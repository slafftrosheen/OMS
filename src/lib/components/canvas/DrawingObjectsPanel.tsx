import { isProductionLayerHidden, isProductionLayerProtected } from './cad-production-layers';
import { useCadText } from './cad-copy';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useEditor, useValue, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { drawingObjectAlias, drawingObjectName, renameDrawingObject } from './drawing-operations';
import { toggleDrawingObjectLock } from './drawing-commands';
import { applyDrawingObjectOrder, canReorderDrawingObjects, captureDrawingObjectStack, drawingObjectAncestors, drawingObjectTree, prepareDrawingObjectOrder, reorderDrawingObjects, selectDrawingObject, type DrawingObjectOrderOperation, type DrawingObjectRow, type ObjectSelectionOptions, type ObjectStackAction } from './drawing-object-tree';
import { useObjectTreeText } from './object-tree-copy';
import { CadProductionLayers } from './CadProductionLayers';
import './drawing-objects.css';

const sessions = new WeakMap<Editor, { page: string; search: string; collapsed: Set<TLShapeId> }>();

export function DrawingObjectsPanel({ focusRequest = 0, layerFocusRequest = 0 }: { focusRequest?: number; layerFocusRequest?: number } = {}) {
  const editor = useEditor(), t = useObjectTreeText(), helpId = useId();
  const { label } = useCadText();
  const state = useValue('drawing object hierarchy', () => ({ page: editor.getCurrentPageId(), shapes: editor.getCurrentPageShapesSorted(),
    selected: editor.getSelectedShapeIds(), readonly: editor.getInstanceState().isReadonly, canReorder: canReorderDrawingObjects(editor), stack: captureDrawingObjectStack(editor),
    locked: new Set(editor.getCurrentPageShapesSorted().filter(shape => editor.isShapeOrAncestorLocked(shape)).map(shape => shape.id)) }), [editor]);
  const saved = sessions.get(editor);
  const [search, setSearch] = useState(saved?.page === state.page ? saved.search : '');
  const [collapsed, setCollapsed] = useState<Set<TLShapeId>>(() => saved?.page === state.page ? saved.collapsed : new Set());
  const [focused, setFocused] = useState<TLShapeId | null>(null), [failed, setFailed] = useState(false);
  const [renaming, setRenaming] = useState(false), [draft, setDraft] = useState('');
  const [orderTarget, setOrderTarget] = useState<{ id: TLShapeId; signature: string } | null>(null);
  const rowRefs = useRef(new Map<TLShapeId, HTMLDivElement>()), nameRef = useRef<HTMLInputElement>(null), anchor = useRef<TLShapeId | null>(null);
  const relativeOrderRef = useRef<HTMLDetailsElement>(null), referenceRef = useRef<HTMLSelectElement>(null);
  const lastPage = useRef(state.page);
  useEffect(() => {
    if (lastPage.current !== state.page) { lastPage.current = state.page; setSearch(''); setCollapsed(new Set()); setFocused(null); anchor.current = null; }
  }, [state.page]);
  useEffect(() => { sessions.set(editor, { page: state.page, search, collapsed }); }, [editor, state.page, search, collapsed]);
  const rows = useMemo(() => drawingObjectTree(state.shapes, collapsed, search), [state.shapes, collapsed, search]);
  const ids = rows.map(row => row.shape.id);
  const selectableIds = rows.filter(row => !isProductionLayerHidden(row.shape)).map(row => row.shape.id);
  const tabId = focused && ids.includes(focused) ? focused : state.selected.find(id => ids.includes(id)) ?? ids[0];
  const single = state.selected.length === 1 ? state.shapes.find(shape => shape.id === state.selected[0]) : undefined;
  const alias = single ? drawingObjectAlias(single) : '';
  const renameDisabled = !single || state.readonly || [...editor.getShapeAndDescendantIds([single.id])].some(id => state.locked.has(id));
  useEffect(() => { setDraft(alias); setFailed(false); setRenaming(false); }, [single?.id, alias]);
  useEffect(() => { if (renaming) { nameRef.current?.focus(); nameRef.current?.select(); } }, [renaming]);
  useEffect(() => {
    if (!focusRequest || !relativeOrderRef.current) return;
    relativeOrderRef.current.open = true;
    const request = requestAnimationFrame(() => {
      if (referenceRef.current && !referenceRef.current.disabled) referenceRef.current.focus();
      else relativeOrderRef.current?.querySelector('summary')?.focus();
    });
    return () => cancelAnimationFrame(request);
  }, [focusRequest]);
  useEffect(() => { setOrderTarget(null); }, [state.stack?.signature]);
  const orderTargets = state.stack?.siblings.filter(shape => !state.stack!.selected.includes(shape.id)).slice().reverse() ?? [];
  const target = orderTarget?.signature === state.stack?.signature ? orderTarget?.id : undefined;
  const order = (operation: DrawingObjectOrderOperation) => {
    const plan = prepareDrawingObjectOrder(editor, operation);
    // Bind a click to the selection/stack represented by the current controls.
    const ok = !!plan && plan.signature === state.stack?.signature && applyDrawingObjectOrder(editor, plan);
    setFailed(!ok);
    if (ok) setOrderTarget(null);
  };
  const focusRow = (id: TLShapeId | undefined) => { if (!id) return; setFocused(id); rowRefs.current.get(id)?.focus(); };
  const toggle = (id: TLShapeId) => { setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const select = (id: TLShapeId, options: ObjectSelectionOptions = {}) => {
    if (!selectableIds.includes(id)) return;
    setFailed(!selectDrawingObject(editor, selectableIds, id, { ...options, anchor: anchor.current }));
    if (!options.range || !anchor.current) anchor.current = id;
    setFocused(id);
  };
  const reveal = () => {
    setSearch(''); setCollapsed(previous => {
      const next = new Set(previous);
      for (const id of state.selected) for (const parent of drawingObjectAncestors(state.shapes, id)) next.delete(parent);
      return next;
    });
    const id = state.selected[0]; if (id) { setFocused(id); requestAnimationFrame(() => focusRow(id)); }
  };
  const onTreeKey = (event: React.KeyboardEvent<HTMLDivElement>, row: DrawingObjectRow) => {
    if (event.target !== event.currentTarget) return;
    const index = ids.indexOf(row.shape.id), additive = event.ctrlKey || event.metaKey;
    let next: TLShapeId | undefined;
    if (event.key === 'ArrowDown') next = ids[Math.min(ids.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') next = ids[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = ids[0];
    else if (event.key === 'End') next = ids.at(-1);
    else if (event.key === 'ArrowRight') {
      if (row.children && !row.expanded && !search.trim()) toggle(row.shape.id);
      else if (rows[index + 1]?.parent === row.shape.id) next = rows[index + 1].shape.id;
    } else if (event.key === 'ArrowLeft') {
      if (row.children && row.expanded && !search.trim()) toggle(row.shape.id);
      else if (row.parent) next = row.parent;
    } else if (event.key === ' ' || event.key === 'Enter') select(row.shape.id, { toggle: additive, range: event.shiftKey });
    else if (event.key === 'F2') {
      select(row.shape.id); setRenaming(true);
      // Selecting a different row resets the form; focus after that render.
      requestAnimationFrame(() => { setRenaming(true); requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.select(); }); });
    } else return;
    event.preventDefault(); event.stopPropagation();
    if (next) { focusRow(next); if (event.shiftKey) { if (!anchor.current) anchor.current = row.shape.id; select(next, { range: true, toggle: additive }); } }
  };
  const hiddenSelected = state.selected.filter(id => !ids.includes(id)).length;
  return <section className="drawing-objects-panel" data-testid="drawing-objects-panel" onKeyDown={event => event.stopPropagation()}>
    <CadProductionLayers focusRequest={layerFocusRequest} />
    <p className="drawing-help" aria-live="polite">{t('count').replace('{total}', String(state.shapes.length)).replace('{selected}', String(state.selected.length))}{hiddenSelected > 0 && <> · {t('hidden').replace('{count}', String(hiddenSelected))}</>}</p>
    <label className="drawing-object-search"><span>{t('search')}</span><input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
    <div className="drawing-tree-actions">
      <button type="button" disabled={!rows.length || !!search.trim()} onClick={() => setCollapsed(new Set())}>{t('expandAll')}</button>
      <button type="button" disabled={!rows.length || !!search.trim()} onClick={() => setCollapsed(new Set(state.shapes.map(shape => shape.id)))}>{t('collapseAll')}</button>
      <button type="button" disabled={!state.selected.length} onClick={reveal}>{t('reveal')}</button>
    </div>
    <p className="drawing-help" id={helpId}>{t('help')}</p>
    <div role="tree" aria-label={t('title')} aria-multiselectable="true" aria-describedby={helpId} className="drawing-object-tree" data-testid="drawing-object-tree">
      {rows.map(row => {
        const shape = row.shape, selected = state.selected.includes(shape.id), locked = state.locked.has(shape.id);
        const parentLocked = state.locked.has(shape.parentId as TLShapeId), name = drawingObjectName(shape);
        const hiddenByLayer = isProductionLayerHidden(shape), layerProtected = isProductionLayerProtected(shape);
        return <div key={shape.id} ref={node => { if (node) rowRefs.current.set(shape.id, node); else rowRefs.current.delete(shape.id); }}
          role="treeitem" aria-label={`${name}${hiddenByLayer ? `, ${label('productionHiddenObject')}` : locked ? `, ${t('locked')}` : ''}`} aria-level={row.depth + 1} aria-posinset={row.position} aria-setsize={row.siblings}
          aria-expanded={row.children ? row.expanded : undefined} aria-selected={selected} aria-disabled={hiddenByLayer || undefined} tabIndex={shape.id === tabId ? 0 : -1}
          className={`drawing-tree-row${selected ? ' is-selected' : ''}${search.trim() && !row.matched ? ' is-context' : ''}`}
          style={{ paddingInlineStart: Math.min(row.depth, 8) * 12 + 3 }} data-testid="drawing-object-row"
          onFocus={() => setFocused(shape.id)} onKeyDown={event => onTreeKey(event, row)}
          onClick={event => { select(shape.id, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey }); focusRow(shape.id); }}
          onDoubleClick={() => { if (!hiddenByLayer) { select(shape.id); editor.zoomToSelection(); } }}>
          {row.children ? <button type="button" tabIndex={-1} className="drawing-tree-expander" disabled={!!search.trim()} aria-label={t(row.expanded ? 'collapse' : 'expand')} onClick={event => { event.stopPropagation(); toggle(shape.id); }} onDoubleClick={event => event.stopPropagation()}><TreeIcon kind={row.expanded ? 'expanded' : 'collapsed'} /></button> : <span className="drawing-tree-expander" />}
          <TreeIcon kind={shape.type === 'group' || row.children ? 'group' : shape.type === 'text' ? 'text' : shape.type === 'image' || shape.type === 'document' ? 'file' : 'object'} />
          <span className="drawing-tree-name" title={name}>{name}</span>{hiddenByLayer && <small>{label('productionHiddenObject')}</small>}{row.children > 0 && <span className="drawing-tree-count" aria-hidden="true">{row.children}</span>}
          <button type="button" tabIndex={-1} className="drawing-tree-lock" title={layerProtected ? label('productionObjectProtected') : parentLocked ? t('lockedParent') : t(shape.isLocked ? 'unlock' : 'lock')} aria-label={t(shape.isLocked ? 'unlock' : 'lock')} disabled={state.readonly || parentLocked || layerProtected}
            onClick={event => { event.stopPropagation(); setFailed(!toggleDrawingObjectLock(editor, shape.id)); }} onDoubleClick={event => event.stopPropagation()}><TreeIcon kind={locked ? 'lock' : 'unlock'} /></button>
        </div>;
      })}
    </div>
    {!rows.length && <p className="drawing-help">{t(search.trim() ? 'noMatches' : 'empty')}</p>}
    <div className="drawing-tree-actions" aria-label={t('stack')}>
      {(['front', 'forward', 'backward', 'back'] as const).map((action: ObjectStackAction) => <button type="button" key={action} disabled={!state.canReorder} onClick={() => setFailed(!reorderDrawingObjects(editor, action))}>{t(action)}</button>)}
      <button type="button" disabled={!state.stack || state.stack.selected.length < 2} onClick={() => order({ kind: 'reverse' })} data-testid="drawing-object-reverse-order">{t('reverse')}</button>
    </div>
    <p className="drawing-help">{t('stackHint')}</p>
    <details ref={relativeOrderRef} className="drawing-object-relative-order" data-testid="drawing-object-relative-order">
      <summary>{t('relativeOrder')}</summary>
      <label className="drawing-object-reference"><span>{t('referenceObject')}</span>
        <select ref={referenceRef} value={target ?? ''} disabled={!state.stack || !orderTargets.length} data-testid="drawing-object-order-reference"
          onChange={event => { setOrderTarget(event.target.value && state.stack ? { id: event.target.value as TLShapeId, signature: state.stack.signature } : null); setFailed(false); }}>
          <option value="">{t('chooseReference')}</option>
          {orderTargets.map(shape => <option key={shape.id} value={shape.id}>{state.stack!.siblings.length - state.stack!.siblings.indexOf(shape)}. {drawingObjectName(shape)}</option>)}
        </select>
      </label>
      <div className="drawing-tree-actions">
        <button type="button" disabled={!target} onClick={() => target && order({ kind: 'relative', target, side: 'front' })} data-testid="drawing-object-in-front">{t('inFrontOf')}</button>
        <button type="button" disabled={!target} onClick={() => target && order({ kind: 'relative', target, side: 'behind' })} data-testid="drawing-object-behind">{t('behind')}</button>
      </div>
      <p className="drawing-help">{t('relativeHint')}</p>
      {!orderTargets.length && <p className="drawing-help">{t('noReference')}</p>}
    </details>
    {single && <>
      <div className="drawing-tree-actions"><button type="button" disabled={renameDisabled} onClick={() => setRenaming(value => !value)}>{t('rename')}</button><button type="button" disabled={state.readonly || isProductionLayerProtected(single) || state.locked.has(single.parentId as TLShapeId)} onClick={() => setFailed(!toggleDrawingObjectLock(editor, single.id))}>{t(single.isLocked ? 'unlock' : 'lock')}</button><button type="button" onClick={() => editor.zoomToSelection()}>{t('locate')}</button></div>
      {renaming && <form className="drawing-object-name" onSubmit={event => { event.preventDefault(); const ok = renameDrawingObject(editor, single.id, draft); setFailed(!ok); if (ok) setRenaming(false); }}>
        <label><span>{t('name')}</span><input ref={nameRef} disabled={renameDisabled} maxLength={80} value={draft} placeholder={drawingObjectName(single)} onChange={event => { setDraft(event.target.value); setFailed(false); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setRenaming(false); focusRow(single.id); } }} /></label>
        <button type="submit" disabled={renameDisabled}>{t('applyName')}</button><p className="drawing-help">{t('renameHint')}</p>
      </form>}
    </>}
    {failed && <p role="alert" className="drawing-help">{t('failed')}</p>}
  </section>;
}

function TreeIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = { expanded: 'm4 6 4 4 4-4', collapsed: 'm6 4 4 4-4 4', group: 'M2 3h12v10H2z M5 6h6v4H5z', text: 'M3 3h10 M8 3v10 M5 13h6', file: 'M3 2h6l4 4v8H3z M9 2v4h4', object: 'M3 3h10v10H3z', lock: 'M4 7h8v7H4z M5 7V4a3 3 0 0 1 6 0v3', unlock: 'M4 7h8v7H4z M5 7V4a3 3 0 0 1 6 0' };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" focusable="false"><path d={paths[kind] ?? paths.object} /></svg>;
}
