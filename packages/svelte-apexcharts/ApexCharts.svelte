<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  declare global {
    interface Window {
      ApexCharts?: any;
      __apexchartsLoadPromise?: Promise<void> | undefined;
    }
  }

  export let type: string | undefined = undefined;
  export let options: Record<string, any> | undefined = undefined;
  export let series: any[] = [];
  export let height: number | string | undefined = undefined;
  export let width: number | string | undefined = undefined;

  const CDN_URL = 'https://cdn.jsdelivr.net/npm/apexcharts@3.49.1/dist/apexcharts.min.js';

  let container: HTMLDivElement;
  let chart: any = null;
  let mounted = false;
  let error: string | null = null;

  function getDocument(): Document | undefined {
    if (typeof document === 'undefined') return undefined;
    return document;
  }

  function loadScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.ApexCharts) return Promise.resolve();
    if (window.__apexchartsLoadPromise) return window.__apexchartsLoadPromise;

    const doc = getDocument();
    if (!doc) return Promise.resolve();

    window.__apexchartsLoadPromise = new Promise<void>((resolve, reject) => {
      const existing = doc.querySelector('script[data-apexcharts="true"]');
      const script = existing ?? doc.createElement('script');

      const cleanup = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        if (!existing && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        window.__apexchartsLoadPromise = undefined;
        reject(new Error('Failed to load ApexCharts from CDN'));
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });

      if (!existing) {
        script.src = CDN_URL;
        script.async = true;
        script.dataset.apexcharts = 'true';
        doc.head.appendChild(script);
      }
    });

    return window.__apexchartsLoadPromise;
  }

  function buildConfig() {
    const baseOptions = options ?? {};
    const baseChart = baseOptions.chart ?? {};
    const chartConfig = {
      ...baseChart,
      ...(type ? { type } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(width !== undefined ? { width } : {})
    };

    const mergedOptions: Record<string, any> = {
      ...baseOptions,
      chart: chartConfig
    };

    if (Object.keys(chartConfig).length === 0) {
      delete mergedOptions.chart;
    }

    return {
      options: mergedOptions,
      series: Array.isArray(series) ? series : []
    };
  }

  async function createChart() {
    if (typeof window === 'undefined' || !container) return;
    try {
      await loadScript();
      const { default: ApexCharts } = await import('apexcharts');
      const config = buildConfig();
      chart = new ApexCharts(container, { ...config.options, series: config.series });
      await chart.render();
      mounted = true;
      error = null;
    } catch (err) {
      mounted = false;
      error = err instanceof Error ? err.message : 'Unknown error initialising chart';
      console.error(err);
    }
  }

  async function updateChart() {
    if (!mounted || !chart) return;
    const config = buildConfig();
    try {
      await chart.updateOptions(config.options, false, true);
      await chart.updateSeries(config.series, true);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error updating chart';
      console.error(err);
    }
  }

  onMount(() => {
    createChart();
    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      mounted = false;
    };
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    mounted = false;
  });

  $: if (mounted && chart) {
    void options;
    void series;
    void type;
    void height;
    void width;
    updateChart();
  }
</script>

<div bind:this={container} data-apex-chart>
  {#if error}
    <div class="apexcharts-error" role="alert">{error}</div>
  {/if}
</div>

<style>
  div[data-apex-chart] {
    width: 100%;
  }

  .apexcharts-error {
    color: var(--muted, #8e8ea0);
    font-size: 0.85rem;
    padding: 8px;
  }
</style>
