import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { DrawingIcon } from './drawing-icons';
import {
  ariaDrawingKeys, drawingCommandPath, drawingCommands, drawingMenuBar, drawingToolKeys, formatDrawingKeys,
  type DrawingCommandId, type DrawingCommandSpec, type DrawingMenuEmbed, type DrawingMenuEntry, type DrawingMenuId, type DrawingToolId,
} from './drawing-command-map';
import { drawingCommandDictionaries, useDrawingCommandText } from './drawing-command-copy';

export interface DrawingCommandState { enabled: boolean; checked?: boolean; run: () => boolean; title?: string }
export type DrawingCommandResolver = (id: DrawingCommandId) => DrawingCommandState;

/** One menu row: icon · label · keys. Check items use aria-pressed and a tick. */
function MenuCommand({ id, state, testId }: { id: DrawingCommandId; state: DrawingCommandState; testId?: string }) {
  const words = useDrawingCommandText();
  const spec: DrawingCommandSpec = drawingCommands[id];
  const label = words.commands[id];
  return <button type="button" className={`drawing-menu-item${spec.check ? ' is-check' : ''}`} disabled={!state.enabled}
    aria-label={label} aria-pressed={spec.check ? !!state.checked : undefined} aria-keyshortcuts={spec.keys ? ariaDrawingKeys(spec.keys) : undefined}
    title={state.title ?? (state.enabled ? undefined : words.ui.disabledHint)} data-testid={testId} data-command={id}
    onClick={state.run}>
    <span className="drawing-menu-item-icon">{spec.check ? state.checked ? <DrawingIcon name="check" size={16} /> : <DrawingIcon name={spec.icon} size={16} /> : <DrawingIcon name={spec.icon} size={16} />}</span>
    <span className="drawing-menu-item-label">{label}</span>
    {spec.keys && <kbd aria-hidden="true">{formatDrawingKeys(spec.keys)}</kbd>}
  </button>;
}

/** One open flyout per level, like a desktop menu. */
function openSubmenu(details: HTMLDetailsElement) {
  details.parentElement?.querySelectorAll<HTMLDetailsElement>(':scope > details.drawing-submenu[open]').forEach(other => { if (other !== details) other.open = false; });
  details.open = true;
}

export function DrawingMenuBar({ resolve, embeds, openMenu, summary, onKeyDown, label }: {
  resolve: DrawingCommandResolver;
  embeds: Partial<Record<DrawingMenuEmbed, ReactNode>>;
  openMenu: string | null;
  summary: (id: DrawingMenuId, text: string) => ReactNode;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  label: string;
}) {
  const words = useDrawingCommandText();
  // A test id belongs to the first visible occurrence only; menus may repeat a command.
  const usedIds = new Set<string>();
  const entries = (items: readonly DrawingMenuEntry[], depth: number): ReactNode[] => items.map((entry, index) => {
    if (entry === '-') return <hr key={`sep-${index}`} />;
    if (typeof entry === 'object' && 'embed' in entry) {
      const content = embeds[entry.embed];
      return content ? <section key={entry.embed} className={`drawing-menu-embed drawing-menu-embed--${entry.embed}`}
        aria-label={entry.embed === 'exportSettings' ? words.ui.exportSettings : entry.embed === 'toolDirectory' ? words.ui.toolDirectory : undefined}>{content}</section> : null;
    }
    if (typeof entry === 'object') {
      const childEnabled = entry.items.some(child => typeof child === 'string' && child !== '-' && resolve(child).enabled);
      return <details key={entry.sub} className="drawing-submenu" data-drawing-submenu={entry.sub}
        onPointerEnter={event => { if (event.pointerType === 'mouse') openSubmenu(event.currentTarget); }}
        onPointerLeave={event => { if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) event.currentTarget.open = false; }}>
        <summary className="drawing-menu-item" aria-disabled={!childEnabled || undefined} aria-haspopup="menu"
          onClick={event => {
            // Hover already opened it; a click must never close a submenu the pointer is on.
            event.preventDefault();
            const details = event.currentTarget.parentElement as HTMLDetailsElement;
            if (event.detail === 0 && details.open) { details.open = false; return; }
            openSubmenu(details);
          }}
          onKeyDown={event => {
            const details = event.currentTarget.parentElement as HTMLDetailsElement;
            if (event.key === 'ArrowRight') {
              event.preventDefault(); event.stopPropagation(); openSubmenu(details);
              requestAnimationFrame(() => details.querySelector<HTMLElement>('.drawing-submenu-popover button:not(:disabled)')?.focus());
            }
          }}>
          <span className="drawing-menu-item-icon" />
          <span className="drawing-menu-item-label">{words.submenus[entry.sub]}</span>
          <span className="drawing-menu-chevron" aria-hidden="true"><DrawingIcon name="chevron" size={14} /></span>
        </summary>
        <div className="drawing-submenu-popover" role="group" aria-label={words.submenus[entry.sub]}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft') return;
            event.preventDefault(); event.stopPropagation();
            const details = event.currentTarget.parentElement as HTMLDetailsElement;
            details.open = false; details.querySelector<HTMLElement>(':scope > summary')?.focus();
          }}>{entries(entry.items, depth + 1)}</div>
      </details>;
    }
    const spec: DrawingCommandSpec = drawingCommands[entry];
    const testId = spec.testId && !usedIds.has(spec.testId) ? spec.testId : undefined;
    if (testId) usedIds.add(testId);
    return <MenuCommand key={`${entry}-${depth}-${index}`} id={entry} state={resolve(entry)} testId={testId} />;
  });
  return <nav className="drawing-menus" aria-label={label} onKeyDown={onKeyDown}>
    {drawingMenuBar.map(menu => <details key={menu.id} className="drawing-menu" data-drawing-menu={menu.id} open={openMenu === menu.id}>
      {summary(menu.id, words.menus[menu.id])}
      <div className={`drawing-menu-popover drawing-menu-popover--list${menu.id === 'tools' || menu.id === 'file' ? ' drawing-menu-popover--wide' : ''}`}>{entries(menu.items, 0)}</div>
    </details>)}
  </nav>;
}

export interface QuickAccessItem { key: string; kind: 'command' | 'tool'; label: string; alias: string; path: string; keys?: string; icon: string; enabled: boolean; checked?: boolean; run: () => void }

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Every word of the query must appear in the label, path, English alias or keys. */
export function matchQuickAccess(items: readonly QuickAccessItem[], query: string): QuickAccessItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  const scored = items.map(item => {
    const label = fold(item.label), haystack = fold(`${item.label} ${item.alias} ${item.path} ${item.keys ?? ''}`);
    if (!words.every(word => haystack.includes(word))) return null;
    const score = (label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2) + (item.enabled ? 0 : 3);
    return { item, score };
  }).filter((entry): entry is { item: QuickAccessItem; score: number } => !!entry);
  return scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label)).map(entry => entry.item);
}

export function buildQuickAccessItems(resolve: DrawingCommandResolver, tools: ReadonlyArray<{ id: DrawingToolId; label: string; icon: string; enabled: boolean; active: boolean; run: () => void }>,
  words: ReturnType<typeof useDrawingCommandText>): QuickAccessItem[] {
  const english = drawingCommandDictionaries.en;
  const commands = (Object.keys(drawingCommands) as DrawingCommandId[]).filter(id => id !== 'quickAccess').map(id => {
    const spec: DrawingCommandSpec = drawingCommands[id]; const state = resolve(id);
    const path = (drawingCommandPath(id) ?? []).map(part => part in words.menus ? words.menus[part as DrawingMenuId] : words.submenus[part as keyof typeof words.submenus]).join(' › ');
    return { key: `command:${id}`, kind: 'command' as const, label: words.commands[id].replace(/…$/, ''), alias: english.commands[id], path, keys: spec.keys, icon: spec.icon, enabled: state.enabled, checked: spec.check ? !!state.checked : undefined, run: state.run };
  });
  const toolItems = tools.map(tool => ({ key: `tool:${tool.id}`, kind: 'tool' as const, label: tool.label, alias: english.tools[tool.id] ?? tool.id, path: words.ui.tool,
    keys: drawingToolKeys[tool.id], icon: tool.icon, enabled: tool.enabled, checked: tool.active || undefined, run: tool.run }));
  return [...toolItems, ...commands];
}

/** Quick access (Ctrl+/) and the keyboard sheet (F1) share one dialog. */
export function DrawingQuickAccess({ mode, items, onClose, onMode }: {
  mode: 'search' | 'shortcuts'; items: QuickAccessItem[]; onClose: () => void; onMode: (mode: 'search' | 'shortcuts') => void;
}) {
  const words = useDrawingCommandText();
  const titleId = useId(), listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const results = useMemo(() => matchQuickAccess(items, query).slice(0, 60), [items, query]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    (mode === 'search' ? input.current : dialog.current?.querySelector<HTMLElement>('button'))?.focus();
  }, [mode]);
  useEffect(() => () => { if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); }, []);
  useEffect(() => { dialog.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  function run(item: QuickAccessItem | undefined) {
    if (!item?.enabled) return;
    opener.current = null; onClose(); requestAnimationFrame(item.run);
  }
  function keys(event: React.KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'Tab') {
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)') ?? []);
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
      return;
    }
    if (mode !== 'search') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
    } else if (event.key === 'Enter') { event.preventDefault(); run(results[active]); }
  }
  const commandRows = items.filter(item => item.kind === 'command' && item.keys);
  const toolRows = items.filter(item => item.kind === 'tool' && item.keys);
  return <div className="drawing-quick-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className={`drawing-quick drawing-quick--${mode}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keys} data-testid="drawing-quick-access">
      <header className="drawing-quick-head">
        <div className="drawing-quick-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'search'} onClick={() => onMode('search')} id={mode === 'search' ? titleId : undefined}>
            <DrawingIcon name="command-search" size={16} />{words.ui.quickAccessTitle}<kbd>{formatDrawingKeys('Ctrl+/')}</kbd></button>
          <button type="button" role="tab" aria-selected={mode === 'shortcuts'} onClick={() => onMode('shortcuts')} id={mode === 'shortcuts' ? titleId : undefined}>
            <DrawingIcon name="shortcuts" size={16} />{words.ui.shortcutsTitle}<kbd>F1</kbd></button>
        </div>
        <button type="button" className="drawing-quick-close" aria-label={words.ui.close} onClick={onClose}><DrawingIcon name="close" size={16} /></button>
      </header>
      {mode === 'search' ? <>
        <input ref={input} className="drawing-quick-input" type="search" role="combobox" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined} placeholder={words.ui.quickAccessPlaceholder}
          aria-label={words.ui.quickAccessPlaceholder} value={query} onChange={event => setQuery(event.target.value)} data-testid="drawing-quick-input" />
        <ul className="drawing-quick-list" role="listbox" id={listId} aria-label={words.ui.quickAccessTitle}>
          {results.map((item, index) => <li key={item.key} id={`${listId}-${index}`} role="option" aria-selected={index === active} aria-disabled={!item.enabled || undefined}
            data-index={index} className={index === active ? 'is-active' : undefined} onPointerMove={() => setActive(index)} onClick={() => run(item)}>
            <span className="drawing-quick-icon"><DrawingIcon name={item.checked ? 'check' : item.icon} size={16} /></span>
            <span className="drawing-quick-label">{item.label}<small>{item.path}</small></span>
            {item.keys && <kbd>{formatDrawingKeys(item.keys)}</kbd>}
          </li>)}
          {!results.length && <li className="drawing-quick-empty" role="presentation">{words.ui.quickAccessEmpty}</li>}
        </ul>
        <footer className="drawing-quick-foot" aria-hidden="true">{words.ui.quickAccessHint}</footer>
      </> : <div className="drawing-quick-sheet" data-testid="drawing-shortcut-sheet">
        <section><h3>{words.ui.shortcutsTools}</h3><dl>{toolRows.map(item => <div key={item.key}><dt><DrawingIcon name={item.icon} size={14} />{item.label}</dt><dd><kbd>{formatDrawingKeys(item.keys!)}</kbd></dd></div>)}</dl></section>
        <section><h3>{words.ui.shortcutsCommands}</h3><dl>{commandRows.map(item => <div key={item.key}><dt><DrawingIcon name={item.icon} size={14} />{item.label}<small>{item.path}</small></dt><dd><kbd>{formatDrawingKeys(item.keys!)}</kbd></dd></div>)}</dl>
          <p className="drawing-help">{words.ui.shortcutsContext}: {words.ui.alignKeysNote}</p></section>
      </div>}
    </div>
  </div>;
}
