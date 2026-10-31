<script lang="ts">
  import { untrack, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { locale, t } from 'svelte-i18n';
  import { page } from '$app/state';
  import { beforeNavigate } from '$app/navigation';
  import Clock from 'lucide-svelte/icons/clock-3';
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import Users from 'lucide-svelte/icons/users';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { STATION_LABELS } from '$lib/auth/types';
  import { getAssistantContext } from '$lib/assistant/context';
  import { screenOwnerKey } from '$lib/assistant/operational-context';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { emptyConfirm, type ConfirmState } from '$lib/components/ui/confirm-types';
  import { CabinetState } from '$lib/workforce/cabinet-state.svelte';
  import { workforceCopy, workforceError } from '$lib/workforce/copy';
  import { formatWorkDate, formatWorkMonth, minutesLabel, workforceLocale } from '$lib/workforce/client';
  import { MIN_WORKFORCE_YEAR, MAX_WORKFORCE_YEAR } from '$lib/workforce/validation';
  import { adjacentWorkMonth, type TeamVisibilitySummary, type ReportVisibilitySummary } from '$lib/workforce/overview';
  import type { Absence, HolidayOverride, TeamWorker, WorkEntry, WorkforceReport } from '$lib/workforce/types';
  import EntryForm from '$lib/workforce/EntryForm.svelte';
  import AbsenceForm from '$lib/workforce/AbsenceForm.svelte';
  import MonthRecords from '$lib/workforce/MonthRecords.svelte';
  import TeamTable from '$lib/workforce/TeamTable.svelte';
  import ReportArchive from '$lib/workforce/ReportArchive.svelte';
  import HolidaySettings from '$lib/workforce/HolidaySettings.svelte';
  import '$lib/workforce/styles.css';

  const cabinet = new CabinetState(() => screenOwnerKey(get(currentUser)));
  const assistant = getAssistantContext();
  let lang = $derived(workforceLocale($locale));
  let c = $derived(workforceCopy[lang]);
  let owner = $derived(screenOwnerKey($currentUser));
  let manager = $derived(['RD', 'Boss', 'HeadOfProduction'].includes($currentUser?.role ?? ''));
  let current = $derived(!!owner && cabinet.owner === owner);
  let previousMonth = $derived(adjacentWorkMonth(cabinet.month, -1));
  let nextMonth = $derived(adjacentWorkMonth(cabinet.month, 1));
  let entryDirty = $state(false);
  let absenceDirty = $state(false);
  let teamVisibility = $state.raw<{ summary: TeamVisibilitySummary; source: TeamWorker[] } | null>(null);
  let reportVisibility = $state.raw<{ summary: ReportVisibilitySummary; source: WorkforceReport[] } | null>(null);
  let handledQuery = '';
  let workerTrigger: HTMLButtonElement | null = null;
  let confirmState = $state<ConfirmState>(emptyConfirm());
  let successMessage = $derived(typeof c[cabinet.success as keyof typeof c] === 'string' ? String(c[cabinet.success as keyof typeof c]) : '');
  let errorStatus = $derived(cabinet.mutationError && typeof cabinet.mutationError === 'object' && 'status' in cabinet.mutationError ? cabinet.mutationError.status : null);
  const stationKeys: Record<string, string> = { painting: 'PAINT', film_covering: 'FILM_COATING', packing: 'LOGISTICS' };

  beforeNavigate(({ cancel, willUnload, to }) => {
    // Page exits use the native beforeunload prompt; account/logout changes clear private drafts.
    if (to?.url.pathname === page.url.pathname) return; // The query-change guard handles this once.
    if (willUnload || !current || (!entryDirty && !absenceDirty && !cabinet.busy)) return;
    if (!window.confirm(c.discardBody)) cancel();
  });

  $effect(() => {
    const account = owner, canManage = manager;
    return untrack(() => {
      cabinet.setOwner(account, canManage); entryDirty = false; absenceDirty = false; handledQuery = ''; workerTrigger = null; confirmState = emptyConfirm();
      teamVisibility = null; reportVisibility = null;
      const unregister = assistant.register({
        id: `cabinet:${account}`, title: () => c.title, tools: () => [],
        context: () => {
          const safe = account === screenOwnerKey(get(currentUser)) && cabinet.owner === account;
          const personal = safe && cabinet.view === 'personal' ? cabinet.personal : null;
          // Source identity prevents a previous month/view's counts from being reused during a reload.
          const team = safe && canManage && cabinet.view === 'team' && !cabinet.loading.team && !cabinet.errors.team
            && cabinet.team && teamVisibility?.source === cabinet.team.workers ? teamVisibility.summary : null;
          const reports = safe && canManage && cabinet.view === 'reports' && !cabinet.loading.reports && !cabinet.errors.reports
            && reportVisibility?.source === cabinet.reports ? reportVisibility.summary : null;
          // Summaries only: worker identities, absence reasons and free-text notes never leave this page.
          return {
            screen: 'cabinet', month: safe ? cabinet.month : null,
            loading: !safe || cabinet.loading[cabinet.view], unavailable: !safe || !!cabinet.errors[cabinet.view],
            view: safe ? cabinet.view : null,
            ownActualMinutes: personal?.totals.actualMinutes ?? null,
            ownCreditedMinutes: personal?.totals.creditedMinutes ?? null,
            ownCurrentMonthActualMinutes: personal?.currentMonthTotals.actualMinutes ?? null,
            ownCurrentMonthCreditedMinutes: personal?.currentMonthTotals.creditedMinutes ?? null,
            selectedDate: safe && cabinet.view === 'personal' ? cabinet.workDate : null,
            pendingEntry: safe && cabinet.view === 'personal' && entryDirty,
            pendingAbsence: safe && cabinet.view === 'personal' && absenceDirty,
            managementView: safe && canManage && cabinet.view !== 'personal',
            displayedWorkerCount: team?.count ?? null,
            workerFilter: team?.filter ?? null, workerSearchActive: team?.searchActive ?? null,
            displayedReportCount: reports?.count ?? null,
            reportKind: reports?.kind ?? null, reportVersions: reports?.versions ?? null,
            toolsAvailable: [], readOnly: true
          };
        }
      });
      return () => { cabinet.dispose(); unregister(); };
    });
  });

  $effect(() => {
    const account = owner, search = page.url.search, ready = current, canManage = manager;
    untrack(() => {
      const key = `${account}:${search}`;
      if (!ready || !canManage || handledQuery === key) return;
      handledQuery = key;
      const params = new URLSearchParams(search), view = params.get('view'), month = params.get('month');
      if ((view !== 'reports' && view !== 'team') || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < MIN_WORKFORCE_YEAR || Number(month.slice(0, 4)) > MAX_WORKFORCE_YEAR) return;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const report = params.get('report') ?? '', worker = params.get('worker') ?? '';
      guardDraft(() => { entryDirty = false; absenceDirty = false; cabinet.openNotification({ view, month, report: uuid.test(report) ? report : undefined, worker: uuid.test(worker) ? worker : undefined }); });
    });
  });

  function guardDraft(action: () => void, dirty = entryDirty || absenceDirty) {
    if (!dirty) { action(); return; }
    const account = owner;
    confirmState = { open: true, title: c.discardTitle, body: c.discardBody, tone: 'default', confirmLabel: c.discard, cancelLabel: c.cancel,
      action: () => { if (account === owner) action(); } };
  }
  function updateTeamVisibility(summary: TeamVisibilitySummary, source: TeamWorker[]) { teamVisibility = { summary, source }; }
  function updateReportVisibility(summary: ReportVisibilitySummary, source: WorkforceReport[]) { reportVisibility = { summary, source }; }
  function selectView(view: 'personal' | 'team' | 'reports') {
    if (cabinet.view === view) return;
    guardDraft(() => { entryDirty = false; absenceDirty = false; cabinet.selectView(view); });
  }
  function selectDate(date: string) {
    if (date === cabinet.workDate) return;
    guardDraft(() => { entryDirty = false; cabinet.selectDate(date); }, entryDirty);
  }
  async function viewWorker(id: string, trigger: HTMLButtonElement) {
    const account = owner;
    workerTrigger = trigger;
    await cabinet.loadWorker(id); await tick();
    if (account !== owner || cabinet.workerId !== id) return;
    const heading = document.getElementById('workforce-worker-heading');
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' }); heading?.focus({ preventScroll: true });
  }
  function closeWorker() {
    cabinet.closeWorker();
    if (workerTrigger?.isConnected) workerTrigger.focus();
  }

  function askDelete(entry: WorkEntry) {
    const account = owner;
    confirmState = { open: true, title: c.deleteTitle, body: `${formatWorkDate(entry.workDate, lang)} · ${c.deleteBody}`, tone: 'danger', confirmLabel: c.remove, cancelLabel: c.cancel,
      action: async () => { if (account === owner) await cabinet.deleteEntry(entry); } };
  }
  function askCancelAbsence(absence: Absence) {
    const account = owner;
    confirmState = { open: true, title: c.cancelAbsenceTitle, body: `${formatWorkDate(absence.startDate, lang)} – ${formatWorkDate(absence.endDate, lang)}. ${c.cancelAbsenceBody}`, tone: 'default', confirmLabel: c.cancelAbsence, cancelLabel: c.cancel,
      action: async () => { if (account === owner) await cabinet.cancelAbsence(absence); } };
  }
  function askRemoveHoliday(override: HolidayOverride) {
    const account = owner;
    confirmState = { open: true, title: c.removeHolidayTitle, body: `${formatWorkDate(override.date, lang)} · ${override.name}. ${c.removeHolidayBody}`, tone: 'danger', confirmLabel: c.remove, cancelLabel: c.cancel,
      action: async () => { if (account === owner && manager) await cabinet.removeHoliday(override); } };
  }
  async function editDate(date: string) {
    if (date !== cabinet.workDate && entryDirty) { guardDraft(() => { entryDirty = false; void editDate(date); }, true); return; }
    cabinet.selectDate(date);
    await tick();
    document.getElementById('work-entry-heading')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    document.getElementById('work-date')?.focus({ preventScroll: true });
  }
  function reloadAfterConflict() {
    cabinet.mutationError = null;
    if (cabinet.view === 'personal') { void cabinet.loadPersonal(); void cabinet.loadEditor(); }
    else if (cabinet.view === 'team') { void cabinet.loadTeam(); if (cabinet.holidaysOpen) void cabinet.loadHolidays(); }
    else void cabinet.loadReports();
  }
</script>

<svelte:head><title>{c.title} · OMS</title></svelte:head>
<svelte:window onbeforeunload={event => {
  if (current && (entryDirty || absenceDirty || cabinet.busy)) { event.preventDefault(); event.returnValue = ''; }
}} />

<div class="rf-page workforce-cabinet">
  <header class="wfc-header">
    <div><h1>{c.title}</h1><p>{c.intro}</p></div>
    {#if $currentUser}<div class="wfc-account" aria-label={c.account}><span class="wfc-avatar" aria-hidden="true">{($currentUser.displayName || $currentUser.username).slice(0, 1).toUpperCase()}</span><div><strong>{$currentUser.displayName || $currentUser.username}</strong><span>{c.roles[$currentUser.role]}</span>{#if $currentUser.stations?.length}<span class="wfc-account-stations">{$currentUser.stations.map(station => $t(`stations.${stationKeys[station.stationId] || station.stationId.toUpperCase()}`, { default: STATION_LABELS[station.stationId] })).join(' · ')}</span>{/if}</div></div>{/if}
  </header>

  {#if !$currentUser}<div class="wfc-panel wfc-empty"><p>{c.signIn}</p></div>
  {:else if !current}<p class="wfc-loading" role="status">{c.loading}</p>
  {:else}
    {#key owner}
      {#if manager}<nav class="wfc-view-switcher" aria-label={c.title}><button type="button" aria-current={cabinet.view === 'personal' ? 'page' : undefined} onclick={() => selectView('personal')}><Clock size={17} aria-hidden="true" />{c.personal}</button><button type="button" aria-current={cabinet.view === 'team' ? 'page' : undefined} onclick={() => selectView('team')}><Users size={17} aria-hidden="true" />{c.team}</button><button type="button" aria-current={cabinet.view === 'reports' ? 'page' : undefined} onclick={() => selectView('reports')}><CalendarDays size={17} aria-hidden="true" />{c.reports}</button></nav>{/if}

      {#if cabinet.mutationError}<div class="wfc-message" data-tone="error" role="alert"><p>{cabinet.mutationAction === 'export' ? c.exportError : workforceError(cabinet.mutationError, c, true)}</p>{#if errorStatus === 409}<button type="button" class="wfc-button" onclick={reloadAfterConflict}>{c.reload}</button>{/if}</div>{/if}
      {#if successMessage}<p class="wfc-message" data-tone="success" role="status">{successMessage}</p>{/if}

      {#if cabinet.view === 'personal'}
        {#if cabinet.personal}
          <section class="wfc-summary-grid" aria-label={c.currentMonth}>
            <article class="wfc-hours-card" data-testid="current-month-hours"><div class="wfc-card-top"><span class="wfc-symbol" data-tone="time"><Clock size={22} aria-hidden="true" /></span><p>{formatWorkMonth(cabinet.personal.currentMonth, lang)}</p></div><h2>{c.currentMonth}</h2><p class="wfc-hours-number">{minutesLabel(cabinet.personal.currentMonthTotals.actualMinutes, c)}</p><p class="wfc-hint">{c.recordedDays}: {cabinet.personal.currentMonthTotals.recordedDays} · {c.daysWorked}: {cabinet.personal.currentMonthTotals.daysWorked}</p></article>
            <article class="wfc-summary-card"><span class="wfc-chip" data-tone="premium">1× + 2×</span><h2>{c.creditedHours}</h2><p class="wfc-secondary-number">{minutesLabel(cabinet.personal.currentMonthTotals.creditedMinutes, c)}</p><p class="wfc-hint">{c.creditedHint}</p></article>
            <article class="wfc-summary-card"><span class="wfc-chip" data-tone="premium">2×</span><h2>{c.premiumHours}</h2><p class="wfc-secondary-number">{minutesLabel(cabinet.personal.currentMonthTotals.premiumMinutes, c)}</p><p class="wfc-hint">{c.premiumHint}</p></article>
          </section>
        {:else if cabinet.loading.personal}<div class="wfc-panel wfc-loading" role="status">{c.loading}</div>
        {:else if cabinet.errors.personal}<div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.personal, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadPersonal()}>{c.retry}</button></div>{/if}
        <p class="wfc-policy">{c.policy}</p>
        <div class="wfc-entry-grid"><EntryForm {cabinet} {c} {lang} onDirty={dirty => entryDirty = dirty} onDateChange={selectDate} /><AbsenceForm {cabinet} {c} onDirty={dirty => absenceDirty = dirty} /></div>
      {/if}

      <div class="wfc-month-bar"><div><h2>{cabinet.view === 'personal' ? c.history : cabinet.view === 'team' ? c.team : c.reports}</h2><p>{cabinet.view === 'personal' ? c.historyIntro : cabinet.view === 'team' ? c.teamIntro : c.reportsIntro}</p></div><div class="wfc-month-navigation"><div class="wfc-field"><label for="cabinet-month">{cabinet.view === 'reports' ? c.reportMonth : c.month}</label><div class="wfc-month-input"><button type="button" class="wfc-button" disabled={!previousMonth || !!cabinet.busy} aria-label={c.previousMonth} title={c.previousMonth} onclick={() => previousMonth && cabinet.selectMonth(previousMonth)}><ChevronLeft size={18} aria-hidden="true" /></button><input class="rf-input" id="cabinet-month" type="month" min={`${MIN_WORKFORCE_YEAR}-01`} max={`${MAX_WORKFORCE_YEAR}-12`} value={cabinet.month} disabled={!!cabinet.busy} onchange={event => cabinet.selectMonth(event.currentTarget.value)} /><button type="button" class="wfc-button" disabled={!nextMonth || !!cabinet.busy} aria-label={c.nextMonth} title={c.nextMonth} onclick={() => nextMonth && cabinet.selectMonth(nextMonth)}><ChevronRight size={18} aria-hidden="true" /></button></div></div>{#if cabinet.month !== cabinet.today.slice(0, 7)}<button type="button" class="wfc-button wfc-small" disabled={!!cabinet.busy} onclick={() => cabinet.selectMonth(cabinet.today.slice(0, 7))}>{c.thisMonth}</button>{/if}</div></div>

      {#if cabinet.view === 'personal'}
        {#if cabinet.personal}<section class="wfc-panel" aria-label={`${c.history} ${formatWorkMonth(cabinet.month, lang)}`}><MonthRecords data={cabinet.personal} {c} {lang} busy={!!cabinet.busy} selectedDate={cabinet.workDate} onEdit={editDate} onDelete={askDelete} onCancelAbsence={askCancelAbsence} /></section>{/if}
      {:else if cabinet.view === 'team' && manager}
        <section class="wfc-panel" aria-label={c.team}>
          {#if cabinet.loading.team}<p class="wfc-loading" role="status">{c.loading}</p>
          {:else if cabinet.errors.team}<div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.team, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadTeam()}>{c.retry}</button></div>
          {:else if cabinet.team}<TeamTable workers={cabinet.team.workers} totals={cabinet.team.totals} {c} {lang} onSelect={viewWorker} onVisibility={updateTeamVisibility} />{/if}
        </section>
        {#if cabinet.workerId}<section class="wfc-panel" aria-label={c.viewWorker}><div class="wfc-panel-top"><div><h2 id="workforce-worker-heading" tabindex="-1">{cabinet.worker?.owner.displayName || cabinet.worker?.owner.username || c.worker}</h2><p class="wfc-hint">{c.workerReadOnly}</p></div><button type="button" class="wfc-button" onclick={closeWorker}><ArrowLeft size={16} aria-hidden="true" />{c.backToTeam}</button></div>{#if cabinet.loading.worker}<p class="wfc-loading" role="status">{c.loading}</p>{:else if cabinet.errors.worker}<div class="wfc-message" data-tone="error" role="alert"><p>{workforceError(cabinet.errors.worker, c)}</p><button type="button" class="wfc-button" onclick={() => cabinet.loadWorker()}>{c.retry}</button></div>{:else if cabinet.worker}<MonthRecords data={cabinet.worker} {c} {lang} />{/if}</section>{/if}
        <HolidaySettings {cabinet} {c} {lang} onRemove={askRemoveHoliday} />
      {:else if cabinet.view === 'reports' && manager}<ReportArchive {cabinet} {c} {lang} onVisibility={updateReportVisibility} />{/if}
      <ConfirmModal bind:state={confirmState} />
    {/key}
  {/if}
</div>
