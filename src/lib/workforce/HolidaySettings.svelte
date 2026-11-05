<script lang="ts">
  import { untrack } from 'svelte';
  import type { CabinetState } from './cabinet-state.svelte';
  import type { HolidayOverride } from './types';
  import type { WorkforceCopy } from './copy';
  import { workforceError } from './copy';
  import { formatWorkDate } from './client';
  import { MIN_WORKFORCE_YEAR, MAX_WORKFORCE_YEAR } from './validation';
  let { cabinet, c, lang, onRemove }: { cabinet: CabinetState; c: WorkforceCopy; lang: string; onRemove: (override: HolidayOverride) => void } = $props();
  let date = $state('');
  let name = $state('');
  let isHoliday = $state(true);
  let loadedKey = $state('');
  let existing = $derived(cabinet.overrides.find(row => row.date === date));
  let valid = $derived(!!date && date.slice(0, 4) === cabinet.holidayYear && !!name.trim() && name.trim().length <= 120 && !cabinet.loading.holidays && !cabinet.errors.holidays);
  $effect(() => {
    const key = `${date}:${existing?.version ?? 0}`;
    if (cabinet.loading.holidays) return;
    untrack(() => { if (loadedKey !== key) { name = existing?.name ?? ''; isHoliday = existing?.isPublicHoliday ?? true; loadedKey = key; } });
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || cabinet.busy) return;
    await cabinet.saveHoliday({ date, name: name.trim(), isPublicHoliday: isHoliday, expectedVersion: existing?.version ?? null });
  }
  function yearChanged(value: string) {
    if (!/^\d{4}$/.test(value) || Number(value) < MIN_WORKFORCE_YEAR || Number(value) > MAX_WORKFORCE_YEAR) return;
    cabinet.holidayYear = value; date = ''; name = ''; isHoliday = true; void cabinet.loadHolidays();
  }
</script>

<details class="wfc-panel wfc-holiday-settings" ontoggle={event => {
  cabinet.holidaysOpen = event.currentTarget.open;
  if (event.currentTarget.open) void cabinet.loadHolidays();
}}>
  <summary>{c.holidaySettings}</summary>
  <p class="wfc-hint">{c.holidayIntro}</p>
  <div class="wfc-field wfc-year"><label for="holiday-year">{c.year}</label><input class="rf-input" id="holiday-year" type="number" min={MIN_WORKFORCE_YEAR} max={MAX_WORKFORCE_YEAR} value={cabinet.holidayYear} onchange={event => yearChanged(event.currentTarget.value)} disabled={!!cabinet.busy} /></div>
  {#if cabinet.loading.holidays}<p class="wfc-loading" role="status">{c.loading}</p>
  {:else if cabinet.errors.holidays}<div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.holidays, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadHolidays()}>{c.retry}</button></div>
  {:else}
    <form onsubmit={save}>
      <fieldset class="wfc-form-fields" disabled={!!cabinet.busy}><legend class="wfc-sr-only">{c.holidaySettings}</legend>
        <div class="wfc-two-fields"><div class="wfc-field"><label for="holiday-date">{c.holidayDate}</label><input class="rf-input" id="holiday-date" type="date" min={`${cabinet.holidayYear}-01-01`} max={`${cabinet.holidayYear}-12-31`} bind:value={date} required /></div><div class="wfc-field"><label for="holiday-name">{c.holidayName}</label><input class="rf-input" id="holiday-name" type="text" bind:value={name} maxlength="120" required /></div></div>
        <label class="wfc-checkbox"><input type="checkbox" bind:checked={isHoliday} />{c.isHoliday}</label>
      </fieldset>
      <button class="wfc-button" type="submit" disabled={!valid || !!cabinet.busy}>{cabinet.busy === 'holiday' ? c.saving : c.saveHoliday}</button>
    </form>
    <h3>{c.holidayOverrides}</h3>
    {#if !cabinet.overrides.length}<p class="wfc-muted">{c.noOverrides}</p>
    {:else}<ul class="wfc-absence-list">{#each cabinet.overrides as override (override.date)}<li><div class="wfc-absence-copy"><strong>{override.name}</strong><span>{formatWorkDate(override.date, lang)}</span><span class="wfc-chip" data-tone={override.isPublicHoliday ? 'premium' : 'neutral'}>{override.isPublicHoliday ? c.publicHoliday : c.regularDay}</span></div><div class="wfc-row-actions"><button type="button" class="wfc-button wfc-small" disabled={!!cabinet.busy} onclick={() => date = override.date}>{c.edit}</button><button type="button" class="wfc-button wfc-small wfc-danger" disabled={!!cabinet.busy} onclick={() => onRemove(override)}>{c.removeHoliday}</button></div></li>{/each}</ul>{/if}
  {/if}
</details>
