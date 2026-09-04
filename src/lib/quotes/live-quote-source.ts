import type { QuoteSource } from './quote-source';
import type { Candle, Tick } from './types';

export interface LiveQuoteFetcher {
  fetchQuote(symbol: string): Promise<{ price: number; volume: number; ts: Date }>;
  fetchHistory(symbol: string, days: number): Promise<Candle[]>;
}

export interface LiveQuoteSourceOptions {
  fetcher: LiveQuoteFetcher;
  pollIntervalMs?: number;
}

/**
 * Polls a real market-data provider. The actual HTTP/WebSocket integration
 * is injected as a `LiveQuoteFetcher` (see `./live-provider-stub.ts` for the
 * placeholder used until a real provider is wired up) so this class only
 * owns polling/backpressure/error-handling — not any particular vendor's
 * API shape.
 */
export class LiveQuoteSource implements QuoteSource {
  constructor(private readonly opts: LiveQuoteSourceOptions) {}

  async getHistory(symbol: string, days: number): Promise<Candle[]> {
    return this.opts.fetcher.fetchHistory(symbol, days);
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): () => void {
    const intervalMs = this.opts.pollIntervalMs ?? 5000;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopped) return;
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const q = await this.opts.fetcher.fetchQuote(symbol);
            onTick({ symbol, ts: q.ts, price: q.price, volume: q.volume, source: 'live' });
          } catch (err) {
            console.error(`[LiveQuoteSource] fetch failed for ${symbol}:`, (err as Error).message);
          }
        }),
      );
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }
}
