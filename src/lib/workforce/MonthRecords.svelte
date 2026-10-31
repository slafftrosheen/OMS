<script lang="ts">
  import Pencil from 'lucide-svelte/icons/pencil';
  import type { Absence, WorkEntry, WorkforceMonth } from './types';
  import type { WorkforceCopy } from './copy';
  import { absenceReason } from './copy';
  import { formatWorkDate, formatWorkMonth, minutesLabel } from './client';

  let { data, c, lang, busy = false, onEdit, onDelete, onCancelAbsence }: {
    data: WorkforceMonth; c: WorkforceCopy; lang: string; busy?: boolean;
    onEdit?: (date: string) => void; onDelete?: (entry: WorkEntry) => void; onCancelAbsence?: (absence: Absence) => void;
  } = $props();
  let showMissing = $state(false);
  let byDate = $derived(new Map(data.entries.map(entry => [entry.workDate, entry])));
  let visibleDays = $derived(data.days.filter(day => showMissing || byDate.has(day.date) || data.absences.some(absence => absence.status === 'active' && absence.startDate <= day.date && absence.endDate >= day.date)));
  const missingId = $props.id();
</script>

<div class="wfc-records">
  <dl class="wfc-month-totals">
    <div><dt>{c.actualHours}</dt><dd>{minutesLabel(data.totals.actualMinutes, c)}</dd></div>
    <div><dt>{c.regularHours}</dt><dd>{minutesLabel(data.totals.regularMinutes, c)}</dd></div>
    <div><dt>{c.premiumHours}</dt><dd>{minutesLabel(data.totals.premiumMinutes, c)}</dd></div>
    <div><dt>{c.creditedHours}</dt><dd>{minutesLabel(data.totals.creditedMinutes, c)}</dd></div>
  </dl>
  <div class="wfc-history-tools"><p class="wfc-hint">{c.recordedDays}: <strong>{data.totals.recordedDays}</strong> · {c.daysWorked}: <strong>{data.totals.daysWorked}</strong></p><label class="wfc-checkbox" for={missingId}><input id={missingId} type="checkbox" bind:checked={showMissing} />{c.showMissing}</label></div>
  {#if !visibleDays.length}
    <div class="wfc-empty"><h3>{c.noRecords}</h3>{#if onEdit}<p>{c.recordFirst}</p>{/if}</div>
  {:else}
    <div class="wfc-table-wrap">
      <table class="wfc-table wfc-day-table">
        <caption class="wfc-sr-only">{c.history} · {formatWorkMonth(data.month, lang)}</caption>
        <thead><tr><th scope="col">{c.date}</th><th scope="col">{c.actualHours}</th><th scope="col">{c.rate}</th><th scope="col">{c.creditedHours}</th>{#if onEdit}<th scope="col">{c.actions}</th>{/if}</tr></thead>
        <tbody>{#each visibleDays as day (day.date)}
          {@const entry = byDate.get(day.date)}
          {@const absence = data.absences.find(row => row.status === 'active' && row.startDate <= day.date && row.endDate >= day.date)}
          <tr data-recorded={!!entry}>
            <th scope="row"><time datetime={day.date}>{formatWorkDate(day.date, lang, true)}</time>{#if day.date === data.today}<span class="wfc-chip" data-tone="time">{c.today}</span>{/if}{#if entry?.note}<p class="wfc-record-note">{entry.note}</p>{/if}{#if absence}<span class="wfc-chip" data-tone="absence">{c.absences} · {absence.partialDay ? c.partial : c.allDay}</span>{/if}</th>
            <td data-label={c.actualHours}>{#if entry}<strong>{minutesLabel(entry.actualMinutes, c)}</strong>{#if entry.actualMinutes === 0}<span class="wfc-cell-hint">{c.zeroEntry}</span>{/if}{:else}<span class="wfc-muted">{day.date > data.today ? c.futureDay : c.noEntry}</span>{/if}</td>
            <td data-label={c.rate}><span class="wfc-chip" data-tone={day.multiplier === 2 ? 'premium' : 'neutral'}>{day.multiplier}×</span><span class="wfc-cell-hint">{day.holidayName || (day.isWeekend ? c.weekend : c.regularDay)}</span></td>
            <td data-label={c.creditedHours}>{entry ? minutesLabel(entry.creditedMinutes, c) : '—'}</td>
            {#if onEdit}<td class="wfc-row-actions">{#if day.date <= data.today}<button type="button" class="wfc-button wfc-small" disabled={busy} onclick={() => onEdit?.(day.date)} aria-label={`${c.edit}: ${formatWorkDate(day.date, lang)}`}><Pencil size={14} aria-hidden="true" />{entry ? c.edit : c.entryTitle}</button>{#if entry && onDelete}<button type="button" class="wfc-button wfc-small wfc-danger" disabled={busy} onclick={() => onDelete?.(entry)} aria-label={`${c.delete}: ${formatWorkDate(day.date, lang)}`}>{c.remove}</button>{/if}{/if}</td>{/if}
          </tr>
        {/each}</tbody>
      </table>
    </div>
  {/if}
  <section class="wfc-absence-history" aria-label={c.absences}>
    <h3>{c.absences}</h3>
    {#if !data.absences.length}<p class="wfc-muted">{c.absenceEmpty}</p>
    {:else}<ul class="wfc-absence-list">{#each data.absences as absence (absence.id)}
      <li>
        <div class="wfc-absence-copy"><strong>{formatWorkDate(absence.startDate, lang)}{#if absence.endDate !== absence.startDate} – {formatWorkDate(absence.endDate, lang)}{/if}</strong><div class="wfc-chip-row"><span class="wfc-chip" data-tone={absence.status === 'active' ? 'absence' : 'neutral'}>{absence.status === 'active' ? c.active : c.cancelled}</span><span>{absenceReason(absence.reason, c)} · {absence.partialDay ? c.partial : c.allDay}</span></div>{#if absence.note}<p class="wfc-record-note">{absence.note}</p>{/if}</div>
        {#if onCancelAbsence && absence.status === 'active'}<button type="button" class="wfc-button wfc-small" disabled={busy} onclick={() => onCancelAbsence?.(absence)}>{c.cancelAbsence}</button>{/if}
      </li>
    {/each}</ul>{/if}
  </section>
</div>
