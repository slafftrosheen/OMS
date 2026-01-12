<script lang="ts">
  import { RAL, PANTONE } from '$lib/colors/palettes';
  export let items: any[] = []; // bind from order
  function add(){ items = [...items, { type:'Acrylic', thicknessMM:3, colorSystem:'RAL', colorCode:'', qty:1 }]; }
  function del(i:number){ items = items.filter((_,ix)=>ix!==i); }
  $: (items);  // bind outward
</script>

<section class="card">
  <div class="row materials-head">
    <h3>Materials</h3><button class="tag" on:click={add}>Add</button>
  </div>
  <div class="rf-table">
    <div class="thead">
      <div>Type</div><div>Thk(mm)</div><div>Color sys</div><div>Code</div><div>Preview</div><div>Qty</div><div>Notes</div><div></div>
    </div>
    {#each items as m, i}
    <div class="rowi">
      <input bind:value={m.type} placeholder="Acrylic/Alu/ACP/…">
      <input type="number" bind:value={m.thicknessMM} min="0" step="0.5">
      <select bind:value={m.colorSystem}>
        <option value="RAL">RAL</option><option value="PANTONE">Pantone</option><option value="HEX">HEX</option><option value="N/A">N/A</option>
      </select>
      {#if m.colorSystem==='RAL'}
        <input list="ral" bind:value={m.colorCode} placeholder="RAL 3020">
        <datalist id="ral">{#each RAL as c}<option value={c.code}>{c.name}</option>{/each}</datalist>
      {:else if m.colorSystem==='PANTONE'}
        <input list="pantone" bind:value={m.colorCode} placeholder="PANTONE 186 C">
        <datalist id="pantone">{#each PANTONE as c}<option value={c.code}>{c.name}</option>{/each}</datalist>
      {:else if m.colorSystem==='HEX'}
        <input bind:value={m.colorCode} placeholder="#RRGGBB">
      {:else}
        <input bind:value={m.colorCode} placeholder="—">
      {/if}
      <div class="sw" style="--c:{m.colorSystem==='HEX'
          ? m.colorCode
          : (m.colorSystem==='RAL' && RAL.find(x=>x.code===m.colorCode)?.hex) ||
            (m.colorSystem==='PANTONE' && PANTONE.find(x=>x.code===m.colorCode)?.hex) || '#eee'}"></div>
      <input type="number" min="0" bind:value={m.qty}>
      <input bind:value={m.notes} placeholder="">
      <button class="tag ghost" on:click={()=>del(i)}>Delete</button>
    </div>
    {/each}
  </div>
</section>

<style>
.materials-head{
  justify-content:space-between;
  align-items:center;
  gap:var(--space-sm);
  margin-bottom:var(--space-sm);
}
.rf-table{ display:grid; gap:var(--space-tight) }
.thead, .rowi{
  display:grid;
  grid-template-columns: 1.2fr .8fr .9fr 1.2fr .6fr .6fr 1.2fr auto;
  gap:var(--space-tight);
  align-items:center;
}
.sw{
  inline-size:var(--control-xs);
  block-size:var(--control-xs);
  border-radius:calc(var(--radius-sm) - var(--space-xxs));
  border:1px solid var(--border);
  background:var(--c);
}
@media (max-width:920px){
  .thead{ display:none }
  .rowi{ grid-template-columns: 1fr 1fr; }
  .rowi > *{ min-width:0 }
}
</style>
