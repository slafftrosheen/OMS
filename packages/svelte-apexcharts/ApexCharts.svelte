<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';

  interface Props {
    type?: string;
    options?: Record<string, any>;
    series?: any[];
    height?: number | string;
    width?: number | string;
  }

  let { 
    type = undefined, 
    options = {}, 
    series = [], 
    height = undefined, 
    width = undefined 
  }: Props = $props();

  const CDN_URL = 'https://cdn.jsdelivr.net/npm/apexcharts@3.49.1/dist/apexcharts.min.js';

  let container: HTMLDivElement | undefined = $state(undefined);
  let chart: any = null;
  let mounted = $state(false);
  let error = $state<string | null>(null);

  function getDocument(): Document | undefined {
    if (typeof document === 'undefined') return undefined;
    return document;
  }

  function loadScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    const win = window as any;
    if (win.ApexCharts) return Promise.resolve();
    if (win.__apexchartsLoadPromise) return win.__apexchartsLoadPromise;

    const doc = getDocument();
    if (!doc) return Promise.resolve();

    win.__apexchartsLoadPromise = new Promise<void>((resolve, reject) => {
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
        win.__apexchartsLoadPromise = undefined;
        reject(new Error('Failed to load ApexCharts from CDN'));
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });

      if (!existing) {
        (script as HTMLScriptElement).src = CDN_URL;
        (script as HTMLScriptElement).async = true;
        (script as HTMLElement).dataset.apexcharts = 'true';
        doc.head.appendChild(script);
      }
    });

    return (window as any).__apexchartsLoadPromise;
  }

    function buildConfig() {

      // Use $state.snapshot to strip Svelte 5 proxies, as ApexCharts tries to modify these objects

      const baseOptions = $state.snapshot(options) ?? {};

      const baseSeries = $state.snapshot(series) ?? [];

      

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

        series: Array.isArray(baseSeries) ? baseSeries : []

      };

    }

  async function createChart() {
    if (typeof window === 'undefined' || !container) return;
    try {
      await loadScript();
      const { default: ApexCharts } = await import('apexcharts');
      const config = buildConfig();
      // @ts-ignore - ApexCharts constructor type mismatch
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

  $effect(() => {
    // React to prop changes
    const _opts = options;
    const _series = series;
    const _type = type;
    const _height = height;
    const _width = width;
    
    if (mounted && chart) {
      untrack(() => updateChart());
    }
  });
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
