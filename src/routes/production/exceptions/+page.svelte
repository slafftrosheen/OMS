<script lang="ts">
  import {onMount} from 'svelte';
  import {page} from '$app/state';
  import {base} from '$app/paths';
  import {t} from 'svelte-i18n';
  import {currentUser} from '$lib/auth/authState.svelte';
  import type {PerformanceSummary} from '$lib/order/production-performance';
  import type {ApprovedReservationHours} from '$lib/order/capacity-forecast';
  import type {ExceptionReview,ReviewAction,ReviewKind} from '$lib/order/production-exceptions';
  import {detectProductionExceptions,mergeProductionReviews,oversightProductionFindings}
    from '$lib/order/production-exception-queue';
  import type {ProductionOversight} from '$lib/order/production-oversight';
  import {REVIEW_KINDS} from '$lib/order/production-exceptions';
  import type {ReviewQueueItem} from '$lib/order/production-exception-queue';

  let performance=$state<PerformanceSummary|null>(null);
  let bookings=$state<ApprovedReservationHours[]|null>(null);
  let reviews=$state<ExceptionReview[]>([]);
  let reviewsReady=$state(false);
  let loading=$state(false),saving=$state(false);
  let failure=$state(''),reviewFailure=$state(''),bookingWarning=$state('');
  let oversightWarning=$state('');
  let oversight=$state<ProductionOversight|null>(null);
  let oversightReady=$state(false);
  let mutationError=$state(''),saved=$state(false);
  let showResolved=$state(false),mineOnly=$state(false);
  let station=$state(page.url.searchParams.get('station')??'ALL');
  let focusOrder=$state(page.url.searchParams.get('orderId')??'');
  const initialKind=page.url.searchParams.get('kind');
  let kind=$state<'ALL'|ReviewKind>(
    initialKind&&REVIEW_KINDS.includes(initialKind as ReviewKind)
      ?initialKind as ReviewKind:'ALL');
  let displayCount=$state(40);
  let editingKey=$state<string|null>(null);
  let editorAction=$state<ReviewAction>('claim');
  let followUpNote=$state(''),followUpDate=$state('');
  let historyId=$state<string|null>(null),historyLoading=$state(false);
  let historyError=$state('');
  type HistoryRow={id:string;actor_id:string;action:string;description:string;
    previous_status:string|null;new_status:string;occurred_at:string};
  let history=$state<HistoryRow[]>([]);
  let version=0;
  let canManage=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));
  let canWrite=$derived(canManage&&reviewsReady&&!loading&&!saving&&!!performance);
  function todayInRiga(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Riga',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=(name:string)=>parts.find(p=>p.type===name)?.value??'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  let issues=$derived(performance?[
    ...detectProductionExceptions(performance,bookings,todayInRiga()),
    ...(canManage&&oversightReady&&oversight
      ?oversightProductionFindings(oversight):[])
  ]:[]);
  // Missing R39 evidence is not evidence the issue was resolved, and a
  // bounded preview must not call out-of-preview reviews "no longer current".
  // Similarly preserve the R25 missed-booking coverage distinction.
  let rows=$derived(mergeProductionReviews(issues,
    reviews.filter(r=>(bookings!==null||r.kind!=='MISSED_BOOKING')&&
      (canManage&&oversightReady||
        !['STAGE_UNCHANGED','MATERIAL_SKIPPED'].includes(r.kind))))
    .map(r=>({
      ...r,
      sourceCoverageUnknown:!r.sourceActive&&
        ['STAGE_UNCHANGED','MATERIAL_SKIPPED'].includes(r.kind)&&
        oversight?.truncated===true
    })));
  let visible=$derived(rows.filter(r=>
    (showResolved||r.review?.status!=='RESOLVED')&&
    (!mineOnly||r.review?.owner_id===$currentUser?.id)&&
    (station==='ALL'||r.station===station)&&
    (kind==='ALL'||r.kind===kind)&&
    (!focusOrder||r.orderId===focusOrder)));
  let outstanding=$derived(rows.filter(r=>r.sourceActive&&r.review?.status!=='RESOLVED').length);
  let unclaimed=$derived(rows.filter(r=>r.sourceActive&&r.review===null).length);
  let awaiting=$derived(rows.filter(r=>r.review?.status==='ACKNOWLEDGED').length);
  let overdue=$derived(rows.filter(r=>r.review?.status!=='RESOLVED'&&
    r.review?.due_date&&r.review.due_date<todayInRiga()).length);
  let reviewStations=$derived([...new Set(rows.map(r=>r.station))].sort());

  async function reload(){
    if(loading)return;
    const generation=++version;
    loading=true;failure='';reviewFailure='';bookingWarning='';
    oversightWarning='';oversight=null;oversightReady=false;
    mutationError='';saved=false;reviewsReady=false;
    performance=null;bookings=null;reviews=[];
    try{
      const managerSnapshot=canManage;
      const [p,r,b,o]=await Promise.allSettled([
        fetch(`${base}/api/production/performance?days=90`,{cache:'no-store'}),
        fetch(`${base}/api/production/exception-reviews`,{cache:'no-store'}),
        fetch(`${base}/api/production/commitments`,{cache:'no-store'}),
        managerSnapshot
          ?fetch(`${base}/api/production/board`,{cache:'no-store'})
          :Promise.resolve(null)
      ]);
      if(p.status!=='fulfilled'||!p.value.ok)throw Error($t('productionExceptions.loadFailed'));
      const report=await p.value.json();
      if(!Array.isArray(report?.active)||!Array.isArray(report?.completed))
        throw Error($t('productionExceptions.loadFailed'));
      if(generation!==version)return;
      performance=report;
      if(r.status==='fulfilled'&&r.value.ok){
        const ledger=await r.value.json();
        if(Array.isArray(ledger?.reviews)&&ledger.total===ledger.reviews.length){
          reviews=ledger.reviews;reviewsReady=true;
        }else reviewFailure=$t('productionExceptions.reviewsUnavailable');
      }else reviewFailure=$t('productionExceptions.reviewsUnavailable');
      if(b.status==='fulfilled'&&b.value.ok){
        const approved=await b.value.json();
        if(Array.isArray(approved?.commitments)&&approved.total===approved.commitments.length)
          bookings=approved.commitments;
        else bookingWarning=$t('productionExceptions.bookingsUnavailable');
      }else bookingWarning=$t('productionExceptions.bookingsUnavailable');
      if(managerSnapshot){
        if(o.status==='fulfilled'&&o.value?.ok){
          const board=await o.value.json();
          if(generation!==version)return;
          if(board?.success && board.oversight &&
            Array.isArray(board.oversight.signals) &&
            typeof board.oversight.truncated==='boolean'){
            oversight=board.oversight;
            oversightReady=true;
          }else oversightWarning=$t('productionExceptions.oversightUnavailable');
        }else oversightWarning=$t('productionExceptions.oversightUnavailable');
      }
    }catch(e){
      if(generation===version){performance=null;failure=e instanceof Error?e.message:
        $t('productionExceptions.loadFailed');}
    }finally{if(generation===version)loading=false;}
  }
  function edit(row:ReviewQueueItem,action:ReviewAction){
    editingKey=row.key;editorAction=action;mutationError='';saved=false;
    followUpDate=row.review?.due_date??todayInRiga();
    followUpNote=action==='update'?row.review?.follow_up_note??'':'';
  }
  async function submit(row:ReviewQueueItem){
    if(!canWrite||saving||row.key!==editingKey)return;
    mutationError='';saved=false;saving=true;
    try{
      const request:Record<string,unknown>={action:editorAction};
      if(editorAction==='claim'){
        request.orderId=row.orderId;request.station=row.station;request.kind=row.kind;
      }else{
        if(!row.review)throw Error($t('productionExceptions.staleReview'));
        request.reviewId=row.review.id;
        request.expectedUpdatedAt=row.review.updated_at;
      }
      if(['claim','take','update'].includes(editorAction))
        request.dueDate=followUpDate||null;
      if(['claim','update','resolve'].includes(editorAction))
        request.note=followUpNote;
      const response=await fetch(`${base}/api/production/exception-reviews`,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(request)
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(response.status===409?$t('productionExceptions.conflict')
        :result.message??result.error??$t('productionExceptions.saveFailed'));
      if(!result.review)throw Error($t('productionExceptions.saveFailed'));
      const updated=result.review as ExceptionReview;
      reviews=[...reviews.filter(r=>r.id!==updated.id),updated];
      editingKey=null;saved=true;
      if(historyId===updated.id)await loadHistory(updated.id);
    }catch(e){mutationError=e instanceof Error?e.message:$t('productionExceptions.saveFailed');}
    finally{saving=false;}
  }
  async function loadHistory(reviewId:string){
    historyId=reviewId;historyLoading=true;historyError='';history=[];
    try{
      const q=new URLSearchParams({reviewId});
      const res=await fetch(`${base}/api/production/exception-events?${q.toString()}`,{cache:'no-store'});
      if(!res.ok)throw Error($t('productionExceptions.historyFailed'));
      const obj=await res.json();
      if(!Array.isArray(obj?.events))throw Error($t('productionExceptions.historyFailed'));
      if(historyId===reviewId)history=obj.events;
    }catch(e){if(historyId===reviewId)historyError=e instanceof Error?e.message:
      $t('productionExceptions.historyFailed');}
    finally{if(historyId===reviewId)historyLoading=false;}
  }
  onMount(()=>{void reload();});
</script>
<svelte:head><title>{$t('productionExceptions.title')} — OMS</title></svelte:head>
<main class="exceptions">
  <header class="header">
    <div>
      <p class="eyebrow">{$t('productionExceptions.eyebrow')}</p>
      <h1>{$t('productionExceptions.title')}</h1>
      <p class="hint">{$t('productionExceptions.intro')}</p>
    </div>
    <nav class="nav">
      <a href={`${base}/production/performance`}>{$t('productionExceptions.performance')}</a>
      <a href={`${base}/production/planner`}>{$t('productionExceptions.planner')}</a>
      <button type="button" onclick={reload} disabled={loading||saving}>
        {$t('productionExceptions.refresh')}
      </button>
    </nav>
  </header>
  <p class="notice" role="note">{$t('productionExceptions.disclaimer')}</p>
  {#if loading}<p role="status">{$t('productionExceptions.loading')}</p>{/if}
  {#if failure}<p role="alert" class="error">{failure}</p>{/if}
  {#if reviewFailure}<p role="alert" class="error">{reviewFailure}</p>{/if}
  {#if bookingWarning}<p role="alert" class="warning">{bookingWarning}</p>{/if}
  {#if oversightWarning}<p role="alert" class="warning">{oversightWarning}</p>{/if}
  {#if oversight?.truncated&&canManage}
    <p class="warning" role="note">{$t('productionExceptions.oversightPreviewLimited',{
      values:{limit:oversight.previewLimit,total:oversight.total}
    })}</p>
  {/if}
  {#if saved}<p role="status" class="success">{$t('productionExceptions.saved')}</p>{/if}
  {#if performance}
    <div class="metrics">
      <div><strong>{outstanding}</strong><span>{$t('productionExceptions.openFindings')}</span></div>
      <div><strong>{unclaimed}</strong><span>{$t('productionExceptions.unclaimed')}</span></div>
      <div><strong>{awaiting}</strong><span>{$t('productionExceptions.assigned')}</span></div>
      <div><strong>{overdue}</strong><span>{$t('productionExceptions.overdueFollowups')}</span></div>
    </div>
    <section class="filters" aria-label={$t('productionExceptions.filters')}>
      <label>{$t('productionExceptions.station')}
        <select bind:value={station}>
          <option value="ALL">{$t('productionExceptions.all')}</option>
          {#each reviewStations as stationCode}
            <option value={stationCode}>{stationCode}</option>
          {/each}
        </select>
      </label>
      <label>{$t('productionExceptions.type')}
        <select bind:value={kind}>
          <option value="ALL">{$t('productionExceptions.all')}</option>
          <option value="MISSING_ACTUAL">{$t('productionExceptions.kind.MISSING_ACTUAL')}</option>
          <option value="ACTUAL_OVERRUN">{$t('productionExceptions.kind.ACTUAL_OVERRUN')}</option>
          <option value="BLOCKED">{$t('productionExceptions.kind.BLOCKED')}</option>
          <option value="REWORK">{$t('productionExceptions.kind.REWORK')}</option>
          <option value="MISSED_BOOKING">{$t('productionExceptions.kind.MISSED_BOOKING')}</option>
          <option value="STAGE_UNCHANGED">{$t('productionExceptions.kind.STAGE_UNCHANGED')}</option>
          <option value="MATERIAL_SKIPPED">{$t('productionExceptions.kind.MATERIAL_SKIPPED')}</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={showResolved}/>
        {$t('productionExceptions.showResolved')}</label>
      <label class="check"><input type="checkbox" bind:checked={mineOnly}/>
        {$t('productionExceptions.mine')}</label>
    </section>
    {#if focusOrder}
      <p class="hint" role="status">
        {$t('productionExceptions.filteredOrder')}
        <button type="button" onclick={()=>focusOrder=''}>{$t('productionExceptions.clearOrderFilter')}</button>
      </p>
    {/if}
    {#if !canManage}<p class="hint">{$t('productionExceptions.readOnly')}</p>{/if}
    <section class="findings" aria-label={$t('productionExceptions.queue')}>
      {#each visible.slice(0,displayCount) as row (row.key)}
        <article class="issue" data-severity={row.severity}>
          <div class="issue-head">
            <div class="issue-title">
              <strong>{$t(`productionExceptions.kind.${row.kind}`)}</strong>
              <span class="pill">{row.station}</span>
              <span class="pill" data-state={row.review?.status??'UNCLAIMED'}>
                {$t(`productionExceptions.state.${row.review?.status??'UNCLAIMED'}`)}
              </span>
              {#if !row.sourceActive}
                <span class="pill">
                  {$t(row.sourceCoverageUnknown
                    ?'productionExceptions.sourceOutsidePreview'
                    :'productionExceptions.notCurrent')}
                </span>
              {/if}
            </div>
            <a href={`${base}/orders/${encodeURIComponent(row.orderId)}`}>
              {row.poNumber??row.title??row.orderId.slice(0,8)}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p class="description">
            {$t(`productionExceptions.detail.${row.details}`)}
            {#if row.hours!==null} · {row.hours} h{/if}
            {#if row.referenceDate} · {row.referenceDate}{/if}
            {#if row.sourceNote}<span class="source-note"> · {row.sourceNote}</span>{/if}
          </p>
          {#if row.review}
            <div class="review-info">
              {#if row.review.owner_id}
                <span>{row.review.owner_id===$currentUser?.id
                  ?$t('productionExceptions.assignedToYou')
                  :$t('productionExceptions.assignedToAnother')}</span>
              {/if}
              {#if row.review.due_date}
                <span class:late={row.review.status!=='RESOLVED'&&row.review.due_date<todayInRiga()}>
                  {$t('productionExceptions.due')}: {row.review.due_date}
                </span>
              {/if}
              {#if row.review.follow_up_note}<span>{row.review.follow_up_note}</span>{/if}
              {#if row.review.resolution_note}
                <span>{$t('productionExceptions.resolution')}: {row.review.resolution_note}</span>
              {/if}
            </div>
          {/if}
          <div class="actions">
            {#if canWrite}
              {#if !row.review&&row.sourceActive}
                <button type="button" onclick={()=>edit(row,'claim')} disabled={saving}>
                  {$t('productionExceptions.claim')}
                </button>
              {:else if row.review}
                {#if row.review.status==='OPEN'}
                  <button type="button" onclick={()=>edit(row,'take')} disabled={saving}>
                    {$t('productionExceptions.take')}
                  </button>
                {/if}
                {#if row.review.status!=='RESOLVED'}
                  <button type="button" onclick={()=>edit(row,'update')} disabled={saving}>
                    {$t('productionExceptions.update')}
                  </button>
                  <button type="button" onclick={()=>edit(row,'resolve')} disabled={saving}>
                    {$t('productionExceptions.resolve')}
                  </button>
                {:else if row.sourceActive}
                  <button type="button" onclick={()=>edit(row,'reopen')} disabled={saving}>
                    {$t('productionExceptions.reopen')}
                  </button>
                {/if}
              {/if}
            {/if}
            {#if row.review}
              <button type="button" disabled={historyLoading&&historyId===row.review.id}
                onclick={()=>historyId===row.review?.id?(historyId=null):(void loadHistory(row.review!.id))}>
                {$t('productionExceptions.history')}
              </button>
            {/if}
          </div>
          {#if editingKey===row.key&&canWrite}
            <div class="editor">
              <h3>{$t(`productionExceptions.action.${editorAction}`)}</h3>
              {#if ['claim','take','update'].includes(editorAction)}
                <label>{$t('productionExceptions.followUpDate')}
                  <input type="date" bind:value={followUpDate}/>
                </label>
              {/if}
              {#if ['claim','update','resolve'].includes(editorAction)}
                <label>{$t(editorAction==='resolve'?'productionExceptions.resolutionNote':
                  'productionExceptions.followUpNote')}
                  <textarea rows="3" maxlength={editorAction==='resolve'?2000:1000}
                    bind:value={followUpNote}></textarea>
                </label>
                {#if row.kind==='MATERIAL_SKIPPED'}
                  <p class="hint" role="note">
                    {$t('productionExceptions.materialReconciliationGuidance')}
                  </p>
                {:else if row.kind==='STAGE_UNCHANGED'}
                  <p class="hint" role="note">
                    {$t('productionExceptions.stageAgeGuidance')}
                  </p>
                {/if}
              {/if}
              {#if mutationError}<p role="alert" class="error">{mutationError}</p>{/if}
              <div class="actions">
                <button type="button" disabled={saving} onclick={()=>{editingKey=null;mutationError='';}}>
                  {$t('productionExceptions.cancel')}
                </button>
                <button type="button" disabled={saving} onclick={()=>submit(row)}>
                  {saving?$t('productionExceptions.saving'):$t('productionExceptions.confirm')}
                </button>
              </div>
            </div>
          {/if}
          {#if row.review&&historyId===row.review.id}
            <div class="history">
              <h3>{$t('productionExceptions.history')}</h3>
              {#if historyLoading}<p>{$t('productionExceptions.loadingHistory')}</p>{/if}
              {#if historyError}<p role="alert" class="error">{historyError}</p>{/if}
              {#each history as event (event.id)}
                <div>
                  <time datetime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
                  <strong>{$t(`productionExceptions.action.${event.action}`)}</strong>
                  <span>{event.previous_status??'—'} → {event.new_status}</span>
                  <span>{$t('productionExceptions.actor')}: {event.actor_id.slice(0,8)}</span>
                  {#if event.description}<p>{event.description}</p>{/if}
                </div>
              {/each}
            </div>
          {/if}
        </article>
      {:else}
        <p class="hint">{$t('productionExceptions.noResults')}</p>
      {/each}
      {#if visible.length>displayCount}
        <button type="button" onclick={()=>displayCount+=40}>
          {$t('productionExceptions.showMore')}
        </button>
      {/if}
    </section>
  {/if}
</main>
<style>
  .exceptions{max-width:1480px;margin:0 auto;padding:clamp(1rem,2.5vw,2rem);
    display:grid;gap:1rem;color:var(--text)}
  .header,.nav,.issue-head,.issue-title,.actions,.filters{display:flex;align-items:center;
    gap:.65rem;flex-wrap:wrap}
  .header{justify-content:space-between}.header h1{font-size:clamp(1.6rem,3vw,2.1rem);margin:.3rem 0}
  .eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  .hint,.description{font-size:.84rem;color:var(--muted);margin:.2rem 0}
  .notice{border-left:3px solid var(--brand);padding:.8rem;background:var(--bg-1);font-size:.84rem;margin:0}
  .error{color:var(--error)}.warning{color:var(--warn)}.success{color:var(--brand)}
  button,.nav a{min-height:40px;border:1px solid var(--border);background:var(--bg-2);
    color:var(--text);border-radius:8px;padding:.5rem .8rem;cursor:pointer;text-decoration:none;font-weight:600}
  button:disabled{opacity:.5;cursor:not-allowed}
  .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}
  .metrics>div{background:var(--bg-1);border:1px solid var(--border);border-radius:10px;
    padding:.85rem;display:grid;gap:.3rem}
  .metrics strong{font-size:1.6rem;font-variant-numeric:tabular-nums}
  .metrics span{font-size:.75rem;color:var(--muted)}
  .filters{padding:.8rem;background:var(--bg-1);border-radius:9px}
  .filters label{display:flex;align-items:center;gap:.4rem;font-size:.82rem}
  select,input[type=date],textarea{background:var(--bg-2);color:var(--text);padding:.5rem;
    border:1px solid var(--border);border-radius:8px;max-width:100%}
  textarea{width:100%;resize:vertical}
  .findings{display:grid;gap:.65rem}
  .issue{background:var(--bg-1);border:1px solid var(--border);border-left:3px solid var(--warn);
    border-radius:10px;padding:.85rem;display:grid;gap:.7rem}
  .issue[data-severity="critical"]{border-left-color:var(--error)}
  .issue-head{justify-content:space-between}.issue-head a{color:var(--text);font-weight:700}
  .pill{padding:.2rem .5rem;border:1px solid var(--border);border-radius:100px;font-size:.71rem;color:var(--muted)}
  .pill[data-state="RESOLVED"]{color:var(--brand)}
  .review-info{display:flex;gap:.8rem;flex-wrap:wrap;font-size:.77rem;color:var(--muted)}
  .late{color:var(--error);font-weight:700}
  .editor,.history{padding:.8rem;border:1px solid var(--border);border-radius:8px;
    background:var(--bg-2);display:grid;gap:.6rem}
  .editor h3,.history h3{margin:0;font-size:.96rem}
  .editor label{display:grid;gap:.3rem;font-size:.78rem}
  .history>div{border-top:1px solid var(--border);padding-top:.45rem;font-size:.76rem}
  .history time{margin-right:.5rem}.history p{white-space:pre-wrap}
  @media(max-width:650px){.issue-head{align-items:flex-start}.filters{align-items:flex-start}}
</style>
