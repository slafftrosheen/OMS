<script module lang="ts">
  export type GanttItem = { label: string; planned: [number, number]; actual?: [number, number] };
</script>

<script lang="ts">
  import { t } from 'svelte-i18n';
  import ApexCharts from 'svelte-apexcharts';
  import { withTheme } from '$lib/charts/theme';
  import { theme, type ThemeName } from '$lib/stores/theme';

  let {
    items = []
  }: {
    items?: GanttItem[];
  } = $props();

  let currentTheme: ThemeName = $derived($theme as ThemeName);

  const baseOptions = {
    chart: { type: 'rangeBar', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    xaxis: { type: 'datetime' as const }
  };

  let series = $derived([
    { name: 'Planned', data: items.map((item) => ({ x: item.label, y: item.planned })) },
    {
      name: 'Actual',
      data: items.filter((item) => item.actual).map((item) => ({ x: item.label, y: item.actual as [number, number] }))
    }
  ]);

  let options = $derived(withTheme(baseOptions, currentTheme));
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('order.timeline')}</h3>
  <ApexCharts type="rangeBar" {options} {series} height={260} />
</div>
