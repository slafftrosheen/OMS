<script lang="ts">
  import { t } from 'svelte-i18n';
  import ApexCharts from 'svelte-apexcharts';
  import { withTheme } from '$lib/charts/theme';
  import { theme, type ThemeName } from '$lib/stores/theme';

  export type GanttItem = { label: string; planned: [number, number]; actual?: [number, number] };
  export let items: GanttItem[] = [];

  let currentTheme: ThemeName = 'DarkVim';
  $: currentTheme = $theme as ThemeName;

  const baseOptions = {
    chart: { type: 'rangeBar', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    xaxis: { type: 'datetime' as const }
  };

  $: series = [
    { name: 'Planned', data: items.map((item) => ({ x: item.label, y: item.planned })) },
    {
      name: 'Actual',
      data: items.filter((item) => item.actual).map((item) => ({ x: item.label, y: item.actual as [number, number] }))
    }
  ];

  $: options = withTheme(baseOptions, currentTheme);
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('order.timeline')}</h3>
  <ApexCharts type="rangeBar" {options} {series} height={260} />
</div>
