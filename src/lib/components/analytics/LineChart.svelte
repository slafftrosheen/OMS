<!-- src/lib/components/analytics/LineChart.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Chart from 'chart.js/auto';
    import { tokenColor } from '$lib/utils/tokenColor';

    let {
        data,
        title = null,
        height = 300
    }: {
        data: {
            labels: string[];
            datasets: Array<{
                label: string;
                data: number[];
                borderColor?: string;
                backgroundColor?: string;
            }>;
        };
        title?: string | null;
        height?: number;
    } = $props();

    let canvasElement: HTMLCanvasElement;
    let chart: Chart | null = null;

    function defaultBorder()  { return tokenColor('--brand',   '#0066cc'); }
    function defaultFill()    { return tokenColor('--brand',   '#0066cc', 0.1); }

    onMount(() => {
        if (canvasElement) {
            const rawData = $state.snapshot(data);
            chart = new Chart(canvasElement, {
                type: 'line',
                data: {
                    ...rawData,
                    datasets: rawData.datasets.map((dataset: any) => ({
                        ...dataset,
                        borderColor:     dataset.borderColor     || defaultBorder(),
                        backgroundColor: dataset.backgroundColor || defaultFill(),
                        tension: 0.4,
                        fill: true
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        title: {
                            display: !!title,
                            text: title || ''
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    });

    onDestroy(() => {
        if (chart) {
            chart.destroy();
        }
    });

    $effect(() => {
        if (chart && data) {
            const rawData = $state.snapshot(data);
            chart.data = {
                ...rawData,
                datasets: rawData.datasets.map((dataset: any) => ({
                    ...dataset,
                    borderColor:     dataset.borderColor     || defaultBorder(),
                    backgroundColor: dataset.backgroundColor || defaultFill(),
                    tension: 0.4,
                    fill: true
                }))
            };
            chart.update();
        }
    });
</script>

<div class="chart-container" style="height: {height}px">
    <canvas bind:this={canvasElement}></canvas>
</div>

<style>
    .chart-container {
        position: relative;
        width: 100%;
    }
</style>