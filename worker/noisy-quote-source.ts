import type { QuoteSource } from '../src/lib/quotes/quote-source';
import type { Candle, Tick } from '../src/lib/quotes/types';
import { seededRng, gaussian } from '../src/seed/rng';

export interface DeliberateConflict {
  symbol: string;
  sessionDate: string;
  /** Fractional offset the secondary reports vs primary, e.g. 0.05 = 5% higher. */
  offsetFraction: number;
}

/**
 * Wraps a QuoteSource to stand in for "a second vendor" in replay/demo
 * mode: small deterministic jitter on every quote (real vendors never
 * agree to the paisa) plus zero or more deliberately large disagreements,
 * so two-source conflict detection has something real to catch. In live
 * mode a genuine second vendor integration would replace this — same
 * documented-gap pattern as src/lib/quotes/live-provider-stub.ts.
 */
export class NoisyQuoteSource implements QuoteSource {
  constructor(
    private readonly inner: QuoteSource,
    private readonly sourceLabel: string,
    private readonly jitterFraction = 0.0015,
    private readonly deliberateConflicts: DeliberateConflict[] = [],
  ) {}

  private noiseFor(symbol: string, key: string, sessionDate: string): number {
    const conflict = this.deliberateConflicts.find(
      (c) => c.symbol === symbol && c.sessionDate === sessionDate,
    );
    if (conflict) return conflict.offsetFraction;
    const rng = seededRng(`${this.sourceLabel}:${key}`);
    return gaussian(rng) * this.jitterFraction;
  }

  async getHistory(symbol: string, days: number): Promise<Candle[]> {
    const candles = await this.inner.getHistory(symbol, days);
    return candles.map((c) => {
      const mult = 1 + this.noiseFor(symbol, `${symbol}:${c.sessionDate}`, c.sessionDate);
      return { ...c, o: c.o * mult, h: c.h * mult, l: c.l * mult, c: c.c * mult, symbol: c.symbol };
    });
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): () => void {
    return this.inner.subscribe(symbols, (tick) => {
      const sessionDate = tick.ts.toISOString().slice(0, 10);
      const mult = 1 + this.noiseFor(tick.symbol, `${tick.symbol}:${tick.ts.toISOString()}`, sessionDate);
      onTick({ ...tick, price: tick.price * mult, source: this.sourceLabel });
    });
  }
}
