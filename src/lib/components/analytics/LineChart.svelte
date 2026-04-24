<!-- src/lib/components/analytics/LineChart.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Chart from 'chart.js/auto';

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

    onMount(() => {
        if (canvasElement) {
            const rawData = $state.snapshot(data);
            chart = new Chart(canvasElement, {
                type: 'line',
                data: {
                    ...rawData,
                    datasets: rawData.datasets.map((dataset: any) => ({
                        ...dataset,
                        borderColor: dataset.borderColor || '#0066cc',
                        backgroundColor: dataset.backgroundColor || 'rgba(0, 102, 204, 0.1)',
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
                    borderColor: dataset.borderColor || '#0066cc',
                    backgroundColor: dataset.backgroundColor || 'rgba(0, 102, 204, 0.1)',
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