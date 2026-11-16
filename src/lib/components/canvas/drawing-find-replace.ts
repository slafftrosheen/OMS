import type { Editor, TLShapeId, TLTextShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { fontSupportsText, getLoadedDrawingFont, getShapeDrawingFontId } from './drawing-fonts';

export interface DrawingTextSearchOptions { query: string; replacement: string; matchCase: boolean; wholeWord: boolean; scope: 'page' | 'selection' }
export type DrawingTextSearchError = 'queryRequired' | 'invalidOptions' | 'selectionRequired' | 'searchLimit' | 'replacementLimit' | 'stale' | 'protected' | 'targetsRequired' | 'fontUnavailable' | 'saveLimit' | 'failed';
export interface DrawingTextSearchMatch { id: TLShapeId; name: string; before: string; after: string; occurrences: number; protected: boolean }
export interface DrawingTextSearchPlan { pageId: string; revision: string; options: DrawingTextSearchOptions; matches: DrawingTextSearchMatch[]; occurrences: number; scanned: number }
export type DrawingTextSearchResult<T> = { ok: true; value: T } | { ok: false; error: DrawingTextSearchError };
const MAX_SEARCH_CHARACTERS = 200_000, MAX_RESULTS = 500, MAX_OCCURRENCES = 10_000;
const word = /[\p{L}\p{N}\p{M}\p{Pc}]/u;
function previousCharacter(text: string, index: number): string {
  if (!index) return '';
  const last = text.charCodeAt(index - 1);
  return last >= 0xdc00 && last <= 0xdfff && index > 1 ? text.slice(index - 2, index) : text[index - 1];
}
/** Literal search, with Unicode letter/number/mark boundaries. Replacement dollar
 * signs are ordinary text; user input is never interpreted as a regular expression. */
export function replaceDrawingTextLiteral(text: string, options: DrawingTextSearchOptions) {
  const escaped = options.query.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, options.matchCase ? 'gu' : 'giu');
  let cursor = 0, occurrences = 0, replacement = '';
  for (const match of text.matchAll(expression)) {
    const index = match.index!, end = index + match[0].length;
    const after = end < text.length ? String.fromCodePoint(text.codePointAt(end)!) : '';
    if (options.wholeWord && (word.test(previousCharacter(text, index)) || word.test(after))) continue;
    replacement += text.slice(cursor, index) + options.replacement;
    cursor = end; occurrences++;
    if (occurrences > MAX_OCCURRENCES || replacement.length > 10_000) throw new Error('replacementLimit');
  }
  replacement += text.slice(cursor);
  if (occurrences && replacement.length > 10_000) throw new Error('replacementLimit');
  return { text: replacement, occurrences };
}
export function drawingTextSearchRevision(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPageId(), editor.getCurrentPageShapesSorted()]);
}
function outsideOrderForms(editor: Editor, shape: TLTextShape): boolean {
  let parent = editor.getShape(shape.parentId as TLShapeId);
  const seen = new Set<string>();
  while (parent && !seen.has(parent.id)) {
    if (parent.type !== 'group' && parent.type !== 'frame') return false;
    seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
  }
  return !parent;
}
function failure<T>(error: unknown): DrawingTextSearchResult<T> {
  const message = error instanceof Error ? error.message : '';
  const known = ['queryRequired','invalidOptions','selectionRequired','searchLimit','replacementLimit','stale','protected','targetsRequired','fontUnavailable','saveLimit'];
  return { ok: false, error: known.includes(message) ? message as DrawingTextSearchError : 'failed' };
}
export function prepareDrawingTextSearch(editor: Editor, options: DrawingTextSearchOptions): DrawingTextSearchResult<DrawingTextSearchPlan> {
  try {
    if (typeof options.query !== 'string' || !options.query.length) throw new Error('queryRequired');
    if (options.query.length > 256 || typeof options.replacement !== 'string' || options.replacement.length > 10_000 ||
        typeof options.matchCase !== 'boolean' || typeof options.wholeWord !== 'boolean' || !['page','selection'].includes(options.scope)) throw new Error('invalidOptions');
    const selected = [...editor.getSelectedShapeIds()];
    if (options.scope === 'selection' && !selected.length) throw new Error('selectionRequired');
    const scope = options.scope === 'selection' ? editor.getShapeAndDescendantIds(selected) : null;
    const matches: DrawingTextSearchMatch[] = [];
    let characters = 0, occurrences = 0, scanned = 0;
    const page = editor.getCurrentPageShapesSorted();
    if (page.length > 5000) throw new Error('searchLimit');
    for (const shape of page) {
      if (shape.type !== 'text' || scope && !scope.has(shape.id) || !outsideOrderForms(editor, shape as TLTextShape)) continue;
      const text = shape as TLTextShape;
      characters += text.props.text.length; scanned++;
      if (characters > MAX_SEARCH_CHARACTERS) throw new Error('searchLimit');
      const replaced = replaceDrawingTextLiteral(text.props.text, options);
      if (!replaced.occurrences) continue;
      occurrences += replaced.occurrences;
      matches.push({ id: text.id, name: typeof text.meta.omsObjectName === 'string' && text.meta.omsObjectName.trim()
        ? text.meta.omsObjectName.slice(0,90) : text.props.text.slice(0,90),
        before: text.props.text, after: replaced.text, occurrences: replaced.occurrences,
        protected: editor.isShapeOrAncestorLocked(text) });
      if (matches.length > MAX_RESULTS || occurrences > MAX_OCCURRENCES) throw new Error('searchLimit');
    }
    return { ok: true, value: { pageId: editor.getCurrentPageId(), revision: drawingTextSearchRevision(editor),
      options: { ...options }, matches, occurrences, scanned } };
  } catch (error) { return failure(error); }
}
/** Selection changes caused by locating a result do not change the captured search
 * scope. Any document edit requires a fresh preview, including edits in other text. */
export function applyDrawingTextReplacement(editor: Editor, plan: DrawingTextSearchPlan, targetIds?: readonly TLShapeId[]): DrawingTextSearchResult<number> {
  try {
    if (editor.getInstanceState().isReadonly) throw new Error('protected');
    if (plan.pageId !== editor.getCurrentPageId() || plan.revision !== drawingTextSearchRevision(editor)) throw new Error('stale');
    const ids = targetIds ? [...targetIds] : plan.matches.map(match => match.id);
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !plan.matches.some(match => match.id === id))) throw new Error('targetsRequired');
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== drawingTextSearchRevision(editor) || editor.getInstanceState().isReadonly) throw new Error('stale');
    const changes: Array<{ shape: TLTextShape; text: string; count: number }> = [];
    for (const id of ids) {
      const match = plan.matches.find(entry => entry.id === id)!;
      const shape = editor.getShape<TLTextShape>(id);
      if (!shape || shape.type !== 'text' || !outsideOrderForms(editor, shape) || editor.isShapeOrAncestorLocked(shape)) throw new Error('protected');
      const result = replaceDrawingTextLiteral(shape.props.text, plan.options);
      if (shape.props.text !== match.before || result.text !== match.after || result.occurrences !== match.occurrences) throw new Error('stale');
      if (shape.props.text === result.text) continue;
      const fontId = getShapeDrawingFontId(shape), loaded = fontId ? getLoadedDrawingFont(editor, fontId) : null;
      if (fontId && (!loaded || !fontSupportsText(loaded.font, result.text))) throw new Error('fontUnavailable');
      changes.push({ shape, text: result.text, count: result.occurrences });
    }
    if (!changes.length) return { ok: true, value: 0 };
    const stored = JSON.stringify(editor.store.getStoreSnapshot()).length;
    const increase = changes.reduce((sum, change) => sum + JSON.stringify(change.text).length - JSON.stringify(change.shape.props.text).length, 0);
    if (increase > 0 && stored + increase > 1_850_000) throw new Error('saveLimit');
    const applied = drawingTransaction(editor, () => {
      editor.updateShapes(changes.map(change => ({ id: change.shape.id, type: 'text' as const, props: { text: change.text } })));
      for (const change of changes) {
        const current = editor.getShape<TLTextShape>(change.shape.id);
        // TextShapeUtil may resize and move auto-sized text to preserve its
        // alignment anchor. All formatting and metadata must remain intact.
        if (!current || current.props.text !== change.text || current.type !== 'text' ||
            JSON.stringify(current.meta) !== JSON.stringify(change.shape.meta) ||
            Object.keys(change.shape.props).some(key => !['text','w'].includes(key) &&
              current.props[key as keyof TLTextShape['props']] !== change.shape.props[key as keyof TLTextShape['props']]))
          throw new Error('failed');
      }
      if (JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new Error('saveLimit');
    });
    return applied ? { ok: true, value: changes.reduce((sum, change) => sum + change.count, 0) } : { ok: false, error: 'failed' };
  } catch (error) { return failure(error); }
}
