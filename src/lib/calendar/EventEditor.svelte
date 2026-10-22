<script lang="ts">
  import { untrack } from 'svelte';
  import { modalDialog } from '$lib/ui/modal-dialog';
  import { createEventDraft, eventDraftTarget } from './event-draft';
  import { upsertLoad } from '$lib/state/loads';
  import { addEvent, updateEvent } from './store';
  import type { CalEvent, MeetingEvent, NoteEvent } from './types';
  import { t } from 'svelte-i18n';
  
  let {
    dateISO = '',
    event = null as CalEvent | null,
    presetKind = 'loading' as 'loading' | 'meeting' | 'note',
    onClose = () => {}
  } = $props<{
    dateISO?: string;
    event?: CalEvent | null;
    presetKind?: 'loading' | 'meeting' | 'note';
    onClose?: () => void;
  }>();

  let draft = $state(untrack(() => createEventDraft(event, dateISO, presetKind)));
  let draftTarget = untrack(() => eventDraftTarget(event, dateISO, presetKind));

  $effect.pre(() => {
    const target = eventDraftTarget(event, dateISO, presetKind);
    if (target === draftTarget) return;
    draft = untrack(() => createEventDraft(event, dateISO, presetKind));
    draftTarget = target;
  });

  function save() {
    // A prop change must never submit the previous event's draft under a new ID.
    if (draftTarget !== eventDraftTarget(event, dateISO, presetKind)) return;
    const { kind, selectedDate, carrier, title, startTime, endTime, location, notes, attendees } = draft;
    if (kind === 'loading') {
      upsertLoad({ id: selectedDate, carrier, notes });
    } else if (kind === 'meeting') {
      const meetingEvent: MeetingEvent = {
        id: draft.id ?? `meeting-${Date.now()}`,
        kind: 'meeting',
        date: selectedDate,
        title: title || 'Meeting',
        start: startTime,
        end: endTime,
        location: location || undefined,
        attendees: attendees ? attendees.split(',').map(a => a.trim()).filter(Boolean) : undefined,
        note: notes || undefined,
        createdAt: draft.createdAt ?? new Date().toISOString()
      };
      if (draft.id) {
        updateEvent(meetingEvent);
      } else {
        addEvent(meetingEvent);
      }
    } else if (kind === 'note') {
      const noteEvent: NoteEvent = {
        id: draft.id ?? `note-${Date.now()}`,
        kind: 'note',
        date: selectedDate,
        title: title || notes || 'Note',
        note: notes || undefined,
        createdAt: draft.createdAt ?? new Date().toISOString()
      };
      if (draft.id) {
        updateEvent(noteEvent);
      } else {
        addEvent(noteEvent);
      }
    }
    
    if (onClose) {
      onClose();
    }
  }
</script>

<dialog class="sheet" aria-label={event ? $t('eventEditor.editEvent') : $t('eventEditor.createEvent')} use:modalDialog={{ onClose, initialFocus: 'select' }}>
  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <strong>{event ? $t('eventEditor.editEvent') : $t('eventEditor.createEvent')}</strong>
      <button type="button" class="tag ghost" onclick={() => onClose()}>{$t('eventEditor.close')}</button>
    </div>

    <label>{$t('eventEditor.type')}
      <select bind:value={draft.kind}>
        <option value="loading">{$t('eventEditor.typeLoading')}</option>
        <option value="meeting">{$t('eventEditor.typeMeeting')}</option>
        <option value="note">{$t('eventEditor.typeNote')}</option>
      </select>
    </label>

    <label>{$t('eventEditor.date')}
      <input type="date" bind:value={draft.selectedDate} />
    </label>

    {#if draft.kind === 'loading'}
      <label>{$t('eventEditor.carrier')} <input bind:value={draft.carrier} placeholder={$t('eventEditor.carrierPlaceholder')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={draft.notes}></textarea></label>
    {:else if draft.kind === 'meeting'}
      <label>{$t('eventEditor.title')} <input bind:value={draft.title} placeholder={$t('eventEditor.titlePlaceholderMeeting')} required/></label>
      <div class="row" style="gap:6px">
        <label>{$t('eventEditor.startTime')} <input type="time" bind:value={draft.startTime}></label>
        <label>{$t('eventEditor.endTime')} <input type="time" bind:value={draft.endTime}></label>
      </div>
      <label>{$t('eventEditor.location')} <input bind:value={draft.location} placeholder={$t('eventEditor.locationPlaceholder')}/></label>
      <label>{$t('eventEditor.attendees')} <input bind:value={draft.attendees} placeholder={$t('eventEditor.attendeesPlaceholder')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={draft.notes}></textarea></label>
    {:else}
      <label>{$t('eventEditor.title')} <input bind:value={draft.title} placeholder={$t('eventEditor.titlePlaceholderNote')}/></label>
      <label>{$t('eventEditor.notes')} <textarea rows="3" bind:value={draft.notes} placeholder={$t('eventEditor.notesPlaceholder')}></textarea></label>
    {/if}

    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
      <button type="button" class="tag ghost" onclick={()=>onClose()}>{$t('eventEditor.cancel')}</button>
      <button type="button" class="tag" onclick={save}>{$t('eventEditor.save')}</button>
    </div>
  </div>
</dialog>

<style>
.sheet{ position:fixed; inset:0; margin:0; width:100%; height:100%; max-width:none; max-height:none;
        border:0; color:var(--text); background:transparent; padding:12px; }
.sheet[open]{ display:grid; place-items:end center; }
.sheet::backdrop{ background:color-mix(in oklab,var(--bg-0) 30%, black 35%); }
.card{ width:min(680px, 100%); background:var(--bg-1); border:1px solid var(--border);
       border-radius:16px 16px 0 0; padding:12px; }
@media (min-width:821px){ .sheet[open]{ place-items:center } .card{ border-radius:12px; max-height:80vh; overflow:auto } }
label{ display:grid; gap:6px; margin:8px 0; }
input, textarea, select{ background:var(--bg-0); border:1px solid var(--border); border-radius:10px; padding:8px; color:var(--text); }
</style>
