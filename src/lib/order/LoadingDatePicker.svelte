<script lang="ts">
  import { upcoming, usage } from '$lib/loading/loading-store';

  let {
    selected = $bindable(''),
    id = undefined as string | undefined,
    ariaLabel = 'Loading date'
  } = $props<{
    selected?: string;
    id?: string;
    ariaLabel?: string;
  }>();

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
