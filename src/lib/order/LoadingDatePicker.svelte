<script lang="ts">
  import { upcoming, usage } from '$lib/loading/loading-store';

  export let selected = '';
  export let id: string | undefined = undefined;
  export let ariaLabel = 'Loading date';

  let options: { value: string; label: string; full: boolean }[] = [];

  $: loadOptions(upcoming());

  async function loadOptions(days: any[]) {
    const promises = days.map(async (day) => {
      const stats = await usage(day.date);
      return {
        value: day.date,
        label: `${day.date} · ${stats.assigned}/${(stats as any).capacity || '∞'}`,
        full: (stats as any).full || false
      };
    });
    options = await Promise.all(promises);
  }
</script>

<select class="rf-select" bind:value={selected} {id} aria-label={ariaLabel}>
  <option value="">—</option>
  {#each options as option}
    <option value={option.value} disabled={option.full}>{option.label}</option>
  {/each}
</select>
