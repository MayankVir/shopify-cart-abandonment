export interface TimingStep {
  step: string;
  ms: number;
}

export interface TimingReport {
  totalMs: number;
  steps: TimingStep[];
}

/** Collects step durations and writes one `[timing]` line when finished. */
export function startTiming(scope: string) {
  const startedAt = Date.now();
  const steps: TimingStep[] = [];

  return {
    async measure<T>(step: string, run: () => T | Promise<T>): Promise<T> {
      const started = Date.now();
      try {
        return await run();
      } finally {
        steps.push({ step, ms: Date.now() - started });
      }
    },
    measureSync<T>(step: string, run: () => T): T {
      const started = Date.now();
      try {
        return run();
      } finally {
        steps.push({ step, ms: Date.now() - started });
      }
    },
    add(step: string, ms: number) {
      steps.push({ step, ms });
    },
    snapshot(): TimingReport {
      return {
        totalMs: Date.now() - startedAt,
        steps: [...steps],
      };
    },
    finish(extra?: Record<string, unknown>): TimingReport {
      const report = this.snapshot();
      console.info(
        `[timing] ${scope}`,
        JSON.stringify({ ...report, ...extra }),
      );
      return report;
    },
  };
}

export type TimingLog = ReturnType<typeof startTiming>;
