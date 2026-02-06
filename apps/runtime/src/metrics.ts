/**
 * Simple metrics tracking for runtime observability.
 * Tracks counts, timings, and errors for key operations.
 */

interface OperationMetrics {
  count: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

const metrics: Record<string, OperationMetrics> = {};

/**
 * Initialize metrics for an operation type.
 */
function ensureMetric(operation: string): OperationMetrics {
  if (!metrics[operation]) {
    metrics[operation] = {
      count: 0,
      successCount: 0,
      failureCount: 0,
      totalDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
      lastError: null,
      lastErrorAt: null,
    };
  }
  return metrics[operation];
}

/**
 * Record a successful operation with timing.
 */
export function recordSuccess(operation: string, durationMs: number): void {
  const m = ensureMetric(operation);
  m.count++;
  m.successCount++;
  m.totalDurationMs += durationMs;
  m.minDurationMs = Math.min(m.minDurationMs, durationMs);
  m.maxDurationMs = Math.max(m.maxDurationMs, durationMs);
}

/**
 * Record a failed operation with error message.
 */
export function recordFailure(
  operation: string,
  durationMs: number,
  error: string,
): void {
  const m = ensureMetric(operation);
  m.count++;
  m.failureCount++;
  m.totalDurationMs += durationMs;
  m.minDurationMs = Math.min(m.minDurationMs, durationMs);
  m.maxDurationMs = Math.max(m.maxDurationMs, durationMs);
  m.lastError = error;
  m.lastErrorAt = Date.now();
}

/**
 * Get all metrics (for /metrics endpoint).
 */
export function getAllMetrics(): Record<string, OperationMetrics> {
  return { ...metrics };
}

/**
 * Get metrics for a specific operation.
 */
export function getMetric(operation: string): OperationMetrics | null {
  return metrics[operation] ?? null;
}

/**
 * Reset all metrics (useful for testing or after restart).
 */
export function resetMetrics(): void {
  for (const key of Object.keys(metrics)) {
    delete metrics[key];
  }
}

/**
 * Format metrics as Prometheus-style text.
 */
export function formatPrometheusMetrics(): string {
  const lines: string[] = [];
  const timestamp = Date.now();

  for (const [operation, m] of Object.entries(metrics)) {
    const avg = m.count > 0 ? m.totalDurationMs / m.count : 0;
    const successRate = m.count > 0 ? m.successCount / m.count : 0;

    // Counter: total requests
    lines.push(`# HELP runtime_operation_total Total number of operations`);
    lines.push(`# TYPE runtime_operation_total counter`);
    lines.push(
      `runtime_operation_total{operation="${operation}"} ${m.count} ${timestamp}`,
    );

    // Counter: successes
    lines.push(`# HELP runtime_operation_success Successful operations`);
    lines.push(`# TYPE runtime_operation_success counter`);
    lines.push(
      `runtime_operation_success{operation="${operation}"} ${m.successCount} ${timestamp}`,
    );

    // Counter: failures
    lines.push(`# HELP runtime_operation_failure Failed operations`);
    lines.push(`# TYPE runtime_operation_failure counter`);
    lines.push(
      `runtime_operation_failure{operation="${operation}"} ${m.failureCount} ${timestamp}`,
    );

    // Gauge: success rate
    lines.push(`# HELP runtime_operation_success_rate Success rate (0-1)`);
    lines.push(`# TYPE runtime_operation_success_rate gauge`);
    lines.push(
      `runtime_operation_success_rate{operation="${operation}"} ${successRate.toFixed(3)} ${timestamp}`,
    );

    // Gauge: average duration
    lines.push(
      `# HELP runtime_operation_duration_avg Average duration in milliseconds`,
    );
    lines.push(`# TYPE runtime_operation_duration_avg gauge`);
    lines.push(
      `runtime_operation_duration_avg{operation="${operation}"} ${avg.toFixed(2)} ${timestamp}`,
    );

    // Gauge: min duration
    lines.push(`# HELP runtime_operation_duration_min Minimum duration`);
    lines.push(`# TYPE runtime_operation_duration_min gauge`);
    lines.push(
      `runtime_operation_duration_min{operation="${operation}"} ${m.minDurationMs === Infinity ? 0 : m.minDurationMs} ${timestamp}`,
    );

    // Gauge: max duration
    lines.push(`# HELP runtime_operation_duration_max Maximum duration`);
    lines.push(`# TYPE runtime_operation_duration_max gauge`);
    lines.push(
      `runtime_operation_duration_max{operation="${operation}"} ${m.maxDurationMs} ${timestamp}`,
    );
  }

  return lines.join("\n") + "\n";
}
