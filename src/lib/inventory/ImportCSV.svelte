<script lang="ts">
  import { createItem } from './store';
  import type { Section } from './types';
  import { t } from 'svelte-i18n';
  
  let text=''; 
  
  function parse(){
    // columns: section,group,subgroup,sku,name,unit,stock,min,location
    const lines = text.trim().split(/\r?\n/); 
    if(!lines.length) return;
    
    for(const ln of lines){ 
      const parts = ln.split(',');
      if (parts.length < 5) continue; // Skip invalid lines
      
      const [section, group, subgroup, sku, name, unit, stock, min, location] = parts;
      
      createItem({ 
        section: section as Section, 
        group: group || 'General', 
        subgroup: subgroup || 'General', 
        sku: sku || '', 
        name: name || '', 
        unit: unit as any || 'PCS', 
        stock: +(stock||0), 
        min: +(min||0), 
        location: location || '' 
      });
    }
    text='';
  }
</script>

<section class="card">
  <h3>{$t('inventory.import.title')}</h3>
  <textarea rows="6" bind:value={text} placeholder={$t('inventory.import.placeholder')}></textarea>
  <div class="row" style="justify-content:flex-end">
    <button class="tag" on:click={parse}>{$t('inventory.import.import_button')}</button>
  </div>
</section>

<style>
textarea {
  width: 100%;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  color: var(--text);
  font-family: monospace;
  margin: 8px 0;
}
</style>
