<script lang="ts">
  import { upsertLoad } from '$lib/state/loads';
  import { addEvent, updateEvent } from './store';
  import type { CalEvent, MeetingEvent, NoteEvent } from './types';
  
  export let dateISO: string;                 // yyyy-mm-dd
  export let event: CalEvent | null = null;   // edit path
  export let presetKind:'loading'|'meeting'|'note'='loading';
  export let onClose = () => {};

  let kind = event?.kind ?? presetKind;
  let selectedDate = event?.date ?? dateISO;
  let carrier = (event?.kind === 'loading' ? event.carrier : '') ?? '';
  let title = (event?.kind === 'meeting' || event?.kind === 'note' ? event.title : '') ?? '';
  let startTime = (event?.kind === 'meeting' ? event.start : '') ?? '09:00';
  let endTime = (event?.kind === 'meeting' ? event.end : '') ?? '10:00';
  let location = (event?.kind === 'meeting' ? event.location : '') ?? '';
  let notes = event?.note ?? '';
  let attendees = (event?.kind === 'meeting' ? event.attendees?.join(', ') : '') ?? '';

  function save() {
    if (kind === 'loading') {
      upsertLoad({ id: selectedDate, carrier, notes });
    } else if (kind === 'meeting') {
      const meetingEvent: MeetingEvent = {
        id: event?.id ?? `meeting-${Date.now()}`,
        kind: 'meeting',
        date: selectedDate,
        title: title || 'Meeting',
        start: startTime,
        end: endTime,
        location: location || undefined,
        attendees: attendees ? attendees.split(',').map(a => a.trim()).filter(Boolean) : undefined,
        note: notes || undefined,
        createdAt: event?.createdAt ?? new Date().toISOString()
      };
      if (event) {
        updateEvent(meetingEvent);
      } else {
        addEvent(meetingEvent);
      }
    } else if (kind === 'note') {
      const noteEvent: NoteEvent = {
        id: event?.id ?? `note-${Date.now()}`,
        kind: 'note',
        date: selectedDate,
        title: title || notes || 'Note',
        note: notes || undefined,
        createdAt: event?.createdAt ?? new Date().toISOString()
      };
      if (event) {
        updateEvent(noteEvent);
      } else {
        addEvent(noteEvent);
      }
    }
    
    if (onClose) {
      onClose();
    } else {
      dispatchEvent(new CustomEvent('close'));
    }
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Event">
  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <strong>{event ? 'Edit' : 'Create'} Event</strong>
      <button class="tag ghost" on:click={() => onClose ? onClose() : dispatchEvent(new CustomEvent('close'))}>Close</button>
    </div>

    <label>Type
      <select bind:value={kind}>
        <option value="loading">Loading</option>
        <option value="meeting">Meeting</option>
        <option value="note">Note</option>
      </select>
    </label>

    <label>Date
      <input type="date" bind:value={selectedDate} />
    </label>

    {#if kind === 'loading'}
      <label>Carrier <input bind:value={carrier} placeholder="DHL / Own truck"/></label>
      <label>Notes <textarea rows="3" bind:value={notes}/></label>
    {:else if kind === 'meeting'}
      <label>Title <input bind:value={title} placeholder="Project sync / Site visit" required/></label>
      <div class="row" style="gap:6px">
        <label>Start time <input type="time" bind:value={startTime}></label>
        <label>End time <input type="time" bind:value={endTime}></label>
      </div>
      <label>Location <input bind:value={location} placeholder="Workshop / Customer site"/></label>
      <label>Attendees <input bind:value={attendees} placeholder="Comma-separated names"/></label>
      <label>Notes <textarea rows="3" bind:value={notes}/></label>
    {:else}
      <label>Title <input bind:value={title} placeholder="Quick note title"/></label>
      <label>Notes <textarea rows="3" bind:value={notes} placeholder="Add your note here..."/></label>
    {/if}

    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
      <button class="tag ghost" on:click={()=>onClose ? onClose() : dispatchEvent(new CustomEvent('close'))}>Cancel</button>
      <button class="tag" on:click={save}>Save</button>
    </div>
  </div>
</div>

<style>
.sheet{ position:fixed; inset:0; display:grid; place-items:end center; padding:12px;
        background:color-mix(in oklab,var(--bg-0) 30%, black 35%); z-index:80; }
.card{ width:min(680px, 100%); background:var(--bg-1); border:1px solid var(--border);
       border-radius:16px 16px 0 0; padding:12px; }
@media (min-width:821px){ .sheet{ place-items:center } .card{ border-radius:12px; max-height:80vh; overflow:auto } }
label{ display:grid; gap:6px; margin:8px 0; }
input, textarea, select{ background:var(--bg-0); border:1px solid var(--border); border-radius:10px; padding:8px; color:var(--text); }
</style>
