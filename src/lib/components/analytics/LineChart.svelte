<!-- src/lib/components/analytics/LineChart.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Chart from 'chart.js/auto';

    export let data: {
        labels: string[];
        datasets: Array<{
            label: string;
            data: number[];
            borderColor?: string;
            backgroundColor?: string;
        }>;
    };
    export let title: string | null = null;
    export let height = 300;

    let canvasElement: HTMLCanvasElement;
    let chart: Chart | null = null;

    onMount(() => {
        if (canvasElement) {
            chart = new Chart(canvasElement, {
                type: 'line',
                data: {
                    ...data,
                    datasets: data.datasets.map(dataset => ({
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

    $: if (chart) {
        chart.data = data;
        chart.update();
    }
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