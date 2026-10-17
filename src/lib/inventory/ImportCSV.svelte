<script lang="ts">
  import {createMaterial} from './store';
  import {parseInventoryCsv} from './csv-import';
  import {t} from 'svelte-i18n';

  let text=$state('');
  let saving=$state(false);
  let previewed=$state(false);
  let report=$state('');
  let errors=$state<string[]>([]);
  let validCount=$state(0);

  function preview(){
    const parsed=parseInventoryCsv(text);
    validCount=parsed.rows.length;
    errors=parsed.errors;
    report='';
    previewed=parsed.errors.length===0&&parsed.rows.length>0;
  }
  async function commit(){
    if(saving||!previewed)return;
    const parsed=parseInventoryCsv(text);
    if(parsed.errors.length||!parsed.rows.length){
      errors=parsed.errors.length?parsed.errors:
        [$t('inventoryConsolidation.csvNoRows')];
      previewed=false;return;
    }
    saving=true;errors=[];report='';
    let saved=0;
    try{
      for(const entry of parsed.rows){
        const created=await createMaterial({...entry.metadata,stock:0});
        if(created)saved++;
        else errors=[...errors,`Line ${entry.line}: ${$t('inventoryConsolidation.csvSaveFailed')}`];
      }
      report=$t('inventoryConsolidation.csvImported',{values:{saved,total:parsed.rows.length}});
      if(!errors.length){text='';validCount=0;}
      previewed=false;
    }finally{saving=false;}
  }
</script>

<section class="card" aria-label={$t('inventory.import.title')}>
  <h3>{$t('inventory.import.title')}</h3>
  <p class="csv-note">{$t('inventoryConsolidation.csvWarning')}</p>
  <textarea rows="6" bind:value={text}
    oninput={()=>{previewed=false;errors=[];report='';}}
    placeholder={$t('inventory.import.placeholder')} disabled={saving}></textarea>
  {#if errors.length}
    <ul class="csv-errors" role="alert">
      {#each errors.slice(0,15) as message,i (i)}
        <li>{message}</li>
      {/each}
    </ul>
  {/if}
  {#if previewed}
    <p class="csv-note" role="status">
      {$t('inventoryConsolidation.csvPreview',{values:{count:validCount}})}
    </p>
  {/if}
  {#if report}<p class="csv-note" role="status">{report}</p>{/if}
  <div class="row" style="justify-content:flex-end;gap:.5rem">
    <button type="button" class="tag" onclick={preview} disabled={saving||!text.trim()}>
      {$t('inventoryConsolidation.csvCheck')}
    </button>
    <button type="button" class="tag" onclick={commit} disabled={!previewed||saving}>
      {$t('inventoryConsolidation.csvCreate')}
    </button>
  </div>
</section>
<style>
  textarea{width:100%;background:var(--bg-0);border:1px solid var(--border);
    border-radius:8px;padding:8px;color:var(--text);font-family:monospace;margin:8px 0}
  .csv-note{color:var(--muted);font-size:.82rem}
  .csv-errors{font-size:.82rem;color:var(--error);max-height:160px;overflow:auto}
</style>
