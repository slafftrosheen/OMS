<script lang="ts">
  import { logStage } from '$lib/orders/journal';
  
  let {
    po = '',
    station = 'CNC',
    onclose
  }: {
    po?: string;
    station?: string;
    onclose?: () => void;
  } = $props();
  
  let notes = $state(''); 
  let redo = $state(false); 
  let reason = $state('recut');
  
  async function save(){
    await logStage(po, station, notes, redo ? reason : undefined);
    onclose?.();
  }
</script>

<div class="sheet">
  <div class="card">
    <h3>{station}: log progress</h3>
    <label>PO <input bind:value={po}></label>
    <label>Notes <textarea rows="3" bind:value={notes}></textarea></label>
    <label class="row" style="gap:6px"><input type="checkbox" bind:checked={redo}> Mark redo</label>
    {#if redo}
      <select bind:value={reason}>
        <option value="recut">Re-cut</option>
        <option value="resand">Re-sand</option>
        <option value="reweld">Re-weld</option>
        <option value="repaint">Re-paint</option>
      </select>
    {/if}
    <div class="row" style="justify-content:flex-end;gap:8px">
      <button class="tag ghost" onclick={()=>onclose?.()}>Cancel</button>
      <button class="tag" onclick={save}>Save</button>
    </div>
  </div>
</div>

<style>
.sheet{ position:fixed; left:0; right:0; bottom:0; padding:12px; z-index:70 }
.card{ 
  border:1px solid var(--border); 
  border-radius:16px 16px 0 0; 
  background:var(--bg-0); 
  padding:12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
label{
  display: flex;
  flex-direction: column;
  gap: 4px;
}
input, textarea, select {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  color: var(--text);
}
</style>
