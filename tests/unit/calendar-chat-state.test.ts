import { describe, it, expect } from 'vitest';
import { createEventDraft, eventDraftTarget } from '../../src/lib/calendar/event-draft';
import { parseOrderChatMessage, reconcileOrderMessages, type OrderChatMessage } from '../../src/lib/components/chat/order-chat-state';
import type { MeetingEvent, NoteEvent } from '../../src/lib/calendar/types';

const meeting: MeetingEvent = { id: 'meeting-a', kind: 'meeting', date: '2026-02-01', createdAt: '2026-01-01T10:00:00Z', title: 'Planning', start: '11:00', end: '12:00', attendees: ['Ann', 'Bob'], note: 'Bring plans' };
const note: NoteEvent = { id: 'note-b', kind: 'note', date: '2026-02-02', createdAt: meeting.createdAt, title: 'Delivery note' };
const message = (id: string, text = id, seconds = 0): OrderChatMessage => ({ id, userId: 'account-a', username: 'Ann', message: text, timestamp: new Date(1767268800000 + seconds * 1000) });

describe('calendar editing targets', () => {
  it('seeds all fields from the next event without carrying prior recipients or times', () => {
    const first = createEventDraft(meeting);
    first.title = 'Unsaved draft';
    first.attendees = 'Private recipients';
    const next = createEventDraft(note);
    expect(next.id).toBe('note-b');
    expect(next.title).toBe('Delivery note');
    expect(next.attendees).toBe('');
    expect(next.notes).toBe('');
    expect(next.selectedDate).toBe('2026-02-02');
  });
  it('keeps a stable edit target across same-event refreshes and changes it for new-event date/type', () => {
    expect(eventDraftTarget(meeting, '', 'loading')).toBe(eventDraftTarget({ ...meeting, title: 'Server refresh' }, '', 'note'));
    expect(eventDraftTarget(meeting, '', 'loading')).not.toBe(eventDraftTarget(note, '', 'loading'));
    expect(eventDraftTarget(null, '2026-02-01', 'meeting')).not.toBe(eventDraftTarget(null, '2026-02-02', 'meeting'));
    expect(eventDraftTarget(null, '2026-02-01', 'meeting')).not.toBe(eventDraftTarget(null, '2026-02-01', 'note'));
  });
  it('gives a newly selected meeting useful time defaults without modifying its input event', () => {
    const draft = createEventDraft(null, '2026-02-01', 'meeting');
    expect(draft.startTime).toBe('09:00');
    expect(draft.endTime).toBe('10:00');
    const existing = createEventDraft(meeting);
    expect(existing.startTime).toBe('11:00');
    existing.title = 'Changed';
    expect(meeting.title).toBe('Planning');
  });
});

describe('order conversation reconciliation', () => {
  it('retains acknowledged sends, edits and deletes when an older GET arrives', () => {
    const changes = new Map<string, OrderChatMessage | null>([
      ['edited', message('edited', 'New text', 1)], ['deleted', null], ['new', message('new', 'Just sent', 2)]
    ]);
    const result = reconcileOrderMessages([message('edited', 'Old text', 1), message('deleted'), message('unchanged')], changes);
    expect(result.map(item => item.id)).toEqual(['unchanged', 'edited', 'new']);
    expect(result.find(item => item.id === 'edited')?.message).toBe('New text');
  });
  it('deduplicates provider acknowledgements already returned by a simultaneous GET', () => {
    const confirmed = message('same', 'Confirmed');
    expect(reconcileOrderMessages([confirmed, confirmed], new Map([['same', confirmed]]))).toHaveLength(1);
  });
  it('normalizes valid server timestamps and rejects broken rows before rendering dates', () => {
    const raw = { ...message('row'), timestamp: '2026-02-01T12:00:00Z', attachments: ['https://example.test/file', 42] };
    const parsed = parseOrderChatMessage(raw);
    expect(parsed?.timestamp.toISOString()).toBe('2026-02-01T12:00:00.000Z');
    expect(parsed?.attachments).toEqual(['https://example.test/file']);
    expect(parseOrderChatMessage({ ...raw, timestamp: 'not a date' })).toBe(null);
    expect(parseOrderChatMessage({ ...raw, message: undefined })).toBe(null);
    expect(parseOrderChatMessage(null)).toBe(null);
  });
});
