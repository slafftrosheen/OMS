<script lang="ts">
  import Pencil from 'lucide-svelte/icons/pencil';
  import Check from 'lucide-svelte/icons/check';
  import Minus from 'lucide-svelte/icons/minus';
  import CalendarX from 'lucide-svelte/icons/calendar-x';
  import Circle from 'lucide-svelte/icons/circle';
  import Clock from 'lucide-svelte/icons/clock-3';
  import type { Absence, WorkEntry, WorkforceMonth } from './types';
  import type { WorkforceCopy } from './copy';
  import { absenceReason } from './copy';
  import { formatWorkDate, formatWorkMonth, minutesLabel } from './client';
  import { monthCalendarRows, monthOverview, type MonthDayOverview, type MonthDayStatus } from './overview';

  let { data, c, lang, busy = false, compact = false, selectedDate = '', onEdit, onDelete, onCancelAbsence }: {
    data: WorkforceMonth; c: WorkforceCopy; lang: string; busy?: boolean; selectedDate?: string;
    compact?: boolean;
    onEdit?: (date: string) => void; onDelete?: (entry: WorkEntry) => void; onCancelAbsence?: (absence: Absence) => void;
  } = $props();
  let showMissing = $state(false);
  let byDate = $derived(new Map(data.entries.map(entry => [entry.workDate, entry])));
  let visibleDays = $derived(data.days.filter(day => showMissing || byDate.has(day.date) || data.absences.some(absence => absence.status === 'active' && absence.startDate <= day.date && absence.endDate >= day.date)));
  let overview = $derived(monthOverview(data));
  let weeks = $derived(monthCalendarRows(overview));
  let weekdays = $derived(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 1 + index)); // Monday, independent of the viewed month.
    return { short: new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(date),
      full: new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(date) };
  }));
  let focusedDate = $state('');
  let tabDate = $derived(overview.some(row => row.day.date === focusedDate && row.day.date <= data.today) ? focusedDate
    : overview.some(row => row.day.date === selectedDate && row.day.date <= data.today) ? selectedDate
    : overview.find(row => row.day.date <= data.today)?.day.date ?? '');
  const missingId = $props.id();
  const statusIcons = { recorded: Check, zero: Minus, absence: CalendarX, unrecorded: Circle, future: Clock };
  const statuses: MonthDayStatus[] = ['recorded', 'zero', 'absence', 'unrecorded', 'future'];
  function statusLabel(status: MonthDayStatus) {
    return status === 'recorded' ? c.recorded : status === 'zero' ? c.calendarZero
      : status === 'absence' ? c.calendarAbsence : status === 'future' ? c.futureDay : c.calendarEmpty;
  }
  function dayLabel(cell: MonthDayOverview) {
    return [formatWorkDate(cell.day.date, lang, true), statusLabel(cell.status),
      cell.entry ? `${c.actualHours}: ${minutesLabel(cell.entry.actualMinutes, c)}` : '',
      cell.absence ? `${c.absences}: ${cell.absence.partialDay ? c.partial : c.allDay}` : '',
      `${c.rate}: ${cell.day.multiplier}×`, cell.day.holidayName || (cell.day.isWeekend ? c.weekend : ''),
      cell.day.date === data.today ? c.today : '', cell.day.date === selectedDate ? c.selectedDay : ''].filter(Boolean).join(' · ');
  }
  function navigateDay(event: KeyboardEvent, date: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || busy) return;
    const dates = overview.filter(row => row.day.date <= data.today).map(row => row.day.date);
    const index = dates.indexOf(date);
    const move: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, ArrowDown: index + 7, ArrowUp: index - 7, Home: 0, End: dates.length - 1 };
    if (!(event.key in move)) return;
    event.preventDefault();
    const next = dates[Math.max(0, Math.min(dates.length - 1, move[event.key]))];
    if (next) {
      focusedDate = next;
      (event.currentTarget as HTMLButtonElement).closest('table')?.querySelector<HTMLButtonElement>(`[data-work-date="${next}"]`)?.focus();
    }
  }
</script>

{#snippet calendarContent(cell: MonthDayOverview)}
  {@const Icon = statusIcons[cell.status]}
  <span class="wfc-calendar-date" aria-hidden="true"><span>{Number(cell.day.date.slice(-2))}</span>{#if cell.day.multiplier === 2}<span class="wfc-calendar-rate">2×</span>{/if}</span>
  <span class="wfc-calendar-status" aria-hidden="true"><Icon size={14} />{#if cell.absence && cell.status !== 'absence'}<CalendarX size={13} />{/if}</span>
  {#if cell.entry}<span class="wfc-calendar-time" aria-hidden="true">{Math.floor(cell.entry.actualMinutes / 60)}:{String(cell.entry.actualMinutes % 60).padStart(2, '0')}</span>{/if}
{/snippet}

<div class="wfc-records">
  {#if !compact}
  <dl class="wfc-month-totals">
    <div><dt>{c.actualHours}</dt><dd>{minutesLabel(data.totals.actualMinutes, c)}</dd></div>
    <div><dt>{c.regularHours}</dt><dd>{minutesLabel(data.totals.regularMinutes, c)}</dd></div>
    <div><dt>{c.premiumHours}</dt><dd>{minutesLabel(data.totals.premiumMinutes, c)}</dd></div>
    <div><dt>{c.creditedHours}</dt><dd>{minutesLabel(data.totals.creditedMinutes, c)}</dd></div>
  </dl>
  <section class="wfc-month-calendar" aria-labelledby={`${missingId}-calendar-heading`}>
    <div class="wfc-calendar-heading"><h3 id={`${missingId}-calendar-heading`}>{c.calendarTitle}</h3><p class="wfc-hint">{onEdit ? c.calendarHint : c.calendarReadOnlyHint}</p></div>
    <table class="wfc-calendar-table">
      <caption class="wfc-sr-only">{formatWorkMonth(data.month, lang)} · {c.calendarReview}</caption>
      <thead><tr>{#each weekdays as weekday}<th scope="col"><abbr title={weekday.full}>{weekday.short}</abbr></th>{/each}</tr></thead>
      <tbody>{#each weeks as week}<tr>{#each week as cell}<td>
        {#if cell}
          {#if onEdit && cell.day.date <= data.today}
            <button type="button" class="wfc-calendar-day" data-status={cell.status} data-selected={cell.day.date === selectedDate} data-today={cell.day.date === data.today}
              data-work-date={cell.day.date} tabindex={tabDate === cell.day.date ? 0 : -1} disabled={busy}
              aria-label={dayLabel(cell)} aria-current={cell.day.date === data.today ? 'date' : undefined} title={dayLabel(cell)}
              onfocus={() => focusedDate = cell.day.date} onkeydown={event => navigateDay(event, cell.day.date)} onclick={() => onEdit?.(cell.day.date)}>
              {@render calendarContent(cell)}
            </button>
          {:else}
            <div class="wfc-calendar-day" data-status={cell.status} data-today={cell.day.date === data.today} title={dayLabel(cell)}>
              <span class="wfc-sr-only">{dayLabel(cell)}</span>{@render calendarContent(cell)}
            </div>
          {/if}
        {/if}
      </td>{/each}</tr>{/each}</tbody>
    </table>
    <div class="wfc-calendar-legend">{#each statuses as status}{@const Icon = statusIcons[status]}<span data-status={status}><Icon size={14} aria-hidden="true" />{statusLabel(status)}</span>{/each}<span class="wfc-chip" data-tone="premium">2× · {c.rate}</span></div>
    <p class="wfc-hint wfc-calendar-units">{c.calendarUnits}</p>
  </section>
  {/if}
  <div class="wfc-history-tools">{#if !compact}<p class="wfc-hint">{c.recordedDays}: <strong>{data.totals.recordedDays}</strong> · {c.daysWorked}: <strong>{data.totals.daysWorked}</strong></p>{/if}<label class="wfc-checkbox" for={missingId}><input id={missingId} type="checkbox" bind:checked={showMissing} />{c.showMissing}</label></div>
  {#if !visibleDays.length}
    <div class="wfc-empty"><h3>{c.noRecords}</h3>{#if onEdit}<p>{c.recordFirst}</p>{/if}</div>
  {:else}
    <div class="wfc-table-wrap">
      <table class="wfc-table wfc-day-table">
        <caption class="wfc-sr-only">{c.history} · {formatWorkMonth(data.month, lang)}</caption>
        <thead><tr><th scope="col">{c.date}</th><th scope="col">{c.actualHours}</th>{#if !compact}<th scope="col">{c.rate}</th>{/if}<th scope="col">{compact ? c.workerCreditedHours : c.creditedHours}</th>{#if onEdit}<th scope="col">{c.actions}</th>{/if}</tr></thead>
        <tbody>{#each visibleDays as day (day.date)}
          {@const entry = byDate.get(day.date)}
          {@const absence = data.absences.find(row => row.status === 'active' && row.startDate <= day.date && row.endDate >= day.date)}
          <tr data-recorded={!!entry}>
            <th scope="row"><time datetime={day.date}>{formatWorkDate(day.date, lang, true)}</time>{#if day.date === data.today}<span class="wfc-chip" data-tone="time">{c.today}</span>{/if}{#if entry}<span class="wfc-cell-hint" data-testid="work-interval">{entry.startTime && entry.finishTime ? `${entry.startTime}–${entry.finishTime}` : c.missingTimes}</span>{/if}{#if entry?.note}<p class="wfc-record-note">{entry.note}</p>{/if}{#if absence}<span class="wfc-chip" data-tone="absence">{c.absences} · {absence.partialDay ? c.partial : c.allDay}</span>{/if}</th>
            <td data-label={c.actualHours}>{#if entry}<strong>{minutesLabel(entry.actualMinutes, c)}</strong>{#if entry.actualMinutes === 0}<span class="wfc-cell-hint">{c.zeroEntry}</span>{/if}{:else}<span class="wfc-muted">{day.date > data.today ? c.futureDay : c.noEntry}</span>{/if}</td>
            {#if !compact}<td data-label={c.rate}><span class="wfc-chip" data-tone={day.multiplier === 2 ? 'premium' : 'neutral'}>{day.multiplier}×</span><span class="wfc-cell-hint">{day.holidayName || (day.isWeekend ? c.weekend : c.regularDay)}</span></td>{/if}
            <td data-label={compact ? c.workerCreditedHours : c.creditedHours}>{entry ? minutesLabel(entry.creditedMinutes, c) : '—'}{#if compact && entry && day.multiplier === 2}<span class="wfc-chip" data-tone="premium" title={day.holidayName || c.weekend}>2×</span>{/if}</td>
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
