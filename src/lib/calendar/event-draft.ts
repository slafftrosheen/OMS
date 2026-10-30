import type { CalEvent, EventKind } from './types';

/** An editor owns a draft until its target changes; refreshes of the same event
 * must not replace text that the user is still writing. */
export function eventDraftTarget(event: CalEvent | null, dateISO: string, presetKind: EventKind) {
  return event ? `event:${event.id}` : `new:${dateISO}:${presetKind}`;
}

export function createEventDraft(event: CalEvent | null = null, dateISO = '', presetKind: EventKind = 'loading') {
  return {
    id: event?.id,
    createdAt: event?.createdAt,
    kind: event?.kind ?? presetKind,
    selectedDate: event?.date ?? dateISO,
    carrier: event?.kind === 'loading' ? event.carrier ?? '' : '',
    title: event?.kind === 'meeting' || event?.kind === 'note' ? event.title ?? '' : '',
    startTime: event?.kind === 'meeting' ? event.start ?? '09:00' : '09:00',
    endTime: event?.kind === 'meeting' ? event.end ?? '10:00' : '10:00',
    location: event?.kind === 'meeting' ? event.location ?? '' : '',
    notes: event?.note ?? '',
    attendees: event?.kind === 'meeting' ? event.attendees?.join(', ') ?? '' : ''
  };
}
