<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { base } from '$app/paths';
  import { t } from 'svelte-i18n';
  import { proposalsToPatch, proposalMatchesCurrent, type IntakeProposal, type IntakeResponse } from './intake-contract';
  import {fetchAllOrderFiles,watchOrderFilesChanged,announceOrderFilesChanged} from './order-files-client';
  import MaterialSelect from '$lib/profiles/components/fields/MaterialSelect.svelte';
  import {applyProductionFacts, appendOrderProductionFacts, isOrderProductionFact, recheckProductionSelection, productionCurrentValue, getProductionMaterialPicker, getProductionSelectionConflicts, resolveManualProductionMaterial, ProductionIntakeError, type IntakeMaterial, type ProductionReview} from './production-intake';

  type Analysis = IntakeResponse & { orderUpdatedAt:string|null; engine:string|null;profileIndex?:number|null;profileId?:string|null;production?:ProductionReview[];orderConflicts?:Array<{field:string;alternatives:IntakeProposal[]}> };
  type OrderFile = {id:string; originalName?:string; file_name?:string;
    mimeType?:string; mime_type?:string; size?:number};
  let {orderId='',editable,current,showHeading=true,selectedFileId='',selectedProfileIndex=null,
    profileNames=[],dirty=false,orderUpdatedAt=null,localFiles=[],onAddFiles,onApply}:{
    orderId?:string; showHeading?:boolean; editable:boolean; current:Record<string,unknown>;
    selectedFileId?:string; selectedProfileIndex?:number|null;
    profileNames?:string[]; dirty?:boolean; orderUpdatedAt?:string|null;
    localFiles?:Array<{id:string;file:File}>;
    onAddFiles?:(files:File[])=>Promise<Array<{id:string;file:File}>>;
    onApply:(patch:Record<string,unknown>)=>void;
  }=$props();

  const requestController = new AbortController();
  let disposed = false;
  const requestSignal = (timeout = 120_000) => AbortSignal.any([
    requestController.signal, AbortSignal.timeout(timeout)
  ]);
  const scopedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init, signal: requestSignal(20_000)
  });
  onDestroy(() => {
    disposed = true;
    filesLoadVersion++;
    requestController.abort();
    analysisController?.abort();
  });
  let files=$state<OrderFile[]>([]);
  let filesLoadVersion=0;
  let fileId=$state('');
  let profileChoice=$state('');
  let pdfMode=$state<'visual'|'text'|'native'|'ocr'>('visual');
  let uploading=$state(false);
  let sourceUploadInput:HTMLInputElement|undefined=$state();
  let uploadInput:HTMLInputElement|undefined=$state();
  let capabilities=$state({nativePdf:false,paidOcr:false});
  let capabilitiesProblem=$state(false);
  let analysisController:AbortController|null=null;
  let notice=$state('');
  let reviewHeading:HTMLHeadingElement|undefined=$state();
  const sectionId=$props.id();
  let reviewFilter=$state<'all'|'attention'|'selected'>('all');
  let manualSelections=$state<Record<number,ProductionReview>>({});
  let editingMaterial=$state<number|null>(null);
  let replacementApproved=$state(false);
  let productionApprovals=$state<Record<number,boolean>>({});
  let loading=$state(false);
  let analyzing=$state(false);
  let applying=$state(false);
  let problem=$state('');
  let analysis=$state<Analysis|null>(null);
  let approvals=$state<Record<number,boolean>>({});
  let baseState=$state('');
  let applied=$state(false);
  $effect(()=>{if(selectedFileId)fileId=selectedFileId;});
  $effect(()=>{
    profileChoice=selectedProfileIndex!==null && selectedProfileIndex>=0
      ? String(selectedProfileIndex) : '';
  });
  $effect(()=>{
    if(!orderId){
      const available=localFiles.filter(f=>['application/pdf','image/jpeg','image/png','image/webp'].includes(f.file.type))
        .map(f=>({id:f.id,originalName:f.file.name,mimeType:f.file.type,size:f.file.size}));
      files=available;
      if(!available.some(f=>f.id===fileId))fileId=available[0]?.id??'';
    }
  });
  let profileIndex=$derived(profileChoice===''?null:Number(profileChoice));
  let isPdf=$derived((files.find(f=>f.id===fileId)?.mimeType??files.find(f=>f.id===fileId)?.mime_type)==='application/pdf');
  function isUnchanged(p:IntakeProposal){
    return proposalMatchesCurrent(p,current);
  }
  let analysisStale=$derived(!!analysis && (
    (!!orderId && (dirty || !orderUpdatedAt || analysis.orderUpdatedAt!==orderUpdatedAt)) ||
    JSON.stringify(current)!==baseState
  ));
  let production=$derived((analysis?.production??[]).map((p,i)=>manualSelections[i]??p));
  let attentionCount=$derived((analysis?.proposals.filter(p=>p.confidence!=='high').length??0)+production.filter(p=>p.status!=='ready'||p.confidence!=='high'||p.reason==='manual-selection').length+(analysis?.orderConflicts?.length??0));
  let choiceCount=$derived((analysis?.proposals.length??0)+production.length+(analysis?.orderConflicts?.length??0));
  let acceptedCount=$derived((analysis?.proposals.filter((p,i)=>
    approvals[i]===true && !isUnchanged(p)).length??0)+
    production.filter((p,i)=>productionApprovals[i]===true&&p.status==='ready').length);
  let selectionConflicts=$derived(getProductionSelectionConflicts(production.filter((p,i)=>productionApprovals[i]===true)));
  let sourceMatches=$derived(!analysis || (
    (analysis.fileId??'')===fileId &&
    (analysis.profileIndex??null)===profileIndex
  ));
  onMount(()=>{
    if(orderId)void loadFiles();
    void loadCapabilities();
    return watchOrderFilesChanged(changedId=>{if(changedId===orderId&&!uploading)void loadFiles();});
  });

  async function loadCapabilities(){
    capabilitiesProblem=false;
    try{
      const response=await scopedFetch('/api/ai/order-intake',{cache:'no-store'});
      const body=await response.json();
      if(!response.ok||typeof body.nativePdf!=='boolean'||typeof body.paidOcr!=='boolean')throw new Error();
      if(!disposed)capabilities=body;
    }catch{if(!disposed)capabilitiesProblem=true;}
  }
  function approve(index:number,checked:boolean,kind:'order'|'production'){
    if(kind==='order')approvals={...approvals,[index]:checked};
    else productionApprovals={...productionApprovals,[index]:checked};
    replacementApproved=false;problem='';
  }
  function clearApprovals(){approvals={};productionApprovals={};replacementApproved=false;}
  function visible(confidence:string,selected:boolean,unresolved=false){
    return reviewFilter==='selected'?selected:reviewFilter==='attention'?unresolved||confidence!=='high':true;
  }
  async function chooseMaterial(index:number,material:IntakeMaterial|null){
    if(!analysis)return;
    if(!material){resetMaterial(index);return;}
    try{
      manualSelections={...manualSelections,[index]:resolveManualProductionMaterial(analysis.production![index],[material],material.id)};
      approve(index,false,'production');editingMaterial=null;
      await tick();document.getElementById(`${sectionId}-production-${index}`)?.focus();
    }catch{problem=$t('orderIntake.catalogChanged');}
  }
  function resetMaterial(index:number){
    const next={...manualSelections};delete next[index];manualSelections=next;approve(index,false,'production');editingMaterial=null;
  }
  function cancelAnalysis(){analysisController?.abort();notice=$t('orderIntake.cancelled');}
  async function uploadSource(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];input.value='';
    if(!file||!editable||uploading||analyzing||applying)return;
    const mime=file.type||({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[file.name.split('.').pop()?.toLowerCase()??''];
    if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime)){
      problem=$t('orderIntake.uploadFormat');return;
    }
    if(!file.size||file.size>(mime==='application/pdf'?12:8)*1024*1024){
      problem=$t('orderIntake.uploadSize');return;
    }
    const id=orderId;
    uploading=true;problem='';notice='';
    try{
      const form=new FormData();form.append('file',file);form.append('order_id',id);
      const response=await fetch('/api/files',{method:'POST',body:form,signal:requestSignal()});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||body.error||$t('orderIntake.uploadError'));
      if(typeof body.id!=='string'||!body.id)throw new Error($t('orderIntake.uploadError'));
      announceOrderFilesChanged(id);
      if(disposed||id!==orderId||!editable)return;
      analysis=null;clearApprovals();manualSelections={};editingMaterial=null;applied=false;
      await loadFiles();
      if(disposed||id!==orderId||!editable)return;
      if(!files.some(f=>f.id===body.id))throw new Error($t('orderIntake.filesError'));
      fileId=body.id;
      notice=$t('orderIntake.uploaded');
    }catch(err){if(!disposed&&id===orderId)
      problem=err instanceof Error?err.message:$t('orderIntake.uploadError');}
    finally{if(!disposed&&id===orderId)uploading=false;}
  }
  async function loadFiles(){
    if(!orderId)return;
    const id=orderId,version=++filesLoadVersion;
    loading=true;problem='';
    try{
      const data=await fetchAllOrderFiles<OrderFile>(id, scopedFetch);
      if(disposed||id!==orderId||version!==filesLoadVersion)return;
      files=data.filter(f=>['application/pdf','image/jpeg','image/png','image/webp']
        .includes(f.mimeType??f.mime_type??''));
      if(fileId && !files.some(f=>f.id===fileId)){
        fileId=files[0]?.id??'';
        analysis=null;approvals={};applied=false;
      }else if(!fileId && files.length)fileId=files[0].id;
    }catch(err){if(!disposed&&id===orderId && version===filesLoadVersion)
      problem=err instanceof Error?err.message:$t('orderIntake.filesError');}
    finally{if(!disposed&&id===orderId && version===filesLoadVersion)loading=false;}
  }
  async function uploadAndAnalyze(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const picked=Array.from(input.files??[]);input.value='';
    if(!picked.length||!editable||uploading||analyzing||applying)return;
    const capturedOrder=orderId;
    uploading=true;problem='';
    try{
      for(const file of picked){
        if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||
          file.size<1||file.size>(file.type==='application/pdf'?12:8)*1024*1024)
          throw new Error($t('orderIntake.uploadLimits'));
      }
      if(!orderId){
        const added=await onAddFiles?.(picked);
        if(disposed||orderId!==capturedOrder)return;
        fileId=added?.[0]?.id??'';
        await tick();
      }else{
        let first='';
        for(const file of picked){
          const body=new FormData();body.set('file',file);body.set('order_id',capturedOrder);body.set('file_type','sketch');
          const response=await fetch(`${base}/api/files/upload`,{method:'POST',body,signal:requestSignal()});
          const result=await response.json().catch(()=>({}));
          if(!response.ok||!result.file?.id)throw new Error(result.message||result.error||$t('orderIntake.uploadError'));
          first ||= result.file.id;
          announceOrderFilesChanged(capturedOrder);
        }
        if(disposed||orderId!==capturedOrder)return;
        await loadFiles();fileId=first;
      }
      uploading=false;
      if(!disposed&&orderId===capturedOrder)await analyze();
    }catch(err){if(!disposed)problem=err instanceof Error?err.message:$t('orderIntake.uploadError');}
    finally{if(!disposed)uploading=false;}
  }
  async function analyze(){
    if(!editable||uploading||analyzing||applying)return;
    if(orderId&&(dirty||!orderUpdatedAt)){problem=$t('orderIntake.saveFirst');return;}
    if(!fileId && !String(current.notes??'').trim()){
      problem=$t('orderIntake.noSource');return;
    }
    const ocr=pdfMode==='ocr' && !!fileId && isPdf;
    if(isPdf&&((ocr&&!capabilities.paidOcr)||(pdfMode==='native'&&!capabilities.nativePdf))){problem=$t('orderIntake.modeUnavailable');return;}
    if(ocr && !confirm($t('orderIntake.confirmPaidOcr')))return;
    problem='';notice='';analysis=null;clearApprovals();manualSelections={};editingMaterial=null;reviewFilter='all';applied=false;
    analyzing=true;
    const capturedOrderId=orderId;
    const capturedProfileIndex=profileIndex;
    const capturedFileId=fileId;
    const capturedVersion=orderUpdatedAt;
    baseState=JSON.stringify(current);
    analysisController=new AbortController();
    const activeController=analysisController;
    try{
      let requestBody:FormData|string;
      if(!orderId){
        const source=localFiles.find(f=>f.id===capturedFileId);
        if(!source)throw new Error($t('orderIntake.noSource'));
        requestBody=new FormData();requestBody.set('file',source.file);
        requestBody.set('metadata',JSON.stringify({sourceId:source.id,profileIndex:capturedProfileIndex,
          notes:String(current.notes??'').slice(0,5000),language:$t('orderIntake.locale')}));
      }else requestBody=JSON.stringify({orderId:capturedOrderId,
          fileId:capturedFileId||null,profileIndex:capturedProfileIndex,
          expectedUpdatedAt:capturedVersion,ocr:!!ocr,nativePdf:pdfMode==='native'&&isPdf&&!ocr,
          visualPdf:pdfMode==='visual'&&isPdf,language:$t('orderIntake.locale')});
      const res=await fetch(`${base}/api/ai/order-intake`,{
        method:'POST',...(typeof requestBody==='string'?{headers:{'Content-Type':'application/json'}}:{}),
        signal:AbortSignal.any([requestSignal(),activeController.signal]),body:requestBody
      });
      const body=await res.json().catch(()=>({}));
      if(disposed||orderId!==capturedOrderId||activeController.signal.aborted)return;
      if(!res.ok)throw new Error(body.message||body.error||$t('orderIntake.analyzeError'));
      // A changed selection never silently binds provider output to a new file/profile.
      if(body.fileId!==(capturedFileId||null)||
         (body.profileIndex??null)!==capturedProfileIndex||
         body.orderUpdatedAt!==capturedVersion)
        throw new Error($t('orderIntake.changedOnServer'));
      analysis=body as Analysis;
      // No checkboxes are accepted by default. Every field is a deliberate
      // staff decision, including low-confidence suggestions.
      approvals={};
      await tick();
      if(!disposed&&orderId===capturedOrderId&&sourceMatches)reviewHeading?.focus();
    }catch(err){if(!disposed&&orderId===capturedOrderId){
      if(activeController.signal.aborted)notice=$t('orderIntake.cancelled');
      else problem=err instanceof Error?err.message:$t('orderIntake.analyzeError');
    }
    }finally{if(!disposed&&orderId===capturedOrderId)analyzing=false;}
  }
  async function apply(){
    if(!analysis||!editable||uploading||applying||applied)return;
    if(!sourceMatches){
      problem=$t('orderIntake.sourceChanged');return;
    }
    if(analysisStale){
      problem=$t('orderIntake.changedLocally');return;
    }
    const accepted=analysis.proposals.filter((p:IntakeProposal,i:number)=>approvals[i]&&!isUnchanged(p));
    const selectedProduction=production.filter((p,i)=>productionApprovals[i]&&p.status==='ready');
    if(!accepted.length&&!selectedProduction.length){problem=$t('orderIntake.selectOne');return;}
    if(JSON.stringify(current)!==baseState){
      problem=$t('orderIntake.changedLocally');return;
    }
    if(!replacementApproved&&accepted.some(p=>current[p.field]!==null&&current[p.field]!==undefined&&current[p.field]!=='')){
      problem=$t('orderIntake.replaceRequired');return;
    }
    const replace=replacementApproved;
    applying=true;problem='';
    try{
      // A parallel reviewer could have modified/confirmed the draft while the
      // model was working. Do not silently apply against a stale saved order.
      let fresh:{updatedAt?:string;status?:string;profiles?:Array<{dbId?:string}>}={};
      if(orderId){
      const res=await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}`,
        {cache:'no-store',signal:requestSignal(20_000)});
      if(!res.ok)throw new Error($t('orderIntake.changedOnServer'));
      fresh=await res.json();
      if(disposed)return;
      if(fresh.updatedAt!==analysis.orderUpdatedAt ||
         !['DRAFT','draft','PENDING_REVIEW'].includes(fresh.status))
        throw new Error($t('orderIntake.changedOnServer'));
      // File links can be removed without bumping draft_orders.updated_at.
      // Recheck the canonical linked-file list before approving old evidence.
      if(analysis.fileId){
        const linkedNow=await fetchAllOrderFiles<OrderFile>(orderId, scopedFetch);
        if(!linkedNow.some(file=>file.id===analysis?.fileId))
          throw new Error($t('orderIntake.sourceChanged'));
      }
      }
      if(disposed)return;
      const profileFacts=selectedProduction.filter(p=>!isOrderProductionFact(p));
      const orderFacts=selectedProduction.filter(isOrderProductionFact);
      let nextProfiles:Record<string,unknown>[]|null=null;
      if(profileFacts.length){
        const index=analysis.profileIndex;
        if(index===null||index===undefined||(orderId&&(!analysis.profileId||fresh.profiles?.[index]?.dbId!==analysis.profileId)))
          throw new Error($t('orderIntake.chooseSavedProfile'));
        const catalogResponse=await scopedFetch('/api/materials?intake=true',{cache:'no-store'});
        if(!catalogResponse.ok)throw new Error($t('orderIntake.catalogChanged'));
        const catalog=await catalogResponse.json();
        const rechecked=recheckProductionSelection(profileFacts,catalog);
        const baseline=JSON.parse(baseState).profiles??[];
        nextProfiles=applyProductionFacts((current.profiles??[]) as Record<string,unknown>[],baseline,index,rechecked,replace,catalog);
      }
      if(disposed)return;
      if(!sourceMatches || analysisStale)throw new Error($t('orderIntake.changedLocally'));
      if(nextProfiles||orderFacts.length){
        const patch:Record<string,unknown>=proposalsToPatch(accepted);
        if(nextProfiles)patch.profiles=nextProfiles;
        if(orderFacts.length)patch.notes=appendOrderProductionFacts(String(patch.notes??current.notes??''),orderFacts);
        onApply(patch);
      }else onApply(proposalsToPatch(accepted));
      applied=true;
    }catch(err){if(!disposed)problem=err instanceof ProductionIntakeError?$t('orderIntake.'+err.code):err instanceof Error?err.message:$t('orderIntake.applyError');}
    finally{if(!disposed)applying=false;}
  }
</script>

<section class="intake" aria-label={$t('orderIntake.title')} aria-busy={uploading||analyzing||applying}>
  <header>{#if showHeading}<h3>{$t('orderIntake.title')}</h3>{/if}<p class="hint">{$t('orderIntake.description')}</p></header>
  <div class="upload-entry">
    <input bind:this={uploadInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden onchange={uploadAndAnalyze}/>
    <button type="button" class="primary" onclick={()=>uploadInput?.click()} disabled={!editable||uploading||analyzing||applying||(!!orderId&&(dirty||!orderUpdatedAt))}>
      {$t(uploading?'orderIntake.uploading':'orderIntake.uploadAndAnalyze')}</button>
    <p class="hint">{$t(orderId?'orderIntake.uploadSavedHint':'orderIntake.uploadNewHint')}</p>
  </div>
  {#if orderId&&dirty}<p class="warning" role="status">{$t('orderIntake.saveFirst')}</p>{/if}
  <div class="source-setup">
    {#if orderId}
    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" bind:this={sourceUploadInput} onchange={uploadSource} disabled={!editable||uploading||analyzing||applying} hidden />
    <button type="button" onclick={()=>sourceUploadInput?.click()} disabled={!editable||loading||uploading||analyzing||applying}>{$t(uploading?'orderIntake.uploading':'orderIntake.upload')}</button>
    <p class="hint">{$t('orderIntake.existingKeyHint')}</p>
    {/if}
    <div class="section-heading"><h4>{$t('orderIntake.prepareSource')}</h4>
      {#if orderId}<button type="button" class="text-button" onclick={loadFiles} disabled={loading||uploading||analyzing||applying}>
        {$t(loading?'orderIntake.loading':'orderIntake.refresh')}</button>{/if}</div>
    <label for={`${sectionId}-source`}>{$t('orderIntake.source')}</label><select id={`${sectionId}-source`} bind:value={fileId} disabled={!editable||loading||uploading||analyzing||applying}>
      <option value="">{$t(orderId?'orderIntake.notesOnly':'orderIntake.chooseSource')}</option>
      {#each files as f (f.id)}<option value={f.id}>{f.originalName||f.file_name||f.id}</option>{/each}
    </select>
    {#if !loading&&!files.length}<p class="hint">{$t('orderIntake.noAttachments')}</p>{/if}
    <label for={`${sectionId}-profile`}>{$t('orderIntake.profileFocus')}</label><select id={`${sectionId}-profile`} bind:value={profileChoice} disabled={!editable||uploading||analyzing||applying}>
      <option value="">{$t('orderIntake.wholeOrder')}</option>
      {#each profileNames as name,i (i)}<option value={String(i)}>{i+1}. {name||$t('orderIntake.unnamedProfile')}</option>{/each}
    </select>
    <p class="hint">{$t(orderId?'orderIntake.profileFocusHint':'orderIntake.newProfileFocusHint')}</p>
    {#if orderId&&fileId&&isPdf}
      <details class="pdf-options"><summary>{$t('orderIntake.pdfProcessing')} · {$t(pdfMode==='ocr'?'orderIntake.ocrLabel':pdfMode==='native'?'orderIntake.nativePdf':pdfMode==='visual'?'orderIntake.visualPdf':'orderIntake.textPdf')}</summary>
      <fieldset disabled={!editable||uploading||analyzing||applying}>
        <legend>{$t('orderIntake.pdfProcessing')}</legend>
        <label class="check"><input type="radio" bind:group={pdfMode} value="visual"/>{$t('orderIntake.visualPdf')}</label>
        <label class="check"><input type="radio" bind:group={pdfMode} value="text"/>{$t('orderIntake.textPdf')}</label>
        <label class="check"><input type="radio" bind:group={pdfMode} value="native" disabled={!capabilities.nativePdf}/>{$t('orderIntake.nativePdf')}</label>
        <label class="check"><input type="radio" bind:group={pdfMode} value="ocr" disabled={!capabilities.paidOcr}/>{$t('orderIntake.ocrLabel')}</label>
      </fieldset></details>
      <p class="hint">{$t(pdfMode==='ocr'?'orderIntake.ocrCharge':pdfMode==='native'?'orderIntake.nativePdfHint':pdfMode==='visual'?'orderIntake.visualPdfHint':'orderIntake.textPdfHint')}</p>
      {#if capabilitiesProblem}<p class="hint">{$t('orderIntake.processingSettingsError')}</p>
      {:else if !capabilities.nativePdf||!capabilities.paidOcr}<p class="hint">{$t('orderIntake.unavailableModes')}</p>{/if}
      {#if capabilitiesProblem}<button type="button" class="text-button" onclick={loadCapabilities}>{$t('orderIntake.retryModes')}</button>{/if}
    {/if}
    <div class="actions"><button type="button" class="primary" onclick={analyze} disabled={!editable||loading||uploading||analyzing||applying||(!!orderId&&(dirty||!orderUpdatedAt))||(!orderId&&!fileId)}>
      {$t(analyzing?'orderIntake.analyzing':'orderIntake.analyze')}</button>
      {#if analyzing}<button type="button" onclick={cancelAnalysis}>{$t('orderIntake.cancel')}</button>{/if}</div>
  </div>
  {#if problem}<p role="alert" class="problem">{problem}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if analysis&&!sourceMatches}<p class="warning" role="status">{$t('orderIntake.selectionChanged')}</p>{/if}
  {#if analysis&&sourceMatches}
    {#if analysisStale&&!applied}<p class="warning" role="status">{$t('orderIntake.analysisStale')}</p>{/if}
    <div class="review-summary">
      <h4 bind:this={reviewHeading} tabindex="-1">{$t('orderIntake.reviewChoices')}</h4>
      <p>{$t('orderIntake.reviewCounts',{count:choiceCount,attention:attentionCount,selected:acceptedCount})}</p>
      <p class="hint">{analysis.fileName??$t('orderIntake.notesOnly')}{profileIndex!==null?' · '+(profileNames[profileIndex]||String(profileIndex+1)):''}</p>
      <p class="hint">{$t('orderIntake.provenance')}</p>
      <details><summary>{$t('orderIntake.sourceDetails')}</summary><p class="hint">{$t('orderIntake.model')}: {analysis.model}</p>
        {#if orderId&&analysis.fileId}<a href={`/api/files/${encodeURIComponent(analysis.fileId)}/download`} target="_blank" rel="noopener noreferrer">{$t('orderIntake.downloadSource')}</a>{/if}</details>
    </div>
    <div class="filters" role="group" aria-label={$t('orderIntake.filterChoices')}>
      {#each ['all','attention','selected'] as filter}<button type="button" aria-pressed={reviewFilter===filter}
        onclick={()=>reviewFilter=filter as typeof reviewFilter}>{$t('orderIntake.filter_'+filter)}</button>{/each}
    </div>
    {#if reviewFilter==='selected'&&!acceptedCount}<p class="empty">{$t('orderIntake.nothingSelected')}</p>{/if}
    {#if reviewFilter==='attention'&&!attentionCount}<p class="empty">{$t('orderIntake.noAttention')}</p>{/if}
    {#if analysis.orderConflicts?.length&&reviewFilter!=='selected'}
      <h4>{$t('orderIntake.orderConflict')}</h4>
      {#each analysis.orderConflicts as conflict (conflict.field)}<article class="review-row unresolved">
        <strong>{$t('orderAssistant.fieldNames.'+conflict.field)}</strong>
        {#each conflict.alternatives as alternative,i (i)}<p>{alternative.value}</p><p class="hint">{alternative.evidence}</p>{/each}
      </article>{/each}
    {/if}
    {#if analysis.proposals.some((p,i)=>visible(p.confidence,approvals[i]===true))}
      <h4>{$t('orderIntake.proposals')}</h4>
      {#each analysis.proposals as p,i (`${p.field}-${i}`)}{#if visible(p.confidence,approvals[i]===true)}
        <article class="review-row"><div class="review-head">
          <label class="choice"><input type="checkbox" checked={approvals[i]===true} onchange={e=>approve(i,e.currentTarget.checked,'order')}
            disabled={applying||applied||!editable||analysisStale||isUnchanged(p)}/><strong>{$t('orderAssistant.fieldNames.'+p.field)}</strong></label>
          <span class="confidence">{$t('orderAssistant.confidence.'+p.confidence)}</span></div>
          <div class="comparison"><div><span class="caption">{$t('orderIntake.current')}</span><p>{String(current[p.field]??'—')}</p></div>
            <div><span class="caption">{$t('orderIntake.proposed')}</span><p class="proposed">{p.value}</p></div></div>
          {#if isUnchanged(p)}<p class="hint">{$t('orderAssistant.noDifference')}</p>{/if}
          <details><summary>{$t('orderIntake.evidence')}</summary><blockquote>{p.evidence}</blockquote>
            {#if analysis.evidenceVerified[i]}<p class="hint">{$t('orderIntake.matchedText')}</p>{/if}</details>
        </article>
      {/if}{/each}
    {/if}
    {#if production.some((p,i)=>visible(p.confidence,productionApprovals[i]===true,p.status!=='ready'||p.reason==='manual-selection'))}
      <h4>{$t('orderIntake.production')}</h4>
      <p class="hint">{$t('orderIntake.productionHint')}</p>
      {#each production as p,i (`${p.target}-${i}`)}{#if visible(p.confidence,productionApprovals[i]===true,p.status!=='ready'||p.reason==='manual-selection')}
        {@const picker=getProductionMaterialPicker(p.target)}
        <article class="review-row" class:unresolved={p.status!=='ready'}><div class="review-head">
          <label class="choice"><input id={`${sectionId}-production-${i}`} type="checkbox" checked={productionApprovals[i]===true} onchange={e=>approve(i,e.currentTarget.checked,'production')}
            disabled={applying||applied||!editable||analysisStale||p.status!=='ready'||(!isOrderProductionFact(p)&&profileIndex===null)}/><strong>{$t('productionIntake.targets.'+p.target)}</strong></label>
          <span class="confidence">{$t('orderAssistant.confidence.'+p.confidence)}</span></div>
          {#if p.part}<p class="hint">{p.part}</p>{/if}
          <div class="comparison"><div><span class="caption">{$t('orderIntake.current')}</span><p>{productionCurrentValue(p,current,profileIndex)||'—'}</p></div>
            <div><span class="caption">{$t('orderIntake.proposed')}</span><p class="proposed">{p.material?.name_en??p.value}</p>
              {#if p.material}<p class="hint">{p.material.code}</p>{/if}</div></div>
          <p class="reason" class:warning-text={p.status!=='ready'}>{$t('productionIntake.reasons.'+p.reason)}</p>
          {#if profileIndex===null&&!isOrderProductionFact(p)}<p class="hint">{$t('orderIntake.chooseSavedProfile')}</p>{/if}
          {#if picker&&!['conflicting-values','invalid-value'].includes(p.reason)&&!applied}
            {#if editingMaterial===i}
              <div class="material-editor"><p class="hint">{$t('orderIntake.manualMaterialHint')}</p>
                <MaterialSelect categories={picker.categories} materialRole={picker.role} value={p.material?.code??''}
                  label={$t('productionIntake.targets.'+p.target)} readonly={!editable||analysisStale||applying}
                  onchange={data=>chooseMaterial(i,data.material as unknown as IntakeMaterial|null)}/>
                <button type="button" class="text-button" onclick={()=>editingMaterial=null}>{$t('orderIntake.cancel')}</button></div>
            {:else}<button type="button" class="text-button" disabled={!editable||analysisStale||applying} onclick={()=>editingMaterial=i}>
              {$t(p.material?'orderIntake.changeMaterial':'orderIntake.chooseMaterial')}</button>{/if}
            {#if manualSelections[i]}<button type="button" class="text-button" onclick={()=>resetMaterial(i)} disabled={analysisStale||applying}>{$t('orderIntake.resetMaterial')}</button>{/if}
          {/if}
          <details><summary>{$t('orderIntake.evidence')}{p.page?' · '+$t('orderIntake.pageNumber',{page:p.page}):''}</summary>
            <blockquote>{p.evidence}</blockquote><p class="hint">{$t('orderIntake.sourceValue')}: {p.value}</p>
            {#if p.material}<p class="hint">{$t('orderIntake.catalogId')}: {p.material.id}</p>{/if}</details>
        </article>
      {/if}{/each}
    {/if}
    {#if !choiceCount&&!analysis.orderConflicts?.length}<p class="empty">{$t('orderIntake.noProposals')}</p>{/if}
    {#if analysis.missing.length}<details class="questions" open><summary>{$t('orderIntake.missing')} ({analysis.missing.length})</summary>
      <ul>{#each analysis.missing as m,i (i)}<li>{m}</li>{/each}</ul></details>{/if}
    {#if analysis.profileSuggestions.length}<details class="questions"><summary>{$t('orderIntake.profiles')}</summary>
      {#each analysis.profileSuggestions as p,i (i)}<p><strong>{p.name}</strong> × {p.quantity??'?'} — {p.details}</p>{/each}
      <p class="hint">{$t('orderIntake.profilesManual')}</p></details>{/if}
    <footer class="apply-bar">
      {#if applied}<p role="status" class="success">{$t('orderIntake.applied')}</p>
      {:else}
        <div class="section-heading"><strong>{$t('orderIntake.selectedCount',{count:acceptedCount})}</strong>
          <button type="button" class="text-button" onclick={clearApprovals} disabled={applying||!acceptedCount}>{$t('orderIntake.clearSelections')}</button></div>
        {#if acceptedCount>0}<label class="check"><input type="checkbox" bind:checked={replacementApproved} disabled={applying}/>{$t('orderIntake.replaceAcknowledgment')}</label>{/if}
        {#if selectionConflicts.length}<p class="warning" role="status">{$t('orderIntake.conflictingChoices')}</p>{/if}
        <p class="hint">{$t('orderIntake.localApplyHint')}</p>
        <button type="button" class="primary" onclick={apply} disabled={!editable||uploading||analysisStale||applying||acceptedCount===0||selectionConflicts.length>0}>
          {$t(applying?'orderIntake.checking':'orderIntake.applySelected')}</button>
      {/if}
    </footer>
  {/if}
</section>

<style>
 .intake{display:grid;gap:var(--space-md);min-width:0;font-size:var(--text-sm);line-height:1.5;color:var(--ink-primary)}
 header{display:grid;gap:var(--space-xs)}h3,h4,p{margin:0}h3{font-size:var(--text-lg);font-weight:650}h4{font-size:var(--text-md);font-weight:650}
 .hint,.caption,.confidence{font-size:var(--text-xs);color:var(--ink-secondary)}.hint,p,blockquote{overflow-wrap:anywhere}
 .upload-entry{display:grid;gap:var(--space-xs)}
 .source-setup{display:grid;gap:var(--space-sm);padding-bottom:var(--space-md);border-bottom:1px solid var(--border)}
 .section-heading,.review-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm);flex-wrap:wrap}
 label:not(.check):not(.choice){display:grid;gap:var(--space-xs);font-weight:550}
 select,button,input{font:inherit;max-width:100%;min-width:0}select,button{padding:var(--space-sm);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-1);color:var(--ink-primary);min-height:40px}
 button{font-weight:550;cursor:pointer}button:hover:not(:disabled){background:var(--bg-2)}button:disabled{opacity:.55;cursor:not-allowed}
 button.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}button.primary:hover:not(:disabled){background:var(--brand-hover,var(--brand))}
 .text-button{background:transparent;border:0;min-height:36px;padding:4px 0;color:var(--link);text-align:left}
 .actions,.filters{display:flex;gap:var(--space-sm);flex-wrap:wrap}.filters{gap:var(--space-xs)}.filters button{flex:1;font-size:var(--text-xs);min-height:36px;white-space:normal}.filters button[aria-pressed='true']{border-color:var(--ink-primary);background:var(--bg-2);color:var(--ink-primary)}
 .check,.choice{display:flex;gap:var(--space-sm);align-items:flex-start}.choice{align-items:center;min-height:32px}.check{min-height:32px}.check input,.choice input{flex-shrink:0;margin-top:4px}.choice input{margin-top:0}
 fieldset{border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--space-sm);display:grid;gap:var(--space-sm);min-width:0}legend{font-size:var(--text-xs);font-weight:600;padding-inline:4px}
 .review-summary{display:grid;gap:var(--space-xs)}.review-summary>p:first-of-type{font-size:var(--text-sm)}
 .review-row{display:grid;gap:var(--space-sm);padding:var(--space-md) 0;border-bottom:1px solid var(--border);min-width:0}.review-row.unresolved{border-bottom-style:dashed}
 .comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:var(--space-sm)}.comparison>div{min-width:0}.caption{display:block;margin-bottom:var(--space-xs)}.proposed{font-weight:600}
 .reason{font-size:var(--text-xs)}.warning-text{color:var(--ink-primary)}.material-editor{padding-block:var(--space-sm);display:grid;gap:var(--space-sm)}
 details{min-width:0}summary{cursor:pointer;color:var(--ink-secondary);font-size:var(--text-xs);padding-block:4px}blockquote{margin:var(--space-xs) 0;padding:var(--space-sm);background:var(--bg-2);border-radius:var(--radius-sm);font-size:var(--text-xs)}
 .questions{padding-top:var(--space-sm)}.questions summary{font-weight:600;color:var(--ink-primary);font-size:var(--text-sm)}ul{padding-left:var(--space-lg);margin:var(--space-sm) 0;display:grid;gap:var(--space-xs)}
 .apply-bar{display:grid;gap:var(--space-sm);padding:var(--space-md) 0;border-top:1px solid var(--border);background:var(--bg-0)}.apply-bar>.primary{width:100%}
 .warning,.problem,.empty{padding:var(--space-sm);border:1px solid var(--border);border-radius:var(--radius-sm)}.problem{color:var(--error)}.warning{background:var(--bg-2)}.empty{color:var(--ink-secondary)}.success{font-weight:600}
 a{color:var(--link);font-size:var(--text-xs);text-underline-offset:3px}
 :is(button,select,input,summary,a):focus-visible{outline:2px solid var(--focus,var(--brand));outline-offset:3px}
 .pdf-options > summary { cursor:pointer; padding:8px 0; font-weight:550; }
</style>
