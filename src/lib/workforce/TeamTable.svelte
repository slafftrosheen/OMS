<script lang="ts">
  import type { TeamWorker, WorkforceTotals } from './types';
  import type { WorkforceCopy } from './copy';
  import { absenceReason } from './copy';
  import { formatWorkDate, minutesLabel } from './client';
  let { workers, totals, c, lang, onSelect }: { workers: TeamWorker[]; totals: WorkforceTotals; c: WorkforceCopy; lang: string; onSelect?: (id: string, trigger: HTMLButtonElement) => void } = $props();
</script>

<dl class="wfc-month-totals">
  <div><dt>{c.workers}</dt><dd>{workers.length}</dd></div>
  <div><dt>{c.actualHours}</dt><dd>{minutesLabel(totals.actualMinutes, c)}</dd></div>
  <div><dt>{c.premiumHours}</dt><dd>{minutesLabel(totals.premiumMinutes, c)}</dd></div>
  <div><dt>{c.creditedHours}</dt><dd>{minutesLabel(totals.creditedMinutes, c)}</dd></div>
</dl>
<p class="wfc-hint">{c.coverageHint}</p>
{#if !workers.length}<div class="wfc-empty"><p>{c.emptyTeam}</p></div>
{:else}<div class="wfc-table-wrap"><table class="wfc-table wfc-team-table">
  <caption class="wfc-sr-only">{c.team}</caption>
  <thead><tr><th scope="col">{c.worker}</th><th scope="col">{c.actualHours}</th><th scope="col">{c.regularHours}</th><th scope="col">{c.premiumHours}</th><th scope="col">{c.creditedHours}</th><th scope="col">{c.recordedDays}</th>{#if onSelect}<th scope="col">{c.actions}</th>{/if}</tr></thead>
  <tbody>{#each workers as worker (worker.userId)}<tr>
    <th scope="row">{worker.displayName || worker.username}<span class="wfc-cell-hint">{c.roles[worker.role as keyof typeof c.roles] || worker.role}</span>{#if !worker.isActive}<span class="wfc-chip" data-tone="neutral">{c.inactive}</span>{/if}</th>
    <td data-label={c.actualHours}><strong>{minutesLabel(worker.totals.actualMinutes, c)}</strong></td>
    <td data-label={c.regularHours}>{minutesLabel(worker.totals.regularMinutes, c)}</td>
    <td data-label={c.premiumHours}>{minutesLabel(worker.totals.premiumMinutes, c)}</td>
    <td data-label={c.creditedHours}>{minutesLabel(worker.totals.creditedMinutes, c)}</td>
    <td data-label={c.recordedDays}>{worker.totals.recordedDays}{#if !worker.totals.recordedDays}<span class="wfc-cell-hint">{c.noEntry}</span>{/if}</td>
    {#if onSelect}<td class="wfc-row-actions"><button type="button" class="wfc-button wfc-small" onclick={event => onSelect?.(worker.userId, event.currentTarget)} aria-label={`${c.viewWorker}: ${worker.displayName || worker.username}`}>{c.viewWorker}</button></td>{/if}
  </tr>{/each}</tbody>
</table></div>{/if}

<section class="wfc-absence-history" aria-label={c.teamAbsences}>
  <h3>{c.teamAbsences}</h3>
  {#if workers.every(worker => !worker.activeAbsences.length)}<p class="wfc-muted">{c.noTeamAbsences}</p>
  {:else}<ul class="wfc-absence-list">{#each workers as worker (worker.userId)}{#each worker.activeAbsences as absence (absence.id)}<li><div class="wfc-absence-copy"><strong>{worker.displayName || worker.username}</strong><span>{formatWorkDate(absence.startDate, lang)}{#if absence.endDate !== absence.startDate} – {formatWorkDate(absence.endDate, lang)}{/if}</span><div class="wfc-chip-row"><span class="wfc-chip" data-tone="absence">{absence.partialDay ? c.partial : c.allDay}</span><span>{absenceReason(absence.reason, c)}</span></div></div></li>{/each}{/each}</ul>{/if}
</section>
