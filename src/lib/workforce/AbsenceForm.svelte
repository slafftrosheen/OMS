<script lang="ts">
  import CalendarOff from 'lucide-svelte/icons/calendar-off';
  import type { CabinetState } from './cabinet-state.svelte';
  import type { AbsenceReason } from './types';
  import type { WorkforceCopy } from './copy';
  import { MIN_WORKFORCE_YEAR, MAX_WORKFORCE_YEAR } from './validation';
  import { addDays } from './calendar';

  let { cabinet, c, onDirty = () => {} }: { cabinet: CabinetState; c: WorkforceCopy; onDirty?: (dirty: boolean) => void } = $props();
  let start = $state('');
  let end = $state('');
  let partial = $state(false);
  let reason = $state<AbsenceReason>('leave');
  let note = $state('');
  let touched = $state(false);
  let maxEnd = $derived(start ? [addDays(start, 365), `${MAX_WORKFORCE_YEAR}-12-31`].sort()[0] : `${MAX_WORKFORCE_YEAR}-12-31`);
  let valid = $derived(/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= start && end <= maxEnd && (!partial || start === end) && note.length <= 500);
  $effect(() => { onDirty(!!start || !!end || partial || reason !== 'leave' || !!note); });

  async function save(event: SubmitEvent) {
    event.preventDefault(); touched = true;
    if (!valid || cabinet.busy) return;
    const success = await cabinet.saveAbsence({ startDate: start, endDate: end, partialDay: partial, reason, note });
    if (success) { start = ''; end = ''; partial = false; note = ''; reason = 'leave'; touched = false; }
  }
</script>

<section class="wfc-panel" aria-labelledby="absence-entry-heading">
  <div class="wfc-section-heading">
    <span class="wfc-symbol" data-tone="absence"><CalendarOff size={21} aria-hidden="true" /></span>
    <div><h2 id="absence-entry-heading">{c.absenceTitle}</h2><p>{c.absenceIntro}</p></div>
  </div>
  <form onsubmit={save}>
    <fieldset disabled={!!cabinet.busy} class="wfc-form-fields">
      <legend class="wfc-sr-only">{c.absenceTitle}</legend>
      <div class="wfc-two-fields">
        <div class="wfc-field"><label for="absence-start">{c.startDate}</label><input class="rf-input" id="absence-start" type="date" min={`${MIN_WORKFORCE_YEAR}-01-01`} max={`${MAX_WORKFORCE_YEAR}-12-31`} required value={start} onchange={event => { start = event.currentTarget.value; touched = true; if (!end || end < start || partial) end = start; }} /></div>
        <div class="wfc-field"><label for="absence-end">{c.endDate}</label><input class="rf-input" id="absence-end" type="date" min={start || `${MIN_WORKFORCE_YEAR}-01-01`} max={partial && start ? start : maxEnd} required value={end} onchange={event => { end = event.currentTarget.value; touched = true; }} /></div>
      </div>
      <div class="wfc-field"><label for="absence-reason">{c.reason}</label><select class="rf-input" id="absence-reason" bind:value={reason}><option value="leave">{c.leave}</option><option value="sick">{c.sick}</option><option value="personal">{c.personalReason}</option><option value="other">{c.other}</option></select></div>
      <div><label class="wfc-checkbox"><input type="checkbox" checked={partial} onchange={event => { partial = event.currentTarget.checked; touched = true; if (partial && start) end = start; }} /> <span>{c.partial}</span></label><p class="wfc-hint">{c.partialHint}</p></div>
      <div class="wfc-field"><label for="absence-note">{c.note}</label><textarea class="rf-input" id="absence-note" rows="2" maxlength="500" bind:value={note} aria-describedby="absence-note-hint"></textarea><p class="wfc-hint" id="absence-note-hint">{c.absenceNoteHint}</p></div>
    </fieldset>
    {#if touched && start && end && !valid}<p class="wfc-field-error" role="alert">{c.invalidRange}</p>{/if}
    <div class="wfc-form-actions"><button type="submit" class="wfc-button" disabled={!valid || !!cabinet.busy} aria-busy={cabinet.busy === 'absence'}>{cabinet.busy === 'absence' ? c.saving : c.markAbsence}</button></div>
  </form>
</section>
