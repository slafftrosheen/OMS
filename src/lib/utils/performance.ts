// src/lib/utils/performance.ts
/**
 * Performance monitoring utilities
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  start(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * End timing and record metric
   */
  end(name: string): number | null {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`No start time found for metric: ${name}`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now()
    });

    this.timers.delete(name);

    // Log slow operations (> 1 second)
    if (duration > 1000) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.name === name);
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(name: string): number | null {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return null;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  /**
   * Export metrics as JSON
   */
  export(): string {
    return JSON.stringify({
      metrics: this.metrics,
      summary: this.getSummary()
    }, null, 2);
  }

  /**
   * Get performance summary
   */
  getSummary(): Record<string, { count: number; avg: number; min: number; max: number }> {
    const summary: Record<string, { count: number; avg: number; min: number; max: number }> = {};

    this.metrics.forEach(metric => {
      if (!summary[metric.name]) {
        summary[metric.name] = {
          count: 0,
          avg: 0,
          min: Infinity,
          max: -Infinity
        };
      }

      const s = summary[metric.name];
      s.count++;
      s.min = Math.min(s.min, metric.duration);
      s.max = Math.max(s.max, metric.duration);
      s.avg = ((s.avg * (s.count - 1)) + metric.duration) / s.count;
    });

    return summary;
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

// Helper function to measure async operations
export async function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  perfMonitor.start(name);
  try {
    return await fn();
  } finally {
    perfMonitor.end(name);
  }
}

// Log performance summary on page unload (development only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.addEventListener('beforeunload', () => {
    const summary = perfMonitor.getSummary();
    if (Object.keys(summary).length > 0) {
      console.log('Performance Summary:', summary);
    }
  });
}