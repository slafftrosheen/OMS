<script lang="ts">
  import { upcoming, usage } from '$lib/loading/loading-store';

  export let selected = '';
  export let id: string | undefined = undefined;
  export let ariaLabel = 'Loading date';

  let options: { value: string; label: string; full: boolean }[] = [];

  $: options = upcoming().map((day) => {
    const stats = usage(day.date);
    return {
      value: day.date,
      label: `${day.date} · ${stats.assigned}/${stats.capacity || '∞'}`,
      full: stats.full
    };
  });
</script>

<select class="rf-select" bind:value={selected} {id} aria-label={ariaLabel}>
  <option value="">—</option>
  {#each options as option}
    <option value={option.value} disabled={option.full}>{option.label}</option>
  {/each}
</select>
