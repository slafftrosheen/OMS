export type EventKind = 'loading' | 'meeting' | 'note';

export interface BaseEvent {
  id: string;
  kind: EventKind;
  date: string;            // 'YYYY-MM-DD'
  createdAt: string;
  note?: string;
}

export interface LoadingEvent extends BaseEvent {
  kind: 'loading';
  poList: string[];        // multiple POs allowed (no capacity limit)
  carrier?: string;        // NEW field
  window?: { start?: string; end?: string }; // optional time window
}

export interface MeetingEvent extends BaseEvent {
  kind: 'meeting';
  title: string;
  start?: string;          // 'HH:MM'
  end?: string;
  attendees?: string[];    // usernames/roles
  location?: string;
}

export interface NoteEvent extends BaseEvent {
  kind: 'note';
  title?: string;
}

export type CalEvent = LoadingEvent | MeetingEvent | NoteEvent;
