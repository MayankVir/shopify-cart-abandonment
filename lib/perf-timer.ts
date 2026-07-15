/**
 * Lightweight latency instrumentation. Works in both server actions (Node)
 * and client components (browser) — both environments expose `performance.now()`.
 */
export function startTimer() {
  const start = performance.now();
  return function elapsed(label: string, meta?: Record<string, unknown>): number {
    const ms = Math.round(performance.now() - start);
    console.info(`[perf] ${label}`, JSON.stringify({ ms, ...meta }));
    return ms;
  };
}
