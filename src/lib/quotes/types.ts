/** A daily OHLCV bar, as actually printed (not corporate-action adjusted). */
export interface Candle {
  symbol: string;
  /** IST session date, YYYY-MM-DD. */
  sessionDate: string;
  /** Bar close timestamp. */
  ts: Date;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** A single real-time price update. */
export interface Tick {
  symbol: string;
  ts: Date;
  price: number;
  /** Cumulative traded volume for the session as of this tick. */
  volume: number;
  source: string;
}
