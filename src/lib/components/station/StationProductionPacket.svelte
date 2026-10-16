<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from 'svelte-i18n';
  import {base} from '$app/paths';
  import OrderNativeProfileForm from '$lib/order/OrderNativeProfileForm.svelte';
  import {summarizeNativeProfileConfiguration} from '$lib/order/native-profile-context';
  import {fetchOrderFilePage} from '$lib/order/order-files-client';
  import {stageStateLabel} from '$lib/order/operator-ui';

  type Profile={
    configuration?:Record<string,unknown>|null;
    profileTemplateId?:string|null;
    quantity?:number;quantity2?:number;quantity3?:number;quantity4?:number;
    notes?:string|null;
  };
  type FileRow={id:string;originalName?:string;mimeType?:string;size?:number};
  let {orderId,station,stageState,blockedReason=null,stageNotes=null,onClose}:{
    orderId:string;station:string;stageState:string;
    blockedReason?:string|null;stageNotes?:string|null;
    onClose:()=>void;
  }=$props();

  let busy=$state(true);
  let issue=$state('');
  let order=$state<{
    id:string;status:string;poNumber?:string|null;clientName?:string;
    title?:string|null;deadline?:string|null;updatedAt:string;
    profiles:Profile[];
  }|null>(null);
  let files=$state<FileRow[]>([]);
  let fileTotal=$state<number|null>(null);
  let currentStage=$state<{state:string;blocked_reason?:string|null;notes?:string|null}|null>(null);
  let expandedProfile=$state<number|null>(null);
  let requestVersion=0;
  async function refresh(){
    const version=++requestVersion;
    busy=true;issue='';
    try{
      // These are existing authenticated RLS-backed endpoints, never
      // model-created specifications or caller-supplied profile JSON.
      const [orderResponse,filePage,stagesResponse]=await Promise.all([
        fetch(`${base}/api/draft-orders/${encodeURIComponent(orderId)}`,{cache:'no-store'}),
        fetchOrderFilePage<FileRow>(orderId,0,50),
        fetch(`${base}/api/orders/${encodeURIComponent(orderId)}/stages`,{cache:'no-store'})
      ]);
      if(!orderResponse.ok)throw Error($t('productionPacket.loadFailed'));
      const snapshot=await orderResponse.json();
      if(snapshot.id!==orderId ||
         !['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(snapshot.status)||
         !Array.isArray(snapshot.profiles) ||
         typeof snapshot.updatedAt!=='string')
        throw Error($t('productionPacket.loadFailed'));
      if(!stagesResponse.ok)throw Error($t('productionPacket.loadFailed'));
      const stages=await stagesResponse.json();
      const found=Array.isArray(stages)?stages.find(
        (row:{station?:string;draft_order_id?:string;state?:string})=>
          row.station===station && row.draft_order_id===orderId &&
          typeof row.state==='string'
      ):null;
      if(!found)throw Error($t('productionPacket.loadFailed'));
      if(version!==requestVersion)return;
      currentStage={state:found.state,blocked_reason:found.blocked_reason,notes:found.notes};
      order=snapshot;
      files=filePage.files;
      fileTotal=filePage.total;
      expandedProfile=null;
    }catch{
      if(version===requestVersion){
        // Never present an old production profile as current after a failed refresh.
        order=null;files=[];fileTotal=null;currentStage=null;
        issue=$t('productionPacket.loadFailed');
      }
    }finally{if(version===requestVersion)busy=false;}
  }
  onMount(()=>{void refresh();return ()=>{requestVersion++;};});
  const fileSize=(bytes?:number)=>typeof bytes==='number'
    ?(bytes/1024/1024).toFixed(2)+' MiB':'—';
</script>

<section class="packet" aria-label={$t('productionPacket.title')}>
  <header class="packet-heading">
    <div>
      <h2>{$t('productionPacket.title')} · {station}</h2>
      <p>{$t('productionPacket.originalOnly')}</p>
    </div>
    <button type="button" onclick={onClose} aria-label={$t('productionPacket.close')}>
      ×
    </button>
  </header>
  {#if currentStage && !busy && !issue}
    <div class="packet-status">
      <strong>{stageStateLabel(currentStage.state)}</strong>
      {#if currentStage.state==='BLOCKED' || currentStage.state==='REWORK'}
        <p role="alert">{$t('productionPacket.held')}</p>
      {/if}
      {#if currentStage.blocked_reason &&
        (currentStage.state==='BLOCKED' || currentStage.state==='REWORK')}
        <p class="reason">{$t('productionPacket.blockReason')}: {currentStage.blocked_reason}</p>
      {/if}
      {#if currentStage.notes}
        <p class="reason">{$t('productionPacket.stationNotes')}: {currentStage.notes}</p>
      {/if}
    </div>
  {/if}
  <button class="refresh" type="button" disabled={busy} onclick={refresh}>
    {$t('productionPacket.refresh')}
  </button>
  {#if busy}
    <p role="status">{$t('productionPacket.loading')}</p>
  {:else if issue}
    <p role="alert" class="alert">{issue}</p>
  {:else if order}
    <p class="order-meta">
      <strong>{order.poNumber??order.title??order.id}</strong>
      · {order.clientName??'—'}
      · {$t('productionPacket.deadline')}: {order.deadline??'—'}
    </p>
    <h3>{$t('productionPacket.profiles')} ({order.profiles.length})</h3>
    {#if !order.profiles.length}
      <p class="alert" role="alert">{$t('productionPacket.noProfiles')}</p>
    {:else}
      {#each order.profiles as profile,i (i)}
        {@const summary=summarizeNativeProfileConfiguration(profile.configuration)}
        <article class="profile">
          <h4>
            {$t('productionPacket.profileNumber',{values:{number:i+1}})}
            · {summary.profileName??summary.signType??$t('productionPacket.unnamedProfile')}
          </h4>
          <p class="quantities">{$t('productionPacket.quantities')}:
            {[profile.quantity??1,profile.quantity2??0,
              profile.quantity3??0,profile.quantity4??0].join(' / ')}
          </p>
          {#if profile.notes}<p class="notes">{profile.notes}</p>{/if}
          {#if Object.keys(summary.sections).length}
            <div class="profile-sections">
              {#each Object.entries(summary.sections) as [section,values] (section)}
                <div class="profile-section">
                  <strong>{section.replaceAll('_',' ')}</strong>
                  {#each Object.entries(values??{}) as [key,value] (key)}
                    <p><span>{key}</span>: {String(value)}</p>
                  {/each}
                </div>
              {/each}
            </div>
          {:else}
            <p class="muted">{$t('productionPacket.noSelections')}</p>
          {/if}
          <button type="button" class="refresh" onclick={()=>expandedProfile=expandedProfile===i?null:i}>
            {expandedProfile===i?$t('productionPacket.hideOriginal'):$t('productionPacket.viewOriginal')}
          </button>
          {#if expandedProfile===i}
            <div class="original-form">
              {#key i}
                <OrderNativeProfileForm configuration={profile.configuration??{}}
                  editable={false} onChange={()=>{}}/>
              {/key}
            </div>
          {/if}
        </article>
      {/each}
    {/if}
    <h3>{$t('productionPacket.drawings')} ({fileTotal??'—'})</h3>
    {#if fileTotal===0}
      <p class="alert" role="alert">{$t('productionPacket.noFiles')}</p>
    {:else}
      <ul class="files">
        {#each files as file (file.id)}
          <li>
            <a href={`${base}/api/files/${encodeURIComponent(file.id)}?download=true`}
               target="_blank" rel="noopener noreferrer">
              {file.originalName??file.id}
            </a>
            <small>{fileSize(file.size)}</small>
          </li>
        {/each}
      </ul>
      {#if fileTotal!==null && fileTotal>files.length}
        <p class="muted">{$t('productionPacket.moreFiles',{values:{shown:files.length,total:fileTotal}})}</p>
      {/if}
    {/if}
    <a class="order-link" href={`${base}/orders/${encodeURIComponent(orderId)}`}>
      {$t('productionPacket.fullOrder')}
    </a>
  {/if}
</section>

<style>
  .packet{display:grid;gap:.8rem;max-height:min(90vh,1000px);overflow:auto;
    padding:1rem;color:var(--text);background:var(--bg-1);min-width:min(620px,85vw)}
  .packet-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
  .packet-heading h2{margin:0;font-size:1.1rem}
  .packet-heading p,.muted{color:var(--muted);font-size:.81rem;margin:.3rem 0}
  .packet-heading button{min-width:44px;min-height:44px}
  .packet h3{margin:.7rem 0 0;font-size:1rem}
  .packet h4{margin:0;font-size:.92rem}
  .packet-status,.profile{border:1px solid var(--border);border-radius:10px;padding:.75rem;
    overflow-wrap:anywhere}
  .packet-status{background:var(--bg-2)}
  .packet-status p{margin:.3rem 0}
  .reason,.alert{color:var(--error)}
  .order-meta,.quantities,.notes{font-size:.84rem;overflow-wrap:anywhere}
  .quantities,.notes{margin:.4rem 0}
  .profile-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));
    gap:.55rem;margin:.6rem 0}
  .profile-section{border:1px solid var(--border);padding:.6rem;border-radius:8px}
  .profile-section strong{font-size:.79rem}
  .profile-section p{font-size:.78rem;margin:.25rem 0;overflow-wrap:anywhere}
  .profile-section span{color:var(--muted)}
  button,.order-link{cursor:pointer;border:1px solid var(--border);
    border-radius:8px;padding:.55rem .75rem;background:var(--bg-2);color:var(--text);
    width:fit-content;min-height:38px;text-decoration:none}
  button:disabled{opacity:.5;cursor:default}
  .original-form{max-width:100%;overflow:auto}
  .files{display:grid;gap:.4rem;margin:0;padding-left:1.2rem}
  .files li{display:flex;justify-content:space-between;gap:.8rem;
    flex-wrap:wrap;font-size:.84rem;overflow-wrap:anywhere}
  .files a{color:var(--brand);min-width:0}
  .files small{color:var(--muted)}
  @media(max-width:640px){.packet{min-width:0;width:100%;padding:.65rem}
    .profile-sections{grid-template-columns:minmax(0,1fr)}}
</style>
