/**
 * Metrics Collection
 *
 * Collect and expose application metrics.
 */

export interface MetricOptions {
  name: string;
  help: string;
  labels?: string[];
}

export interface CounterMetric extends MetricOptions {
  type: 'counter';
}

export interface GaugeMetric extends MetricOptions {
  type: 'gauge';
}

export interface HistogramMetric extends MetricOptions {
  type: 'histogram';
  buckets?: number[];
}

export type MetricType = CounterMetric | GaugeMetric | HistogramMetric;

interface MetricValue {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface HistogramValue {
  count: number;
  sum: number;
  buckets: Map<number, number>;
  labels: Record<string, string>;
}

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Counter metric - only increases
 */
export class Counter {
  private values = new Map<string, MetricValue>();

  constructor(private options: CounterMetric) {}

  /**
   * Increment the counter
   */
  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelKey(labels);
    const current = this.values.get(key);

    if (current) {
      current.value += value;
      current.timestamp = Date.now();
    } else {
      this.values.set(key, {
        value,
        labels,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get current value
   */
  get(labels: Record<string, string> = {}): number {
    const key = this.labelKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * Get all values for export
   */
  collect(): { metric: CounterMetric; values: MetricValue[] } {
    return {
      metric: this.options,
      values: Array.from(this.values.values()),
    };
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

/**
 * Gauge metric - can increase or decrease
 */
export class Gauge {
  private values = new Map<string, MetricValue>();

  constructor(private options: GaugeMetric) {}

  /**
   * Set gauge value
   */
  set(value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    this.values.set(key, {
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Increment gauge
   */
  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = this.labelKey(labels);
    const current = this.values.get(key);
    this.set((current?.value ?? 0) + value, labels);
  }

  /**
   * Decrement gauge
   */
  dec(labels: Record<string, string> = {}, value = 1): void {
    this.inc(labels, -value);
  }

  /**
   * Get current value
   */
  get(labels: Record<string, string> = {}): number {
    const key = this.labelKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  /**
   * Reset gauge
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * Get all values for export
   */
  collect(): { metric: GaugeMetric; values: MetricValue[] } {
    return {
      metric: this.options,
      values: Array.from(this.values.values()),
    };
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

/**
 * Histogram metric - for measuring distributions
 */
export class Histogram {
  private values = new Map<string, HistogramValue>();
  private buckets: number[];

  constructor(private options: HistogramMetric) {
    this.buckets = options.buckets ?? DEFAULT_HISTOGRAM_BUCKETS;
  }

  /**
   * Observe a value
   */
  observe(value: number, labels: Record<string, string> = {}): void {
    const key = this.labelKey(labels);
    let histogram = this.values.get(key);

    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(this.buckets.map((b) => [b, 0])),
        labels,
      };
      this.values.set(key, histogram);
    }

    histogram.count++;
    histogram.sum += value;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  /**
   * Time a function and observe the duration
   */
  async time<T>(
    fn: () => T | Promise<T>,
    labels: Record<string, string> = {}
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = (performance.now() - start) / 1000;
      this.observe(duration, labels);
    }
  }

  /**
   * Start a timer
   */
  startTimer(labels: Record<string, string> = {}): () => void {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000;
      this.observe(duration, labels);
    };
  }

  /**
   * Reset histogram
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * Get all values for export
   */
  collect(): { metric: HistogramMetric; values: HistogramValue[] } {
    return {
      metric: { ...this.options, buckets: this.buckets },
      values: Array.from(this.values.values()),
    };
  }

  private labelKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  /**
   * Create or get a counter
   */
  counter(options: Omit<CounterMetric, 'type'>): Counter {
    const existing = this.counters.get(options.name);
    if (existing) return existing;

    const counter = new Counter({ ...options, type: 'counter' });
    this.counters.set(options.name, counter);
    return counter;
  }

  /**
   * Create or get a gauge
   */
  gauge(options: Omit<GaugeMetric, 'type'>): Gauge {
    const existing = this.gauges.get(options.name);
    if (existing) return existing;

    const gauge = new Gauge({ ...options, type: 'gauge' });
    this.gauges.set(options.name, gauge);
    return gauge;
  }

  /**
   * Create or get a histogram
   */
  histogram(options: Omit<HistogramMetric, 'type'>): Histogram {
    const existing = this.histograms.get(options.name);
    if (existing) return existing;

    const histogram = new Histogram({ ...options, type: 'histogram' });
    this.histograms.set(options.name, histogram);
    return histogram;
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const counter of this.counters.values()) {
      const { metric, values } = counter.collect();
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} counter`);

      for (const value of values) {
        const labels = this.formatLabels(value.labels);
        lines.push(`${metric.name}${labels} ${value.value}`);
      }
    }

    for (const gauge of this.gauges.values()) {
      const { metric, values } = gauge.collect();
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} gauge`);

      for (const value of values) {
        const labels = this.formatLabels(value.labels);
        lines.push(`${metric.name}${labels} ${value.value}`);
      }
    }

    for (const histogram of this.histograms.values()) {
      const { metric, values } = histogram.collect();
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} histogram`);

      for (const value of values) {
        const baseLabels = this.formatLabels(value.labels);

        for (const [bucket, count] of value.buckets) {
          const bucketLabel = value.labels
            ? `${baseLabels.slice(0, -1)},le="${bucket}"}`
            : `{le="${bucket}"}`;
          lines.push(`${metric.name}_bucket${bucketLabel} ${count}`);
        }

        const infLabel = value.labels
          ? `${baseLabels.slice(0, -1)},le="+Inf"}`
          : `{le="+Inf"}`;
        lines.push(`${metric.name}_bucket${infLabel} ${value.count}`);
        lines.push(`${metric.name}_sum${baseLabels} ${value.sum}`);
        lines.push(`${metric.name}_count${baseLabels} ${value.count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      counters: Array.from(this.counters.values()).map((c) => c.collect()),
      gauges: Array.from(this.gauges.values()).map((g) => g.collect()),
      histograms: Array.from(this.histograms.values()).map((h) => h.collect()),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
    for (const gauge of this.gauges.values()) {
      gauge.reset();
    }
    for (const histogram of this.histograms.values()) {
      histogram.reset();
    }
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
  }
}

// Default registry
let defaultRegistry: MetricsRegistry | null = null;

/**
 * Get the default metrics registry
 */
export function getMetrics(): MetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new MetricsRegistry();
  }
  return defaultRegistry;
}
