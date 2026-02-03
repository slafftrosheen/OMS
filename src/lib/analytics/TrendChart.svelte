<script lang="ts">
/**
 * Trend Chart Component
 * Line chart showing order trends over time
 */

import { onMount } from 'svelte';

interface Props {
  data: any;
  height?: number;
}

let {
  data,
  height = 300
}: Props = $props();

let canvas: HTMLCanvasElement;

onMount(() => {
  if (canvas && data) {
    drawChart();
  }
});

function drawChart() {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const chartHeight = height;

  // Clear canvas
  ctx.clearRect(0, 0, width, chartHeight);

  if (!data.dates || data.dates.length === 0) return;

  // Calculate scales
  const maxValue = Math.max(...data.total, ...data.completed, ...data.inProgress);
  const padding = 40;
  const chartWidth = width - padding * 2;
  const innerHeight = chartHeight - padding * 2;

  // Draw grid lines
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.1)';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = padding + (innerHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Draw lines
  const drawLine = (values: number[], color: string, lineWidth: number = 2) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    values.forEach((value, index) => {
      const x = padding + (chartWidth / (values.length - 1)) * index;
      const y = chartHeight - padding - (value / maxValue) * innerHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw dots
    ctx.fillStyle = color;
    values.forEach((value, index) => {
      const x = padding + (chartWidth / (values.length - 1)) * index;
      const y = chartHeight - padding - (value / maxValue) * innerHeight;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // Draw lines for different metrics
  drawLine(data.total, '#3b82f6', 3);
  drawLine(data.completed, '#10b981', 2);
  drawLine(data.inProgress, '#f59e0b', 2);

  // Draw axes labels
  ctx.fillStyle = 'var(--muted)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  // X-axis labels (dates)
  const labelInterval = Math.ceil(data.dates.length / 7);
  data.dates.forEach((date: string, index: number) => {
    if (index % labelInterval === 0) {
      const x = padding + (chartWidth / (data.dates.length - 1)) * index;
      const dateObj = new Date(date);
      const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
      ctx.fillText(label, x, chartHeight - 10);
    }
  });

  // Y-axis labels
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxValue / 5) * (5 - i));
    const y = padding + (innerHeight / 5) * i + 4;
    ctx.fillText(value.toString(), padding - 10, y);
  }
}

$effect(() => {
  if (canvas && data) {
    drawChart();
  }
});
</script>

<div class="trend-chart">
  <canvas 
    bind:this={canvas}
    width={800}
    height={height}
    style="width: 100%; height: {height}px;"
  />

  <div class="chart-legend">
    <div class="legend-item">
      <span class="legend-color" style="background-color: #3b82f6;"></span>
      <span>Total Orders</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background-color: #10b981;"></span>
      <span>Completed</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background-color: #f59e0b;"></span>
      <span>In Progress</span>
    </div>
  </div>
</div>

<style>
  .trend-chart {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  canvas {
    display: block;
  }

  .chart-legend {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text);
  }

  .legend-color {
    width: 20px;
    height: 3px;
    border-radius: 2px;
  }
</style>