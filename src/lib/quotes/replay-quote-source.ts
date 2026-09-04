import type { QuoteSource } from './quote-source';
import type { Candle, Tick } from './types';
import type { ReplayClock } from '../time/replay-clock';
import { loadOrGenerateDataset } from '../../seed/dataset';
import { buildTickTimeline, type TimelineEvent } from './tick-timeline';

export interface ReplayQuoteSourceOptions {
  /** Simulated seconds streamed per real second. */
  speed: number;
  /** Intraday points synthesized per daily bar. Default 8. */
  ticksPerSession?: number;
}

/**
 * Streams the seeded dataset as if it were live: real-time-shaped ticks,
 * paced by `speed`, driving the paired ReplayClock forward as it goes.
 * Deterministic — the same seed and speed always produce the same tick
 * sequence at the same simulated timestamps; only wall-clock pacing
 * between them varies with host performance.
 */
export class ReplayQuoteSource implements QuoteSource {
  private readonly clock: ReplayClock;
  private readonly speed: number;
  private readonly ticksPerSession: number;

  constructor(clock: ReplayClock, options: ReplayQuoteSourceOptions) {
    if (options.speed <= 0) throw new Error('ReplayQuoteSource speed must be > 0');
    this.clock = clock;
    this.speed = options.speed;
    this.ticksPerSession = options.ticksPerSession ?? 8;
  }

  async getHistory(symbol: string, days: number): Promise<Candle[]> {
    const dataset = loadOrGenerateDataset();
    return dataset.candles
      .filter((c) => c.symbol === symbol)
      .slice(-days)
      .map((c) => ({ ...c, ts: new Date(c.ts) }));
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): () => void {
    const dataset = loadOrGenerateDataset();
    const timeline: TimelineEvent[] = buildTickTimeline(dataset, symbols, this.ticksPerSession);

    let index = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (stopped || index >= timeline.length) return;
      const event = timeline[index]!;
      const simDelayMs = Math.max(0, event.ts.getTime() - this.clock.now().getTime());
      const realDelayMs = simDelayMs / this.speed;

      timer = setTimeout(() => {
        this.clock._advanceTo(event.ts);
        onTick(event.tick);
        index += 1;
        scheduleNext();
      }, realDelayMs);
    };

    scheduleNext();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }
}
