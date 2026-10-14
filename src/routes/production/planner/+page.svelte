<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from 'svelte-i18n';
  import {base} from '$app/paths';
  import {currentUser} from '$lib/auth/authState.svelte';
  import {ALL_STATIONS} from '$lib/order/workflow';
  import type {PlanningItem} from '$lib/order/production-planning';
  import type {ProductionCapacity} from '$lib/order/production-capacity';
  import {dailyStationHours,validateCapacityWrite} from '$lib/order/production-capacity';
  import {buildCapacityForecast,type ApprovedReservationHours} from '$lib/order/capacity-forecast';
  import {reconcileProductionSchedule} from '$lib/order/schedule-drift';
  import ProductionReservationPanel from '$lib/components/production/ProductionReservationPanel.svelte';

  const WEEK=[1,2,3,4,5,6,7];
  function localDate():string{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Riga',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const read=(key:string)=>parts.find(p=>p.type===key)?.value??'';
    return `${read('year')}-${read('month')}-${read('day')}`;
  }
  let startDate=$state(localDate());
  let horizon=$state<7|14|28>(14);
  let includeUpcoming=$state(false);
  let stages=$state<Record<string,PlanningItem[]>|null>(null);
  let capacity=$state<ProductionCapacity[]>([]);
  let commitments=$state<ApprovedReservationHours[]>([]);
  let commitmentsReady=$state(false);
  let snapshotError=$state('');
  let loading=$state(false);
  let loaded=$state(false);
  let loadError=$state('');
  let lastLoaded=$state('');
  let saveError=$state('');
  let saved=$state(false);
  let saving=$state(false);
  let selectedStation=$state('CNC');
  let workers=$state(0);
  let hours=$state(8);
  let efficiency=$state(100);
  let workdays=$state<number[]>([1,2,3,4,5]);
  let expectedUpdatedAt=$state<string|null>(null);
  let edited=$state(false);
  // Presentation only: the API and RLS enforce the authoritative manager permission.
  let canConfigure=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));
  let projection=$derived.by(()=>stages&&commitmentsReady
    ? buildCapacityForecast(stages,capacity,startDate,horizon,includeUpcoming,commitments) : null);
  let scheduleDrift=$derived.by(()=>stages&&commitmentsReady
    ? reconcileProductionSchedule(stages,capacity,commitments,localDate()) : []);
  let visibleStations=$derived(ALL_STATIONS.filter(station=>
    (stages?.[station]?.length??0)>0||capacity.some(c=>c.station===station)));

  function openStation(station:string,force=false){
    if(!force&&edited&&!confirm($t('capacityPlanner.unsaved')))return;
    selectedStation=station;
    const existing=capacity.find(c=>c.station===station);
    workers=existing?.workers??0;
    hours=existing?.hours_per_worker??8;
    efficiency=existing?.efficiency_percent??100;
    workdays=existing?[...existing.workdays]:[1,2,3,4,5];
    expectedUpdatedAt=existing?.updated_at??null;
    saveError='';saved=false;edited=false;
  }
  function toggleDay(day:number){
    workdays=workdays.includes(day)?workdays.filter(x=>x!==day):[...workdays,day].sort();
    edited=true;
  }
  async function loadCommitmentSnapshot():Promise<ApprovedReservationHours[]>{
    const response=await fetch(`${base}/api/production/commitments`,{cache:'no-store'});
    if(!response.ok)throw new Error($t('scheduleReconciliation.snapshotFailed'));
    const data=await response.json();
    if(!Array.isArray(data?.commitments)||data.total!==data.commitments.length||
       !Number.isInteger(data.total))throw new Error($t('scheduleReconciliation.snapshotFailed'));
    return data.commitments;
  }
  async function refreshCommitments(){
    commitmentsReady=false;snapshotError='';
    try{
      commitments=await loadCommitmentSnapshot();
      commitmentsReady=true;
    }catch(err){
      snapshotError=err instanceof Error?err.message:$t('scheduleReconciliation.snapshotFailed');
    }
  }
  async function reload(){
    if(loading)return;
    loading=true;loadError='';commitmentsReady=false;snapshotError='';
    try{
      const [boardRes,settingsRes,approved]=await Promise.all([
        fetch(`${base}/api/production/board`,{cache:'no-store'}),
        fetch(`${base}/api/production/capacity`,{cache:'no-store'}),
        loadCommitmentSnapshot()
      ]);
      if(!boardRes.ok||!settingsRes.ok)throw new Error($t('capacityPlanner.loadFailed'));
      const [board,config]=await Promise.all([boardRes.json(),settingsRes.json()]);
      if(!board?.success||!board?.stations||!Array.isArray(config?.settings))
        throw new Error($t('capacityPlanner.loadFailed'));
      stages=board.stations;
      capacity=config.settings;
      commitments=approved;
      commitmentsReady=true;
      loaded=true;lastLoaded=new Date().toLocaleTimeString();
      if(!edited)openStation(selectedStation,true);
    }catch(err){
      loadError=err instanceof Error?err.message:$t('capacityPlanner.loadFailed');
      snapshotError=$t('scheduleReconciliation.snapshotFailed');
    }
    finally{loading=false;}
  }
  async function save(){
    if(!canConfigure||saving)return;
    saveError='';saved=false;
    let input:ReturnType<typeof validateCapacityWrite>;
    try{
      input=validateCapacityWrite({station:selectedStation,workers,
        hoursPerWorker:hours,efficiencyPercent:efficiency,workdays,expectedUpdatedAt});
    }catch(err){saveError=err instanceof Error?err.message:$t('capacityPlanner.saveFailed');return;}
    saving=true;
    try{
      const response=await fetch(`${base}/api/production/capacity`,{
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(input)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(response.status===409
        ?$t('capacityPlanner.conflict'):payload.message??payload.error??$t('capacityPlanner.saveFailed'));
      if(!payload?.setting)throw new Error($t('capacityPlanner.saveFailed'));
      capacity=[...capacity.filter(c=>c.station!==selectedStation),payload.setting];
      expectedUpdatedAt=payload.setting.updated_at;
      edited=false;saved=true;
    }catch(err){saveError=err instanceof Error?err.message:$t('capacityPlanner.saveFailed');}
    finally{saving=false;}
  }
  onMount(()=>{void reload();});
</script>

<svelte:head>
  <title>{$t('capacityPlanner.title')} — OMS</title>
</svelte:head>
<main class="planner">
  <header class="header">
    <div>
      <p class="eyebrow">{$t('capacityPlanner.eyebrow')}</p>
      <h1>{$t('capacityPlanner.title')}</h1>
      <p class="description">{$t('capacityPlanner.description')}</p>
    </div>
    <div class="header-actions">
      <a href={`${base}/production`} class="link">{$t('capacityPlanner.back')}</a>
      <button onclick={reload} disabled={loading}>{$t('capacityPlanner.refresh')}</button>
    </div>
  </header>

  <p class="disclaimer" role="note">{$t('capacityPlanner.disclaimer')}</p>
  {#if loadError}
    <div class="error" role="alert">{loadError}
      <button onclick={reload} disabled={loading}>{$t('capacityPlanner.retry')}</button>
    </div>
  {/if}
  {#if snapshotError}
    <p class="error" role="alert">{snapshotError}
      <button type="button" onclick={refreshCommitments} disabled={loading}>
        {$t('scheduleReconciliation.retry')}
      </button>
    </p>
  {/if}
  {#if !loaded}
    <p role="status">{loading?$t('capacityPlanner.loading'):$t('capacityPlanner.noData')}</p>
  {:else}
    <div class="controls">
      <label>{$t('capacityPlanner.horizon')}
        <select value={horizon} onchange={(e)=>horizon=Number(e.currentTarget.value) as 7|14|28}>
          <option value="7">7 {$t('capacityPlanner.days')}</option>
          <option value="14">14 {$t('capacityPlanner.days')}</option>
          <option value="28">28 {$t('capacityPlanner.days')}</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={includeUpcoming}/>
        {$t('capacityPlanner.includeUpcoming')}
      </label>
      <span class="updated">{$t('capacityPlanner.updated',{values:{time:lastLoaded}})}</span>
    </div>

    {#if projection}
      <div class="stats">
        <div><strong>{projection.committedHours}</strong>
          <span>{$t('scheduleReconciliation.approvedHours')}</span></div>
        <div><strong>{projection.freeHours}</strong>
          <span>{$t('scheduleReconciliation.remainingCapacity')}</span></div>
        <div><strong>{projection.overbookedDays}</strong>
          <span>{$t('scheduleReconciliation.overbookedDays')}</span></div>
        <div><strong>{projection.configuredStations}/{ALL_STATIONS.length}</strong>
          <span>{$t('capacityPlanner.configured')}</span></div>
        <div><strong>{projection.allocatedHours}</strong>
          <span>{$t('capacityPlanner.allocatedHours')}</span></div>
        <div><strong>{projection.availableHours}</strong>
          <span>{$t('capacityPlanner.availableHours')}</span></div>
        <div><strong>{projection.unplanned}</strong>
          <span>{$t('capacityPlanner.unplanned')}</span></div>
        <div><strong>{projection.late}</strong>
          <span>{$t('capacityPlanner.lateSlices')}</span></div>
      </div>
      {#if scheduleDrift.length}
        <section class="card drift" aria-label={$t('scheduleReconciliation.title')}>
          <h2>{$t('scheduleReconciliation.title')} ({scheduleDrift.length})</h2>
          <p class="hint">{$t('scheduleReconciliation.explanation')}</p>
          <div class="drift-list">
            {#each scheduleDrift.slice(0,30) as issue (issue.key)}
              <div class="drift-row" data-severity={issue.severity}>
                <strong>{issue.station}</strong>
                {#if issue.orderId}
                  <a href={`${base}/orders/${encodeURIComponent(issue.orderId)}`}>
                    {issue.orderId.slice(0,8)}
                  </a>
                {/if}
                {#if issue.date}<time datetime={issue.date}>{issue.date}</time>{/if}
                <span>{$t(`scheduleReconciliation.reason.${issue.reason}`)}</span>
                <small>{issue.hours} h</small>
              </div>
            {/each}
          </div>
          {#if scheduleDrift.length>30}
            <p class="hint">{$t('scheduleReconciliation.more',{values:{count:scheduleDrift.length-30}})}</p>
          {/if}
        </section>
      {/if}
      <div class="two-column">
        <section class="card settings">
          <h2>{$t('capacityPlanner.settings')}</h2>
          <p class="hint">{$t('capacityPlanner.settingsHelp')}</p>
          <label>{$t('capacityPlanner.station')}
            <select value={selectedStation} onchange={(e)=>openStation(e.currentTarget.value)}>
              {#each ALL_STATIONS as station}
                <option value={station}>{station}</option>
              {/each}
            </select>
          </label>
          {#if !canConfigure}
            <p class="hint">{$t('capacityPlanner.viewOnly')}</p>
          {/if}
          <label>{$t('capacityPlanner.workers')}
            <input type="number" min="0" max="40" step="1" bind:value={workers}
              oninput={()=>edited=true} disabled={!canConfigure||saving}/>
          </label>
          <label>{$t('capacityPlanner.hours')}
            <input type="number" min="0.25" max="16" step="0.25" bind:value={hours}
              oninput={()=>edited=true} disabled={!canConfigure||saving}/>
          </label>
          <label>{$t('capacityPlanner.efficiency')}
            <input type="number" min="25" max="100" step="1" bind:value={efficiency}
              oninput={()=>edited=true} disabled={!canConfigure||saving}/>
          </label>
          <fieldset disabled={!canConfigure||saving}>
            <legend>{$t('capacityPlanner.workdays')}</legend>
            <div class="weekdays">
              {#each WEEK as day}
                <label class="check">
                  <input type="checkbox" checked={workdays.includes(day)}
                    onchange={()=>toggleDay(day)} />
                  {$t(`capacityPlanner.weekday.${day}`)}
                </label>
              {/each}
            </div>
          </fieldset>
          {#if expectedUpdatedAt===null}
            <p class="hint warn">{$t('capacityPlanner.notConfigured')}</p>
          {:else}
            <p class="hint">{$t('capacityPlanner.effective',{values:{hours:
              dailyStationHours(capacity.find(c=>c.station===selectedStation))??0}})}</p>
          {/if}
          {#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
          {#if saved}<p class="success" role="status">{$t('capacityPlanner.saved')}</p>{/if}
          <div class="save-controls">
            <button type="button" onclick={()=>openStation(selectedStation,true)}
              disabled={saving}>{$t('capacityPlanner.discard')}</button>
            {#if canConfigure}
              <button type="button" onclick={save} disabled={saving||!edited}>
                {saving?$t('capacityPlanner.saving'):$t('capacityPlanner.save')}
              </button>
            {/if}
          </div>
        </section>

        <section class="card forecast">
          <h2>{$t('capacityPlanner.forecast')}</h2>
          <p class="hint">{$t('capacityPlanner.forecastHelp')}</p>
          {#each visibleStations as station}
            {@const result=projection.stations[station]}
            <article class="station">
              <div class="station-head">
                <h3>{station}</h3>
                {#if !result.configured}
                  <span class="warn">{$t('capacityPlanner.notConfigured')}</span>
                {:else}
                  <span>{$t('capacityPlanner.daily',{values:{hours:result.dailyHours??0}})}</span>
                {/if}
              </div>
              <div class="utilization">
                <span>{$t('scheduleReconciliation.daySummary',{values:{
                  booked:result.totalCommittedHours,
                  proposed:result.totalAllocatedHours,
                  capacity:result.totalAvailableHours}})}</span>
                <progress max={Math.max(1,result.totalAvailableHours)}
                  value={result.totalCommittedHours+result.totalAllocatedHours}></progress>
              </div>
              {#each result.days.filter(d=>d.tasks.length>0||d.committedHours>0) as day (day.date)}
                <div class="day">
                  <strong>{day.date}</strong>
                  <span>{$t('scheduleReconciliation.daySummary',{values:{
                    booked:day.committedHours,proposed:day.allocatedHours,
                    capacity:day.capacityHours}})}</span>
                  <div class="day-jobs">
                    {#each day.tasks as task,i (`${task.id}-${i}`)}
                      <a href={`${base}/orders/${encodeURIComponent(task.id)}`}>
                        {task.poNumber??task.id.slice(0,8)} · {task.hours} h
                        {#if task.tentative}<small>{$t('capacityPlanner.tentative')}</small>{/if}
                      </a>
                    {/each}
                  </div>
                </div>
              {/each}
              {#if result.unplanned.length}
                <h4>{$t('capacityPlanner.unplanned')}</h4>
                <ul class="unplanned">
                  {#each result.unplanned as item,i (`${item.id}-${i}`)}
                    <li><a href={`${base}/orders/${encodeURIComponent(item.id)}`}>
                      {item.poNumber??item.id.slice(0,8)}</a>
                      — {$t(`capacityPlanner.reason.${item.reason}`)}
                      {#if item.remainingHours!==null} ({item.remainingHours} h){/if}
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if result.late.length}
                <p class="warn">{$t('capacityPlanner.lateNotice',{values:{count:result.late.length}})}</p>
              {/if}
            </article>
          {/each}
          {#if !visibleStations.length}
            <p>{$t('capacityPlanner.noWork')}</p>
          {/if}
        </section>
      </div>
    {:else}
      <p role="status">{$t('scheduleReconciliation.loading')}</p>
    {/if}
    <ProductionReservationPanel forecast={projection} {startDate}
      horizonDays={horizon} canEdit={canConfigure&&commitmentsReady}
      onChanged={refreshCommitments} />
  {/if}
</main>

<style>
  .planner{max-width:1600px;padding:clamp(1rem,2vw,2rem);margin:0 auto;display:grid;gap:1rem;color:var(--text)}
  .header,.header-actions,.station-head,.save-controls{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .eyebrow{font-size:.75rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
  h1{font-size:clamp(1.5rem,3vw,2rem);margin:.2rem 0}h2{margin:.1rem 0;font-size:1.15rem}h3{margin:0;font-size:1rem}
  h4{font-size:.86rem;margin:.75rem 0 .25rem}.description,.hint,.updated{color:var(--muted);font-size:.85rem}
  .disclaimer{margin:0;padding:.8rem 1rem;border-left:3px solid var(--brand);background:var(--bg-1);font-size:.88rem}
  .link,button{min-height:40px;border:1px solid var(--border);border-radius:8px;padding:.5rem .8rem;
    background:var(--bg-2);color:var(--text);font-weight:600;cursor:pointer;text-decoration:none}
  button:disabled{opacity:.5;cursor:wait}.error{border:1px solid var(--error);color:var(--error);padding:.6rem;border-radius:8px}
  .success{color:var(--brand)}.warn{color:var(--warn)}
  .controls{display:flex;flex-wrap:wrap;align-items:center;gap:1rem;background:var(--bg-1);padding:1rem;border-radius:10px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.7rem}
  .stats>div{padding:.85rem;background:var(--bg-1);border:1px solid var(--border);border-radius:10px;display:grid}
  .stats strong{font-size:1.6rem;font-variant-numeric:tabular-nums}.stats span{color:var(--muted);font-size:.76rem}
  .two-column{display:grid;grid-template-columns:minmax(250px,340px) minmax(0,1fr);gap:1rem;align-items:start}
  .card{padding:1rem;border:1px solid var(--border);border-radius:12px;background:var(--bg-1)}
  .settings{display:grid;gap:.75rem;position:sticky;top:.75rem}
  .settings label:not(.check){display:grid;gap:.3rem}
  select,input[type=number]{width:100%;background:var(--bg-0);color:var(--text);
    border:1px solid var(--border);border-radius:7px;padding:.6rem}
  .check{display:flex;align-items:center;gap:.4rem;font-size:.82rem}
  fieldset{border:1px solid var(--border);border-radius:8px}
  .weekdays{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:.5rem}
  .forecast{display:grid;gap:.7rem}.station{border:1px solid var(--border);border-radius:10px;padding:.8rem;display:grid;gap:.6rem}
  .station-head>span{font-size:.8rem;color:var(--muted)}.utilization{display:grid;gap:.35rem;font-size:.75rem}
  progress{width:100%;height:12px}.day{padding:.5rem;background:var(--bg-2);border-radius:7px;display:flex;flex-wrap:wrap;gap:.5rem}
  .day>span{margin-left:auto;font-size:.8rem}.day-jobs{width:100%;display:flex;flex-wrap:wrap;gap:.4rem}
  .day-jobs a{color:var(--text);font-size:.78rem;background:var(--bg-0);padding:.35rem;border-radius:5px}
  .day-jobs small{margin-left:.4rem;color:var(--warn)}
  .unplanned{margin:0;padding-left:1.2rem;font-size:.8rem;display:grid;gap:.4rem}
  .unplanned a{color:var(--brand)}
  .drift{display:grid;gap:.65rem}.drift-list{display:grid;gap:.35rem}
  .drift-row{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;font-size:.82rem;
    padding:.5rem;border:1px solid var(--border);border-radius:8px}
  .drift-row[data-severity="critical"]{border-color:var(--error)}
  .drift-row small{margin-left:auto;color:var(--muted)}
  .drift-row a{color:var(--brand)}
  @media(max-width:800px){.two-column{grid-template-columns:1fr}.settings{position:static}}
</style>
