<script lang="ts">
  import type { TeamWorker, WorkforceTotals } from './types';
  import type { WorkforceCopy } from './copy';
  import { absenceReason } from './copy';
  import { formatWorkDate, minutesLabel } from './client';
  import { filterTeam, type TeamFilter, type TeamVisibilitySummary } from './overview';
  let { workers, totals, c, lang, onSelect, onVisibility }: {
    workers: TeamWorker[]; totals: WorkforceTotals; c: WorkforceCopy; lang: string;
    onSelect?: (id: string, trigger: HTMLButtonElement) => void;
    onVisibility?: (summary: TeamVisibilitySummary, source: TeamWorker[]) => void;
  } = $props();
  let query = $state('');
  let filter = $state<TeamFilter>('all');
  let visibleWorkers = $derived(filterTeam(workers, query, filter));
  $effect(() => { onVisibility?.({ count: visibleWorkers.length, filter, searchActive: !!query.trim() }, workers); });
  const filterId = $props.id();
  function clearFilters() { query = ''; filter = 'all'; }
</script>

<dl class="wfc-month-totals">
  <div><dt>{c.workers}</dt><dd>{workers.length}</dd></div>
  <div><dt>{c.actualHours}</dt><dd>{minutesLabel(totals.actualMinutes, c)}</dd></div>
  <div><dt>{c.premiumHours}</dt><dd>{minutesLabel(totals.premiumMinutes, c)}</dd></div>
  <div><dt>{c.creditedHours}</dt><dd>{minutesLabel(totals.creditedMinutes, c)}</dd></div>
</dl>
<p class="wfc-hint">{c.coverageHint}</p>
{#if workers.length}
  <div class="wfc-filter-row">
    <div class="wfc-field"><label for={`${filterId}-search`}>{c.searchWorkers}</label><input class="rf-input" id={`${filterId}-search`} type="search" placeholder={c.searchWorkersHint} bind:value={query} maxlength="120" autocomplete="off" /></div>
    <div class="wfc-field"><label for={`${filterId}-status`}>{c.filterWorkers}</label><select class="rf-input" id={`${filterId}-status`} bind:value={filter}><option value="all">{c.allWorkers}</option><option value="active">{c.activeWorkers}</option><option value="inactive">{c.inactiveWorkers}</option><option value="unrecorded">{c.workersWithoutEntries}</option><option value="absence">{c.workersWithAbsence}</option></select></div>
  </div>
  <div class="wfc-filter-status"><p class="wfc-hint" role="status">{c.workersShown}: <strong>{visibleWorkers.length} / {workers.length}</strong></p>{#if query || filter !== 'all'}<button type="button" class="wfc-button wfc-small" onclick={clearFilters}>{c.clearFilters}</button>{/if}</div>
  <p class="wfc-hint">{c.teamTotalsScope}</p>
{/if}
{#if !workers.length}<div class="wfc-empty"><p>{c.emptyTeam}</p></div>
{:else if !visibleWorkers.length}<div class="wfc-empty"><p>{c.noMatchingWorkers}</p></div>
{:else}<div class="wfc-table-wrap"><table class="wfc-table wfc-team-table">
  <caption class="wfc-sr-only">{c.team}</caption>
  <thead><tr><th scope="col">{c.worker}</th><th scope="col">{c.actualHours}</th><th scope="col">{c.regularHours}</th><th scope="col">{c.premiumHours}</th><th scope="col">{c.creditedHours}</th><th scope="col">{c.recordedDays}</th>{#if onSelect}<th scope="col">{c.actions}</th>{/if}</tr></thead>
  <tbody>{#each visibleWorkers as worker (worker.userId)}<tr>
    <th scope="row">{worker.displayName || worker.username}<span class="wfc-cell-hint">{c.roles[worker.role as keyof typeof c.roles] || worker.role}</span>{#if !worker.isActive}<span class="wfc-chip" data-tone="neutral">{c.inactive}</span>{/if}</th>
    <td data-label={c.actualHours}><strong>{minutesLabel(worker.totals.actualMinutes, c)}</strong></td>
    <td data-label={c.regularHours}>{minutesLabel(worker.totals.regularMinutes, c)}</td>
    <td data-label={c.premiumHours}>{minutesLabel(worker.totals.premiumMinutes, c)}</td>
    <td data-label={c.creditedHours}>{minutesLabel(worker.totals.creditedMinutes, c)}</td>
    <td data-label={c.recordedDays}>{worker.totals.recordedDays}{#if !worker.totals.recordedDays}<span class="wfc-cell-hint">{c.noEntry}</span>{/if}</td>
    {#if onSelect}<td class="wfc-row-actions"><button type="button" class="wfc-button wfc-small" onclick={event => onSelect?.(worker.userId, event.currentTarget)} aria-label={`${c.viewWorker}: ${worker.displayName || worker.username}`}>{c.viewWorker}</button></td>{/if}
  </tr>{/each}</tbody>
</table></div>{/if}

<section class="wfc-absence-history" aria-label={query || filter !== 'all' ? c.filteredAbsences : c.teamAbsences}>
  <h3>{query || filter !== 'all' ? c.filteredAbsences : c.teamAbsences}</h3>
  {#if visibleWorkers.every(worker => !worker.activeAbsences.length)}<p class="wfc-muted">{query || filter !== 'all' ? c.noFilteredAbsences : c.noTeamAbsences}</p>
  {:else}<ul class="wfc-absence-list">{#each visibleWorkers as worker (worker.userId)}{#each worker.activeAbsences as absence (absence.id)}<li><div class="wfc-absence-copy"><strong>{worker.displayName || worker.username}</strong><span>{formatWorkDate(absence.startDate, lang)}{#if absence.endDate !== absence.startDate} – {formatWorkDate(absence.endDate, lang)}{/if}</span><div class="wfc-chip-row"><span class="wfc-chip" data-tone="absence">{absence.partialDay ? c.partial : c.allDay}</span><span>{absenceReason(absence.reason, c)}</span></div></div></li>{/each}{/each}</ul>{/if}
</section>
