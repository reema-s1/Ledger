/**
 * If a symbol's ingestion task is still running when the next poll comes
 * due, skip that tick rather than queuing a second concurrent run — and
 * log the gap instead of dropping it silently. `tick()` is exposed
 * separately from `start()` so the skip/catch-up logic is testable
 * without real timers.
 */

export interface IntervalRunnerOptions {
  label: string;
  intervalMs: number;
  task: () => Promise<void>;
  onSkip?: (label: string, skippedSoFar: number) => void;
  onCaughtUp?: (label: string, totalSkipped: number) => void;
  onError?: (label: string, err: unknown) => void;
}

export class IntervalRunner {
  private running = false;
  private skipped = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: IntervalRunnerOptions) {}

  async tick(): Promise<void> {
    if (this.running) {
      this.skipped += 1;
      this.opts.onSkip?.(this.opts.label, this.skipped);
      return;
    }
    this.running = true;
    try {
      await this.opts.task();
    } catch (err) {
      this.opts.onError?.(this.opts.label, err);
    } finally {
      this.running = false;
      if (this.skipped > 0) {
        this.opts.onCaughtUp?.(this.opts.label, this.skipped);
        this.skipped = 0;
      }
    }
  }

  start(): void {
    if (this.timer) return;
    // Fire immediately, then on the interval — otherwise a cold-tier
    // symbol (5 min default) sits doing nothing for a full interval after
    // every process start, including the very first one.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
