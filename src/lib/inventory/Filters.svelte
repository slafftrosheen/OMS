<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from 'svelte-i18n';
  const d = createEventDispatcher();
  export let query=''; 
  export let section='all'; 
  export let group=''; 
  export let subgroup='';
  
  const FILTER_SECTIONS = ['all', 'materials', 'leftovers', 'paints', 'tools', 'cons'];
  
  function fire(){ 
    d('change',{ query, section, group, subgroup }); 
  }
</script>

<div class="row" style="align-items:center">
  <div class="row" role="tablist" aria-label={$t('inventory.filters.sections_label')}>
    {#each FILTER_SECTIONS as s}
      <button role="tab" class="tag ghost" aria-selected={section===s} on:click={()=>{section=s;fire();}}>{$t('inventory.filter_sections.' + s)}</button>
    {/each}
  </div>
  <input style="min-width:260px" placeholder={$t('inventory.filters.search_placeholder')} bind:value={query} on:input={fire} aria-label="Search">
  <input placeholder={$t('inventory.filters.group_placeholder')} bind:value={group} on:input={fire} aria-label="Group">
  <input placeholder={$t('inventory.filters.subgroup_placeholder')} bind:value={subgroup} on:input={fire} aria-label="Subgroup">
</div>
