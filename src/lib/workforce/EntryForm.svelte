<script lang="ts">
  import Clock from 'lucide-svelte/icons/clock-3';
  import Check from 'lucide-svelte/icons/check';
  import { nextActionHalo } from '$lib/ui/next-action-halo';
  import type { CabinetState } from './cabinet-state.svelte';
  import type { WorkforceCopy } from './copy';
  import { workforceError } from './copy';
  import { formatWorkDate, minutesLabel } from './client';
  import { parseWorkClockInterval } from './clock-times';
  import { MIN_WORKFORCE_YEAR } from './validation';
  import { untrack } from 'svelte';

  let { cabinet, c, lang, onDirty = () => {}, onDateChange }: {
    cabinet: CabinetState; c: WorkforceCopy; lang: string; onDirty?: (dirty: boolean) => void; onDateChange: (date: string) => void;
  } = $props();

  let startTime = $state('');
  let finishTime = $state('');
  let note = $state('');
  let touched = $state(false);
  let loadedKey = $state('');
  let entry = $derived(cabinet.editor?.entries.find(row => row.workDate === cabinet.workDate));
  let day = $derived(cabinet.editor?.days.find(row => row.date === cabinet.workDate));
  let ready = $derived(!!cabinet.editor && cabinet.editor.month === cabinet.workDate.slice(0, 7) && !cabinet.loading.editor && !cabinet.errors.editor);
  let interval = $derived.by(() => {
    if (!startTime || !finishTime || !cabinet.workDate) return { minutes: null, code: '' };
    try { return { minutes: parseWorkClockInterval(cabinet.workDate, startTime, finishTime).actualMinutes, code: '' }; }
    catch (error) { return { minutes: null, code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'INVALID_CLOCK_TIME' }; }
  });
  let actualMinutes = $derived(interval.minutes);
  let fullAbsence = $derived(cabinet.editor?.absences.some(row => row.status === 'active' && !row.partialDay && row.startDate <= cabinet.workDate && row.endDate >= cabinet.workDate) ?? false);
  let future = $derived(cabinet.workDate > cabinet.today);
  // A partially entered or invalid draft is still a draft: do not collapse it to null.
  let dirty = $derived(ready && (startTime !== (entry?.startTime ?? '')
    || finishTime !== (entry?.finishTime ?? '') || note !== (entry?.note ?? '')));
  let valid = $derived(ready && actualMinutes !== null && !!cabinet.workDate && !future && !(fullAbsence && actualMinutes > 0) && note.length <= 500);

  $effect(() => {
    const key = `${cabinet.owner}:${cabinet.workDate}:${entry?.id ?? 'new'}:${entry?.version ?? 0}`;
    if (!ready) return;
    untrack(() => {
      if (loadedKey === key) return;
      startTime = entry?.startTime ?? '';
      finishTime = entry?.finishTime ?? '';
      note = entry?.note ?? ''; touched = false; loadedKey = key;
    });
  });
  $effect(() => { onDirty(dirty); });

  async function save(event: SubmitEvent) {
    event.preventDefault(); touched = true;
    if (!valid || actualMinutes === null || cabinet.busy) return;
    await cabinet.saveEntry({ workDate: cabinet.workDate, startTime, finishTime, note, expectedVersion: entry?.version ?? null });
  }
</script>

<section class="wfc-panel wfc-entry" aria-labelledby="work-entry-heading">
  <div class="wfc-section-heading">
    <span class="wfc-symbol" data-tone="time"><Clock size={21} aria-hidden="true" /></span>
    <div><h2 id="work-entry-heading">{c.entryTitle}</h2><p>{c.entryIntro}</p></div>
  </div>
  <form onsubmit={save}>
    <div class="wfc-field">
      <label for="work-date">{c.workDate}</label>
      <input class="rf-input" id="work-date" type="date" value={cabinet.workDate} min={`${MIN_WORKFORCE_YEAR}-01-01`} max={cabinet.today}
        required disabled={!!cabinet.busy} onchange={event => { const next = event.currentTarget.value; event.currentTarget.value = cabinet.workDate; onDateChange(next); }} />
    </div>
    {#if cabinet.loading.editor}
      <p class="wfc-muted" role="status">{c.loadingDay}</p>
    {:else if cabinet.errors.editor}
      <div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.editor, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadEditor()}>{c.retry}</button></div>
    {:else if entry}
      <p class="wfc-inline-note" data-tone="success"><Check size={16} aria-hidden="true" /> {c.editing} · {c.savedAs}: <strong>{minutesLabel(entry.actualMinutes, c)}</strong></p>
      {#if !entry.startTime || !entry.finishTime}<p class="wfc-hint">{c.legacyTimes}</p>{/if}
    {:else if ready}
      <p class="wfc-inline-note">{formatWorkDate(cabinet.workDate, lang)} · {c.noEntry}</p>
    {/if}
    <fieldset disabled={!ready || !!cabinet.busy} class="wfc-time-fields">
      <legend class="wfc-sr-only">{c.shiftTimes}</legend>
      <div class="wfc-field"><label for="work-start">{c.startTime}</label><input class="rf-input" id="work-start" type="time" step="60" required bind:value={startTime} oninput={() => touched = true} aria-invalid={touched && !!interval.code} aria-describedby={touched && interval.code ? 'work-time-hint work-time-error' : 'work-time-hint'} /></div>
      <div class="wfc-field"><label for="work-finish">{c.finishTime}</label><input class="rf-input" id="work-finish" type="time" step="60" required bind:value={finishTime} oninput={() => touched = true} aria-invalid={touched && !!interval.code} aria-describedby={touched && interval.code ? 'work-time-hint work-time-error' : 'work-time-hint'} /></div>
    </fieldset>
    <p class="wfc-hint" id="work-time-hint">{c.entryHint}</p>
    {#if future}<p class="wfc-field-error" role="alert">{c.futureEntry}</p>
    {:else if fullAbsence && actualMinutes !== null && actualMinutes > 0}<p class="wfc-field-error" role="alert">{c.absenceConflict}</p>
    {:else if touched && interval.code}<p class="wfc-field-error" id="work-time-error" role="alert">{interval.code === 'CLOCK_CHANGE' ? c.clockChangeHint : c.invalidClockTime}</p>{/if}
    {#if valid && actualMinutes !== null}
      <p class="wfc-time-preview" role="status"><span>{c.actualHours}: <strong>{minutesLabel(actualMinutes, c)}</strong></span><span>{c.creditedHours}: <strong>{minutesLabel(actualMinutes * (day?.multiplier ?? 1), c)}</strong></span></p>
    {/if}
    {#if ready && day?.multiplier === 2}
      <p class="wfc-rate-note"><span class="wfc-chip" data-tone="premium">2×</span><span>{day.holidayName || c.weekend}</span></p>
    {/if}
    <div class="wfc-field"><label for="work-note">{c.note}</label><textarea class="rf-input" id="work-note" rows="2" maxlength="500" bind:value={note} disabled={!ready || !!cabinet.busy} aria-describedby="work-note-hint"></textarea><p class="wfc-hint" id="work-note-hint">{c.entryNoteHint}</p></div>
    <div class="wfc-form-actions">
      <button type="submit" class="rf-btn wfc-primary" use:nextActionHalo={valid && dirty && !cabinet.busy}
        disabled={!valid || !dirty || !!cabinet.busy} aria-busy={cabinet.busy === 'entry'}>{cabinet.busy === 'entry' ? c.saving : entry ? c.update : c.save}</button>
      {#if valid && dirty && !cabinet.busy}<span class="wfc-hint">{c.nextStep}</span>{/if}
    </div>
  </form>
</section>
