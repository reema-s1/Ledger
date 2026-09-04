import type { Candle, Tick } from './types';

/**
 * The only way any module gets quotes. Hard rule: no other module may call
 * a market-data API or fetch() directly — everything goes through a
 * QuoteSource, obtained from the DATA_MODE-aware factory in `../data-mode`.
 */
export interface QuoteSource {
  /**
   * Subscribe to real-time ticks for the given symbols. Returns an
   * unsubscribe function.
   */
  subscribe(symbols: string[], onTick: (tick: Tick) => void): () => void;

  /** Most recent `days` daily candles for a symbol, oldest first. */
  getHistory(symbol: string, days: number): Promise<Candle[]>;
}
