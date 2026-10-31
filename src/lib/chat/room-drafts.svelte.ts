export type RoomDraft = { text: string; mentions: string[]; sending: boolean; failed: boolean };

/** Account-scoped, memory-only drafts outlive drawers and keyed room composers. */
export class RoomDraftSession {
  owner = $state('');
  drafts = $state<Record<string, RoomDraft>>({});
  private pending = new WeakSet<RoomDraft>();

  setOwner(owner: string) {
    if (this.owner === owner) return;
    this.owner = owner;
    this.drafts = {};
  }
  reset() { this.owner = ''; this.drafts = {}; }
  ensure(owner: string, roomId: string): RoomDraft | undefined {
    this.setOwner(owner);
    if (!owner || !roomId) return;
    this.drafts[roomId] ??= { text: '', mentions: [], sending: false, failed: false };
    return this.drafts[roomId];
  }
  async submit(owner: string, roomId: string, send: () => Promise<boolean>, currentOwner: () => string): Promise<boolean> {
    const draft = this.owner === owner ? this.drafts[roomId] : undefined;
    if (!draft || !owner || currentOwner() !== owner || this.pending.has(draft)) return false;
    const text = draft.text, mentions = [...draft.mentions];
    const current = () => this.owner === owner && currentOwner() === owner && this.drafts[roomId] === draft;
    this.pending.add(draft); draft.sending = true; draft.failed = false;
    try {
      const confirmed = await send();
      if (!current()) return false;
      if (!confirmed) { draft.failed = true; return false; }
      // Do not erase a newer draft written after this request began.
      if (draft.text === text && draft.mentions.length === mentions.length && draft.mentions.every((id, index) => id === mentions[index])) {
        draft.text = ''; draft.mentions = [];
      }
      return true;
    } catch {
      if (current()) draft.failed = true;
      return false;
    } finally {
      this.pending.delete(draft);
      if (current()) draft.sending = false;
    }
  }
}

export const roomDraftSession = new RoomDraftSession();
