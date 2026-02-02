<script lang="ts">
  import { upsertLoad } from '$lib/state/loads';
  import { addEvent, updateEvent } from './store';
  import type { CalEvent, MeetingEvent, NoteEvent } from './types';
  import { t } from 'svelte-i18n';
  
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
      <strong>{event ? $t('eventEditor.editEvent') : $t('eventEditor.createEvent')}</strong>
      <button class="tag ghost" on:click={() => onClose ? onClose() : dispatchEvent(new CustomEvent('close'))}>{$t('eventEditor.close')}</button>
    </div>

    <label>{$t('eventEditor.type')}
      <select bind:value={kind}>
        <option value="loading">{$t('eventEditor.typeLoading')}</option>
        <option value="meeting">{$t('eventEditor.typeMeeting')}</option>
        <option value="note">{$t('eventEditor.typeNote')}</option>
      </select>
    </label>

    <label>{$t('eventEditor.date')}
      <input type="date" bind:value={selectedDate} />
    </label>

    {#if kind === 'loading'}
      <label>{$t('eventEditor.carrier')} <input bind:value={carrier} placeholder={$t('eventEditor.carrierPlaceholder')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={notes}/></label>
    {:else if kind === 'meeting'}
      <label>{$t('eventEditor.title')} <input bind:value={title} placeholder={$t('eventEditor.titlePlaceholderMeeting')} required/></label>
      <div class="row" style="gap:6px">
        <label>{$t('eventEditor.startTime')} <input type="time" bind:value={startTime}></label>
        <label>{$t('eventEditor.endTime')} <input type="time" bind:value={endTime}></label>
      </div>
      <label>{$t('eventEditor.location')} <input bind:value={location} placeholder={$t('eventEditor.locationPlaceholder')}/></label>
      <label>{$t('eventEditor.attendees')} <input bind:value={attendees} placeholder={$t('eventEditor.attendeesPlaceholder')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={notes}/></label>
    {:else}
      <label>{$t('eventEditor.title')} <input bind:value={title} placeholder={$t('eventEditor.titlePlaceholderNote')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={notes} placeholder={$t('eventEditor.notesPlaceholder')}/></label>
    {/if}

    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
      <button class="tag ghost" on:click={()=>onClose ? onClose() : dispatchEvent(new CustomEvent('close'))}>{$t('eventEditor.cancel')}</button>
      <button class="tag" on:click={save}>{$t('eventEditor.save')}</button>
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
