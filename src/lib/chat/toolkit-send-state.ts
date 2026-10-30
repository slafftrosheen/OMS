/** Restore a failed send in its original conversation. The currently visible
 * input and any newer per-session draft take precedence over the old prompt.
 */
export function restoreToolkitDraft(
  drafts: Map<string, string>, sessionId: string, sentText: string,
  activeSessionId: string | null, currentInput: string
): string {
  const active = activeSessionId === sessionId;
  const currentDraft = active ? currentInput : drafts.get(sessionId) ?? '';
  if (currentDraft) return currentInput;
  drafts.set(sessionId, sentText);
  return active ? sentText : currentInput;
}

/** A successful POST returns database IDs for both messages. Replacing the
 * optimistic ID and deduplicating by confirmed identity also tolerates a
 * history response that already contains either acknowledged message.
 */
export function confirmToolkitMessages<T extends { id: string }>(
  messages: T[], optimisticId: string, userMessageId: string, assistant: T
): T[] {
  const seen = new Set<string>();
  return [...messages.map(message => message.id === optimisticId
    ? { ...message, id: userMessageId } : message), assistant].filter(message => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}
