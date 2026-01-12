<script lang="ts">
  export let value: string;
  export let options: { label: string; value: string }[] = [];
  export let ariaLabel = 'select';
</script>

<select bind:value aria-label={ariaLabel} class="rf-select">
  {#each options as o}
    <option value={o.value}>{o.label}</option>
  {/each}
</select>

<style>
.rf-select{
  padding:.55rem .7rem;
  border-radius:10px;
  border:1px solid var(--border);
  background:var(--bg-0);
  color:var(--text);
}
</style>
