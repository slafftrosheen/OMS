import { summarizeScreenContext } from './context-summary';
import { safeScreenData, screenFromPath } from './screen-context';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Local guidance uses only known UI state. It neither calls a model nor infers
 * missing work, product compatibility or the contents of a conversation. */
export function screenGuidance(path: string, value: unknown): { hintKey: string; promptKey: string } {
  const screen = screenFromPath(path), data = record(value), summary = summarizeScreenContext(data);
  const guide = (key: string) => ({ hintKey: `assistant.guide.${key}`, promptKey: `assistant.guidePrompt.${key}` });
  if (summary.loading) return guide('loading');
  if (summary.unavailable) return guide('unavailable');
  if (screen === 'chat') {
    if (data.conversationSelected === false) return guide('chatSelect');
    if (data.draftPresent === true) return guide('chatDraft');
    if (data.hasEarlierMessages === true) return guide('chatHistory');
  }
  if (screen === 'cabinet') {
    if (data.pendingEntry === true || data.pendingAbsence === true) return guide('cabinetDraft');
    if (data.view === 'reports') return guide('cabinetReports');
    if (data.view === 'team') return guide('cabinetTeam');
  }
  if (screen === 'draft') {
    if (data.profileEditorUnsaved === true) return guide('profileDraft');
    if (summary.unsaved) return guide('draft');
  }
  if (['inventory', 'materials'].includes(screen) && summary.rows.some(row => row.key === 'selection' || row.key === 'code')) {
    return guide('catalogSelection');
  }
  return { hintKey: `assistant.intro.${screen}`, promptKey: `assistant.prompt.${screen}` };
}

/** Compare the actual bounded payload, not a wall clock or the raw page. Object
 * key ordering is irrelevant; array order and current workflow availability are
 * meaningful. Kept in memory only, alongside the current conversation. */
export function screenContextSignature(path: string, data: unknown, workflowIds: readonly string[] = []): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sorted(entry)])) : value;
  return JSON.stringify([path, sorted(safeScreenData(data)), [...workflowIds].sort()]);
}

/** Chat context deliberately excludes names, IDs, text, mentions, files and
 * voice data. Even a caller passing a larger object cannot disclose those. */
export function chatScreenContext(input: {
  current: boolean; loading: boolean; error: boolean; selected: boolean;
  roomKind: string | null; visibleMessages: number; hasEarlierMessages: boolean;
  loadingEarlier: boolean; draftPresent: boolean; sending: boolean; voiceAvailable: boolean;
}) {
  const current = input.current === true, selected = current && input.selected === true;
  const ready = selected && !input.loading && !input.error;
  return {
    screen: 'chat', loading: current && input.loading,
    unavailable: !current || input.error,
    conversationSelected: selected,
    conversationKind: selected && ['channel', 'station', 'direct', 'dm'].includes(input.roomKind ?? '') ? input.roomKind : null,
    visibleMessageCount: ready && Number.isSafeInteger(input.visibleMessages) && input.visibleMessages >= 0 ? input.visibleMessages : null,
    hasEarlierMessages: ready ? input.hasEarlierMessages : null,
    loadingEarlier: selected && input.loadingEarlier,
    draftPresent: selected && input.draftPresent,
    sending: selected && input.sending,
    voiceAvailable: selected && input.voiceAvailable,
    messageContentsProvided: false, voiceContentsProvided: false,
    textRetention: 'until-deleted', voiceRetentionCalendarMonths: 3
  };
}
