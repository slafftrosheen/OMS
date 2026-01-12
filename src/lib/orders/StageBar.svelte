<script lang="ts">
  import StagePill from './StagePill.svelte';
  
  export let progress: Array<{stage: string, done: boolean, redo: string | null}> = []; // [{stage:'CAD',done:true, redo:null}, ...]
</script>

<div class="wrap">
  {#each progress as s}
    <StagePill {...s}/>
  {/each}
</div>

<style>
.wrap{
  display:flex;
  flex-wrap:wrap;
  gap:var(--space-tight);
}
</style>
