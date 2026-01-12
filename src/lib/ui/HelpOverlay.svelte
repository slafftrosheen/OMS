<script lang="ts">
  export let onClose = ()=>{};
  let open=true;
  function close(){ open=false; onClose(); }
  function onKey(e:KeyboardEvent){ if(e.key==='Escape') close(); }
</script>

{#if open}
<div class="sheet">
  <div class="card" role="dialog" aria-modal="true" aria-label="Interface help" on:keydown={onKey} tabindex="0">
    <h3>Quick help</h3>
    <ul>
      <li><b>Theme</b>: Light / Dark / High-contrast (3:1 non-text contrast).</li>
      <li><b>Language</b>: EN/RU/LV.</li>
      <li><b>Text size</b>: sm/md/lg/xl (persists).</li>
      <li><b>Stations</b>: Drag orders across columns; WIP limit blocks drops.</li>
      <li><b>Orders</b>: "Change loading date…" respects capacity slots.</li>
      <li><b>Inventory</b>: Low stock triggers notification + toast.</li>
    </ul>
    <div class="row" style="justify-content:flex-end"><button class="tag" on:click={close}>Close</button></div>
  </div>
</div>
{/if}

<style>
.sheet{position:fixed;inset:0;background:color-mix(in oklab, var(--bg-0) 60%, transparent);display:grid;place-items:center;z-index:90}
</style>
