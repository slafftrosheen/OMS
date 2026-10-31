<script lang="ts">
  import { tick } from 'svelte';
  import Download from 'lucide-svelte/icons/download';
  import FileText from 'lucide-svelte/icons/file-text';
  import type { CabinetState } from './cabinet-state.svelte';
  import type { DailyAbsencesPayload, MonthlyHoursPayload } from './types';
  import type { WorkforceCopy } from './copy';
  import { absenceReason, workforceError } from './copy';
  import { formatReportTime, formatWorkDate, formatWorkMonth } from './client';
  import TeamTable from './TeamTable.svelte';
  let { cabinet, c, lang }: { cabinet: CabinetState; c: WorkforceCopy; lang: string } = $props();
  let selected = $derived(cabinet.selectedReport);
  let trigger: HTMLButtonElement | null = null;
  $effect(() => {
    const id = selected?.id, owner = cabinet.owner;
    if (!id) return;
    void tick().then(() => {
      if (cabinet.owner !== owner || cabinet.selectedReport?.id !== id) return;
      const heading = document.getElementById('workforce-report-detail-heading');
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' }); heading?.focus({ preventScroll: true });
    });
  });
  function closeReport() {
    cabinet.selectedReport = null;
    if (trigger?.isConnected) trigger.focus();
  }
</script>

<section class="wfc-panel" aria-labelledby="workforce-reports-heading">
  <div class="wfc-section-heading"><span class="wfc-symbol" data-tone="time"><FileText size={21} aria-hidden="true" /></span><div><h2 id="workforce-reports-heading">{c.reports}</h2><p>{c.reportsIntro}</p></div></div>
  <p class="wfc-policy">{c.schedule}</p>
  <div class="wfc-form-actions"><button type="button" class="rf-btn wfc-primary" disabled={!!cabinet.busy || cabinet.loading.reports || cabinet.month >= cabinet.today.slice(0, 7)} aria-busy={cabinet.busy === 'report'} onclick={() => cabinet.generateReport()}>{cabinet.busy === 'report' ? c.regenerating : c.generate}</button><button type="button" class="wfc-button" disabled={!!cabinet.busy || cabinet.loading.reports} onclick={() => cabinet.loadReports()}>{c.refresh}</button></div>
  {#if cabinet.month >= cabinet.today.slice(0, 7)}<p class="wfc-hint">{c.closedMonthHint}</p>{/if}
  {#if cabinet.reportMissing}<p class="wfc-message" data-tone="warning" role="status">{c.reportMissing}</p>{/if}
  {#if cabinet.loading.reports}<p class="wfc-loading" role="status">{c.loading}</p>
  {:else if cabinet.errors.reports}<div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.reports, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadReports()}>{c.retry}</button></div>
  {:else if !cabinet.reports.length}<div class="wfc-empty"><h3>{c.reportsEmpty}</h3></div>
  {:else}
    <ul class="wfc-report-list">{#each cabinet.reports as report (report.id)}<li>
      <div><h3>{report.kind === 'monthly_hours' ? c.monthlyReport : c.dailyReport}</h3><p><strong>{report.kind === 'monthly_hours' ? formatWorkMonth(report.period.slice(0, 7), lang) : formatWorkDate(report.period, lang)}</strong> · {c.reportVersion} {report.version}</p><p class="wfc-hint">{c.generatedAt}: {formatReportTime(report.generatedAt, lang)} · {c.rigaTime}</p>{#if report.isStale}<span class="wfc-chip" data-tone="premium">{c.stale}</span>{/if}</div>
      <div class="wfc-row-actions"><button type="button" class="wfc-button wfc-small" aria-expanded={selected?.id === report.id} aria-controls={selected?.id === report.id ? 'workforce-report-preview' : undefined} aria-label={`${c.viewReport}: ${report.kind === 'monthly_hours' ? c.monthlyReport : c.dailyReport}, ${report.period}, ${c.reportVersion} ${report.version}`} onclick={event => { trigger = event.currentTarget; cabinet.selectedReport = selected?.id === report.id ? null : report; }}>{c.viewReport}</button><button type="button" class="wfc-button wfc-small" disabled={!!cabinet.busy} aria-label={`${c.exportCSV}: ${report.kind === 'monthly_hours' ? c.monthlyReport : c.dailyReport}, ${report.period}, ${c.reportVersion} ${report.version}`} aria-busy={cabinet.busy === `export:${report.id}`} onclick={() => cabinet.exportReport(report)}><Download size={15} aria-hidden="true" />{cabinet.busy === `export:${report.id}` ? c.exporting : c.exportCSV}</button></div>
    </li>{/each}</ul>
  {/if}
</section>

{#if selected}
  <section class="wfc-panel wfc-report-preview" id="workforce-report-preview" aria-labelledby="workforce-report-detail-heading">
    <div class="wfc-panel-top"><div><p class="wfc-eyebrow">{c.reportSnapshot}</p><h2 id="workforce-report-detail-heading" tabindex="-1">{selected.kind === 'monthly_hours' ? c.monthlyReport : c.dailyReport} · {selected.kind === 'monthly_hours' ? formatWorkMonth(selected.period.slice(0, 7), lang) : formatWorkDate(selected.period, lang)}</h2><p class="wfc-hint">{c.reportSnapshotHint}</p></div><button type="button" class="wfc-button" onclick={closeReport}>{c.closeReport}</button></div>
    {#if selected.isStale}<p class="wfc-message" data-tone="warning">{c.staleHint}</p>{/if}
    {#if selected.kind === 'monthly_hours'}
      {@const payload = selected.payload as MonthlyHoursPayload}
      <TeamTable workers={payload.workers} totals={payload.totals} {c} {lang} />
    {:else}
      {@const payload = selected.payload as DailyAbsencesPayload}
      <p class="wfc-large-total">{c.absentWorkers}: <strong>{payload.totalAbsent}</strong></p>
      {#if !payload.absences.length}<p class="wfc-muted">{c.noTeamAbsences}</p>
      {:else}<ul class="wfc-absence-list">{#each payload.absences as absence (absence.id)}<li><div class="wfc-absence-copy"><strong>{absence.displayName || absence.username}</strong><span>{formatWorkDate(absence.startDate, lang)}{#if absence.endDate !== absence.startDate} – {formatWorkDate(absence.endDate, lang)}{/if}</span><div class="wfc-chip-row"><span class="wfc-chip" data-tone="absence">{absence.partialDay ? c.partial : c.allDay}</span><span>{absenceReason(absence.reason, c)}</span></div>{#if absence.note}<p class="wfc-record-note">{absence.note}</p>{/if}</div></li>{/each}</ul>{/if}
    {/if}
  </section>
{/if}
