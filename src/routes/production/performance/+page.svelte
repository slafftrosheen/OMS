<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {t} from 'svelte-i18n';
  import type {PerformanceSummary} from '$lib/order/production-performance';
  import {summarizeApprovedSchedule} from '$lib/order/production-performance';
  import type {ApprovedReservationHours} from '$lib/order/capacity-forecast';
  const windows=[7,30,90] as const;
  let days=$state<7|30|90>(30);
  let result=$state<PerformanceSummary|null>(null);
  let loading=$state(false),failure=$state('');
  let bookingStatus=$state<'loading'|'ready'|'unavailable'>('loading');
  let approved=$state<ApprovedReservationHours[]>([]);
  let bookedByStage=$derived.by(()=>{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Riga',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=(key:string)=>parts.find(item=>item.type===key)?.value??'';
    return summarizeApprovedSchedule(approved,
      `${part('year')}-${part('month')}-${part('day')}`);
  });
  let selectedStation=$state('ALL'),showInactive=$state(false);
  let showCompleted=$state(30),showActive=$state(30);
  let requestVersion=0;
  async function load(){
    const version=++requestVersion;
    loading=true;failure='';result=null;bookingStatus='loading';approved=[];
    try{
      const [performanceResponse,bookingResponse]=await Promise.allSettled([
        fetch(`${base}/api/production/performance?days=${days}`,{cache:'no-store'}),
        fetch(`${base}/api/production/commitments`,{cache:'no-store'})
      ]);
      if(performanceResponse.status!=='fulfilled'||!performanceResponse.value.ok)
        throw new Error($t('productionPerformance.loadFailed'));
      const body=await performanceResponse.value.json();
      if(!body?.totals||!Array.isArray(body.stations)||
         !Array.isArray(body.completed)||!Array.isArray(body.active)||
         body.days!==days)throw new Error($t('productionPerformance.loadFailed'));
      if(version!==requestVersion)return;
      result=body;
      if(bookingResponse.status==='fulfilled'&&bookingResponse.value.ok){
        try{
          const payload=await bookingResponse.value.json();
          if(!Array.isArray(payload?.commitments)||
             payload.total!==payload.commitments.length||
             !Number.isInteger(payload.total))
            throw new Error('Incomplete commitments');
          // The all-dates R23 snapshot is validated server-side and scoped by RLS.
          if(version!==requestVersion)return;
          approved=payload.commitments;
          bookingStatus='ready';
        }catch{bookingStatus='unavailable';}
      }else bookingStatus='unavailable';
    }catch(err){
      if(version===requestVersion)failure=err instanceof Error?err.message:$t('productionPerformance.loadFailed');
    }finally{if(version===requestVersion)loading=false;}
  }
  let stations=$derived(result?.stations.filter(s=>showInactive||
    s.completed>0||s.active>0)??[]);
  let completedRows=$derived(result?.completed.filter(r=>selectedStation==='ALL'||r.station===selectedStation)??[]);
  let activeRows=$derived(result?.active.filter(r=>selectedStation==='ALL'||r.station===selectedStation)??[]);
  const fmt=(n:number|null)=>n===null?'—':n.toLocaleString(undefined,{maximumFractionDigits:2});
  function changeWindow(event:Event){
    const next=Number((event.currentTarget as HTMLSelectElement).value);
    if(next!==7&&next!==30&&next!==90)return;
    days=next;showCompleted=30;showActive=30;void load();
  }
  onMount(()=>{void load();});
</script>

<svelte:head><title>{$t('productionPerformance.title')} — OMS</title></svelte:head>
<main class="performance">
  <header class="heading">
    <div>
      <p class="eyebrow">{$t('productionPerformance.eyebrow')}</p>
      <h1>{$t('productionPerformance.title')}</h1>
      <p class="hint">{$t('productionPerformance.subtitle')}</p>
    </div>
    <nav class="actions">
      <a href={`${base}/production`}>{$t('productionPerformance.board')}</a>
      <a href={`${base}/production/planner`}>{$t('productionPerformance.planner')}</a>
      <a href={`${base}/production/exceptions`}>{$t('productionExceptions.open')}</a>
    </nav>
  </header>
  <section class="toolbar">
    <label>{$t('productionPerformance.window')}
      <select value={days} onchange={changeWindow} disabled={loading}>
        {#each windows as item}
          <option value={item}>{item} {$t('productionPerformance.days')}</option>
        {/each}
      </select>
    </label>
    <label>{$t('productionPerformance.station')}
      <select bind:value={selectedStation}>
        <option value="ALL">{$t('productionPerformance.allStations')}</option>
        {#each result?.stations??[] as item}
          <option value={item.station}>{item.station}</option>
        {/each}
      </select>
    </label>
    <label class="checkbox">
      <input type="checkbox" bind:checked={showInactive} />
      {$t('productionPerformance.showEmpty')}
    </label>
    <button type="button" onclick={load} disabled={loading}>{$t('productionPerformance.refresh')}</button>
  </section>
  {#if loading}<p role="status">{$t('productionPerformance.loading')}</p>{/if}
  {#if failure}
    <p class="error" role="alert">{failure}
      <button type="button" onclick={load} disabled={loading}>{$t('productionPerformance.retry')}</button>
    </p>
  {/if}
  <p class="disclaimer" role="note">{$t('productionPerformance.disclaimer')}</p>
  {#if result}
    {#if bookingStatus==='unavailable'}
      <p role="alert" class="error">{$t('productionPerformance.bookingsUnavailable')}</p>
    {:else if bookingStatus==='ready'}
      <p role="note" class="hint">{$t('productionPerformance.bookingsExplanation')}</p>
    {/if}
  {/if}
  {#if result}
    <div class="stats">
      <div><strong>{result.totals.completed}</strong>
        <span>{$t('productionPerformance.completed')}</span></div>
      <div><strong>{result.totals.completedComparable}</strong>
        <span>{$t('productionPerformance.comparable')}</span></div>
      <div><strong>{result.totals.completedMissingActual}</strong>
        <span>{$t('productionPerformance.missingActual')}</span></div>
      <div><strong>{fmt(result.totals.completedEstimatedHours)}</strong>
        <span>{$t('productionPerformance.matchedEstimatedHours')}</span></div>
      <div><strong>{fmt(result.totals.completedMatchedActualHours)}</strong>
        <span>{$t('productionPerformance.matchedActualHours')}</span></div>
      <div class:over={result.totals.completedVarianceHours>0}>
        <strong>{fmt(result.totals.completedVarianceHours)}</strong>
        <span>{$t('productionPerformance.varianceHours')}</span></div>
      <div><strong>{result.totals.activeReportedProgress}/{result.totals.active}</strong>
        <span>{$t('productionPerformance.progressCoverage')}</span></div>
      <div><strong>{result.totals.overEstimate}</strong>
        <span>{$t('productionPerformance.overruns')}</span></div>
    </div>
    <p class="hint">{$t('productionPerformance.asOf',{values:{time:new Date(result.asOf).toLocaleString()}})}</p>
    <section class="panel">
      <h2>{$t('productionPerformance.stationComparison')}</h2>
      <p class="hint">{$t('productionPerformance.stationExplanation')}</p>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>{$t('productionPerformance.station')}</th>
            <th>{$t('productionPerformance.completed')}</th>
            <th>{$t('productionPerformance.comparable')}</th>
            <th>{$t('productionPerformance.missingActual')}</th>
            <th>{$t('productionPerformance.matchedEstimatedHours')}</th>
            <th>{$t('productionPerformance.matchedActualHours')}</th>
            <th>{$t('productionPerformance.varianceHours')}</th>
            <th>{$t('productionPerformance.activeNow')}</th>
          </tr></thead>
          <tbody>
            {#each stations as s (s.station)}
              <tr>
                <th scope="row">{s.station}</th><td>{s.completed}</td>
                <td>{s.comparable}</td><td>{s.missingActual}</td>
                <td>{fmt(s.comparable?s.estimatedHours:null)}</td>
                <td>{fmt(s.comparable?s.actualHours:null)}</td>
                <td class:over={s.varianceHours>0}>{fmt(s.comparable?s.varianceHours:null)}</td>
                <td>{s.active}</td>
              </tr>
            {:else}
              <tr><td colspan="8">{$t('productionPerformance.none')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <h2>{$t('productionPerformance.currentWork')} ({activeRows.length})</h2>
      <p class="hint">{$t('productionPerformance.currentExplanation')}</p>
      <div class="records">
        {#each activeRows.slice(0,showActive) as row (`${row.orderId}-${row.station}`)}
          <article class="record">
            <div class="mainline">
              <a href={`${base}/orders/${encodeURIComponent(row.orderId)}`}>
                {row.poNumber??row.title??row.orderId.slice(0,8)}
              </a>
              <strong>{row.station}</strong>
              <span class="state">{row.state}</span>
              <span>{$t('productionPerformance.estimate')}: {fmt(row.estimatedHours)} h</span>
              <span>{$t('productionPerformance.actual')}: {fmt(row.actualHours)} h</span>
              {#if row.varianceHours!==null}
                <span class:over={row.varianceHours>0}>{$t('productionPerformance.variance')}: {fmt(row.varianceHours)} h</span>
              {/if}
            </div>
            {#if bookingStatus==='ready'}
              {@const reservation=bookedByStage.get(`${row.orderId}:${row.station}`)}
              <p class="hint">
                {$t('productionPerformance.approvedFuture')}: {fmt(reservation?.futureHours??0)} h
                {#if reservation?.nextDate}
                  · {$t('productionPerformance.nextBookedDay')}: {reservation.nextDate}
                {/if}
              </p>
              {#if reservation && reservation.pastHours>0}
                <p class="warning">
                  {$t('productionPerformance.pastBooking',{values:{hours:reservation.pastHours}})}
                </p>
              {/if}
            {/if}
            {#if row.progressAt}
              <p class="hint">
                {$t('productionPerformance.reported')}:
                {row.progressPercent===null?'—':`${row.progressPercent}%`}
                · {new Date(row.progressAt).toLocaleString()}
              </p>
              {#if row.progressNote}<p class="note">{row.progressNote}</p>{/if}
            {:else}
              <p class="hint">{$t('productionPerformance.noReport')}</p>
            {/if}
            {#if row.blockedReason}<p class="warning">{row.blockedReason}</p>{/if}
          </article>
        {:else}<p>{$t('productionPerformance.none')}</p>{/each}
        {#if activeRows.length>showActive}
          <button type="button" class="more" onclick={()=>showActive+=30}>
            {$t('productionPerformance.showMore')}
          </button>
        {/if}
      </div>
    </section>
    <section class="panel">
      <h2>{$t('productionPerformance.recentCompleted')} ({completedRows.length})</h2>
      <p class="hint">{$t('productionPerformance.completedExplanation')}</p>
      <div class="records">
        {#each completedRows.slice(0,showCompleted) as row (`${row.orderId}-${row.station}`)}
          <article class="record">
            <div class="mainline">
              <a href={`${base}/orders/${encodeURIComponent(row.orderId)}`}>
                {row.poNumber??row.title??row.orderId.slice(0,8)}
              </a>
              <strong>{row.station}</strong>
              <time datetime={row.completedAt??''}>{row.completedAt?new Date(row.completedAt).toLocaleString():'—'}</time>
              <span>{$t('productionPerformance.estimate')}: {fmt(row.estimatedHours)} h</span>
              <span>{$t('productionPerformance.actual')}: {fmt(row.actualHours)} h</span>
              {#if row.varianceHours!==null}
                <span class:over={row.varianceHours>0}>{$t('productionPerformance.variance')}: {fmt(row.varianceHours)} h</span>
              {/if}
            </div>
          </article>
        {:else}<p>{$t('productionPerformance.none')}</p>{/each}
        {#if completedRows.length>showCompleted}
          <button type="button" class="more" onclick={()=>showCompleted+=30}>
            {$t('productionPerformance.showMore')}
          </button>
        {/if}
      </div>
    </section>
  {/if}
</main>
<style>
 .performance{max-width:1500px;padding:clamp(1rem,2.5vw,2rem);margin:0 auto;display:grid;
   gap:1rem;color:var(--text)}
 .heading,.actions,.toolbar,.mainline{display:flex;align-items:center;flex-wrap:wrap;gap:.7rem}
 .heading{justify-content:space-between}.heading h1{margin:.2rem 0;font-size:clamp(1.6rem,3vw,2.2rem)}
 .eyebrow{letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-size:.74rem;margin:0}
 .hint{color:var(--muted);font-size:.8rem;margin:.3rem 0}
 .actions a,.toolbar button,.more,.error button{display:inline-flex;align-items:center;min-height:40px;
   padding:.5rem .8rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-2);
   color:var(--text);text-decoration:none;cursor:pointer;font-weight:600}
 .toolbar{background:var(--bg-1);border-radius:10px;padding:.8rem;justify-content:space-between}
 .toolbar label{display:flex;gap:.5rem;align-items:center;font-size:.85rem}
 select{padding:.55rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);color:var(--text)}
 button:disabled{opacity:.5;cursor:not-allowed}
 .disclaimer{background:var(--bg-1);border-left:3px solid var(--brand);padding:.9rem;margin:0;font-size:.83rem}
 .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(142px,1fr));gap:.6rem}
 .stats>div{border:1px solid var(--border);border-radius:10px;background:var(--bg-1);
   padding:1rem;display:grid;gap:.2rem}
 .stats strong{font-size:1.5rem;font-variant-numeric:tabular-nums}
 .stats span{font-size:.74rem;color:var(--muted)}
 .over{color:var(--error);font-weight:700}
 .panel{border:1px solid var(--border);border-radius:12px;padding:1rem;background:var(--bg-1);min-width:0}
 .panel h2{margin:0;font-size:1.1rem}
 .table-scroll{overflow:auto;max-width:100%}
 table{width:100%;border-collapse:collapse;font-size:.84rem;margin:.65rem 0}
 td,th{padding:.55rem .6rem;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
 thead th{font-size:.74rem;color:var(--muted)}
 .records{display:grid;gap:.6rem;margin-top:.8rem}
 .record{border:1px solid var(--border);border-radius:9px;padding:.7rem;background:var(--bg-2)}
 .record a{color:var(--text);font-weight:700}
 .state{font-size:.74rem;color:var(--muted)}
 .note{font-size:.85rem;margin:.4rem 0;white-space:pre-wrap;overflow-wrap:anywhere}
 .warning,.error{color:var(--error);font-size:.84rem}
 .more{justify-self:start}
 @media(max-width:650px){.toolbar{justify-content:start}.panel{padding:.65rem}
   .mainline{align-items:flex-start}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
