<script lang="ts">
  import {t} from 'svelte-i18n';
  import {base} from '$app/paths';
  import {ALL_STATIONS} from '$lib/order/workflow';
  import type {ForecastResult,ForecastSlice} from '$lib/order/capacity-forecast';
  import type {ProductionReservation} from '$lib/order/production-reservation';

  let {forecast,startDate,horizonDays,canEdit}:{
    forecast:ForecastResult|null;startDate:string;
    horizonDays:7|14|28;canEdit:boolean
  }=$props();
  let bookings=$state<ProductionReservation[]>([]);
  let total=$state(0);
  let loading=$state(false);
  let busy=$state('');
  let listError=$state('');
  let mutationError=$state('');
  let success=$state('');
  let showCandidates=$state(16);
  let showBookings=$state(30);
  let requestVersion=0;

  function endDate(start:string,days:number) {
    const [y,m,d]=start.split('-').map(Number);
    return new Date(Date.UTC(y,m-1,d)+(days-1)*86400000).toISOString().slice(0,10);
  }
  async function loadReservations(from:string,to:string) {
    const version=++requestVersion;
    loading=true;listError='';
    try{
      const items:ProductionReservation[]=[];
      let offset=0,expectedTotal:number|null=null;
      do{
        const query=new URLSearchParams({from,to,offset:String(offset)});
        const response=await fetch(`${base}/api/production/reservations?${query.toString()}`,{cache:'no-store'});
        if(!response.ok)throw new Error($t('productionReservations.loadFailed'));
        const result=await response.json();
        if(!Array.isArray(result.items)||!Number.isInteger(result.total))
          throw new Error($t('productionReservations.loadFailed'));
        if(expectedTotal!==null&&result.total!==expectedTotal)
          throw new Error($t('productionReservations.changedDuringLoad'));
        expectedTotal=result.total;
        if(expectedTotal>5000 || (result.items.length===0&&offset<expectedTotal))
          throw new Error($t('productionReservations.tooMany'));
        items.push(...result.items);offset+=result.items.length;
      }while(offset<(expectedTotal??0));
      if(version!==requestVersion)return;
      if(new Set(items.map(x=>x.id)).size!==items.length)
        throw new Error($t('productionReservations.changedDuringLoad'));
      bookings=items;total=expectedTotal??0;
    }catch(e){
      if(version===requestVersion)listError=e instanceof Error?e.message:$t('productionReservations.loadFailed');
    }finally{if(version===requestVersion)loading=false;}
  }
  $effect(()=>{
    const from=startDate, to=endDate(startDate,horizonDays);
    bookings=[];total=0;
    void loadReservations(from,to);
  });
  let activeKeys=$derived(new Set(bookings
    .filter(b=>b.status!=='CANCELLED')
    .map(b=>`${b.draft_order_id}:${b.station}:${b.work_date}`)));
  let suggestions=$derived.by(()=>{
    if(!forecast)return [] as Array<ForecastSlice&{station:string}>;
    const result:Array<ForecastSlice&{station:string}>=[];
    for(const station of ALL_STATIONS)
      for(const day of forecast.stations[station]?.days??[])
        for(const task of day.tasks) result.push({...task,station});
    return result;
  });
  let approvedHours=$derived.by(()=>{
    const map=new Map<string,number>();
    for(const item of bookings.filter(b=>b.status==='APPROVED')){
      const key=`${item.station}:${item.work_date}`;
      map.set(key,Math.round(((map.get(key)??0)+Number(item.hours))*100)/100);
    }
    return map;
  });
  async function mutate(input:Record<string,unknown>,id:string){
    if(!canEdit||busy)return;
    mutationError='';success='';busy=id;
    try{
      const response=await fetch(`${base}/api/production/reservations`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)
      });
      const outcome=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(
        response.status===409?$t('productionReservations.conflict')
        :response.status===403?$t('productionReservations.forbidden')
        :outcome.message??outcome.error??$t('productionReservations.saveFailed')
      );
      if(!outcome?.reservation)throw new Error($t('productionReservations.saveFailed'));
      success=$t('productionReservations.saved');
      await loadReservations(startDate,endDate(startDate,horizonDays));
    }catch(e){mutationError=e instanceof Error?e.message:$t('productionReservations.saveFailed');}
    finally{busy='';}
  }
  function propose(item:ForecastSlice&{station:string}){
    if(!confirm($t('productionReservations.confirmPropose')))return;
    void mutate({
      action:'propose',orderId:item.id,station:item.station,
      workDate:item.date,hours:item.hours,note:''
    },`propose-${item.id}-${item.station}-${item.date}`);
  }
  function act(item:ProductionReservation,action:'approve'|'cancel'){
    if(!confirm($t(action==='approve'
      ?'productionReservations.confirmApprove':'productionReservations.confirmCancel')))return;
    void mutate({
      action,reservationId:item.id,expectedUpdatedAt:item.updated_at
    },`${action}-${item.id}`);
  }
</script>

<section class="reservations">
  <div class="head">
    <div>
      <h2>{$t('productionReservations.title')}</h2>
      <p class="hint">{$t('productionReservations.intro')}</p>
    </div>
    <button type="button" onclick={()=>loadReservations(startDate,endDate(startDate,horizonDays))}
      disabled={loading||!!busy}>{$t('productionReservations.refresh')}</button>
  </div>
  <p class="warning" role="note">{$t('productionReservations.forecastWarning')}</p>
  {#if !canEdit}<p class="hint">{$t('productionReservations.viewOnly')}</p>{/if}
  {#if loading}<p role="status">{$t('productionReservations.loading')}</p>{/if}
  {#if listError}<p role="alert" class="error">{listError}</p>{/if}
  {#if mutationError}<p role="alert" class="error">{mutationError}</p>{/if}
  {#if success}<p role="status" class="success">{success}</p>{/if}

  <div class="subhead">
    <h3>{$t('productionReservations.ledger')} ({total})</h3>
    <span class="hint">{$t('productionReservations.stateHelp')}</span>
  </div>
  <div class="records">
    {#each bookings.slice(0,showBookings) as record (record.id)}
      <article class="booking" data-status={record.status}>
        <div class="booking-details">
          <strong>{record.station} · {record.work_date}</strong>
          <span>{record.hours} h</span>
          <a href={`${base}/orders/${encodeURIComponent(record.draft_order_id)}`}>
            {record.draft_order_id.slice(0,8)}
          </a>
          <span class="state">{$t(`productionReservations.status.${record.status}`)}</span>
        </div>
        {#if record.note}<p>{record.note}</p>{/if}
        {#if canEdit&&record.status==='PROPOSED'}
          <button type="button" disabled={!!busy||loading}
            onclick={()=>act(record,'approve')}>
            {$t('productionReservations.approve')}
          </button>
        {/if}
        {#if canEdit&&record.status!=='CANCELLED'}
          <button type="button" disabled={!!busy||loading}
            onclick={()=>act(record,'cancel')}>
            {$t('productionReservations.cancel')}
          </button>
        {/if}
      </article>
    {:else}
      <p class="hint">{$t('productionReservations.emptyLedger')}</p>
    {/each}
    {#if bookings.length>showBookings}
      <button class="more" type="button" onclick={()=>showBookings+=50}>
        {$t('productionReservations.showMore')}
      </button>
    {/if}
  </div>
  <div class="subhead">
    <h3>{$t('productionReservations.candidates')}</h3>
    <span class="hint">{$t('productionReservations.forecastCandidates')}</span>
  </div>
  <div class="candidates">
    {#each suggestions.slice(0,showCandidates) as item,i (`${item.station}-${item.id}-${item.date}-${i}`)}
      <article class="candidate">
        <a href={`${base}/orders/${encodeURIComponent(item.id)}`}>
          {item.poNumber??item.id.slice(0,8)}
        </a>
        <span>{item.station}</span>
        <time datetime={item.date}>{item.date}</time>
        <strong>{item.hours} h</strong>
        {#if approvedHours.has(`${item.station}:${item.date}`)}
          <span class="hint">{$t('productionReservations.alreadyBooked',{
            values:{hours:approvedHours.get(`${item.station}:${item.date}`)??0}})}</span>
        {/if}
        {#if item.tentative}<span class="hint">{$t('productionReservations.tentative')}</span>{/if}
        {#if canEdit}
          <button type="button" disabled={!!busy||loading||activeKeys.has(`${item.id}:${item.station}:${item.date}`)}
            onclick={()=>propose(item)}>
            {activeKeys.has(`${item.id}:${item.station}:${item.date}`)
              ?$t('productionReservations.exists'):$t('productionReservations.propose')}
          </button>
        {/if}
      </article>
    {:else}
      <p class="hint">{$t('productionReservations.noCandidates')}</p>
    {/each}
    {#if suggestions.length>showCandidates}
      <button class="more" type="button" onclick={()=>showCandidates+=25}>
        {$t('productionReservations.showMore')}
      </button>
    {/if}
  </div>
</section>
<style>
 .reservations{border:1px solid var(--border);background:var(--bg-1);border-radius:12px;padding:1rem;
   display:grid;gap:.8rem;min-width:0}
 .head,.subhead,.booking,.candidate{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between}
 .head h2,.subhead h3{margin:0}.hint{color:var(--muted);font-size:.8rem;margin:0}
 .warning{border-left:3px solid var(--warn);padding:.6rem;background:var(--bg-2);
   font-size:.83rem;margin:0}
 .records,.candidates{display:grid;gap:.45rem}
 .booking,.candidate{padding:.65rem .8rem;border:1px solid var(--border);border-radius:8px}
 .booking[data-status="APPROVED"]{border-color:var(--brand)}
 .booking-details{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem;flex:1}
 .booking p{width:100%;font-size:.78rem;color:var(--muted);margin:0}
 .state{font-size:.75rem;color:var(--muted);font-weight:700}
 a{color:var(--text)}button{border:1px solid var(--border);background:var(--bg-2);border-radius:7px;
   color:var(--text);padding:.45rem .65rem;cursor:pointer;min-height:36px;font-weight:600}
 button:disabled{opacity:.55;cursor:not-allowed}
 .error{color:var(--error)}.success{color:var(--brand)}.more{justify-self:start}
 @media(max-width:650px){.booking,.candidate{align-items:flex-start;justify-content:flex-start}}
</style>