import { query, queryOne } from '../client';

export interface CandleRow {
  symbol: string;
  session_date: string; // YYYY-MM-DD
  ts: Date;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  confirmed: boolean;
  source: string;
}

export interface UpsertCandleInput {
  symbol: string;
  sessionDate: string;
  ts: Date;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** Whether the two-source reconciliation agreed within tolerance. Default true (single-source case). */
  confirmed?: boolean;
  source?: string;
}

/**
 * Idempotent by (symbol, session_date): reprocessing the same session
 * revises that day's bar in place (a same-day intraday update, or a
 * corrected re-ingest) rather than creating a duplicate row. Candle
 * writes never generate events on their own — the ingestion worker
 * (Section 5) runs the significance engine over the result separately,
 * and only when `confirmed` is true.
 */
export async function upsertCandle(input: UpsertCandleInput): Promise<void> {
  await query(
    `INSERT INTO candles (symbol, session_date, ts, o, h, l, c, v, confirmed, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (symbol, session_date)
     DO UPDATE SET ts = $3, o = $4, h = $5, l = $6, c = $7, v = $8, confirmed = $9, source = $10`,
    [
      input.symbol,
      input.sessionDate,
      input.ts,
      input.o,
      input.h,
      input.l,
      input.c,
      input.v,
      input.confirmed ?? true,
      input.source ?? 'unknown',
    ],
  );
}

export async function getRecentCandles(symbol: string, days: number): Promise<CandleRow[]> {
  const rows = await query<CandleRow>(
    `SELECT * FROM (
       SELECT * FROM candles WHERE symbol = $1 ORDER BY session_date DESC LIMIT $2
     ) recent
     ORDER BY session_date ASC`,
    [symbol, days],
  );
  return rows;
}

/** Most recent session_date already ingested for a symbol, or null if none yet — the backfill watermark. */
export async function getLatestCandleDate(symbol: string): Promise<string | null> {
  const row = await queryOne<{ session_date: string }>(
    'SELECT max(session_date) AS session_date FROM candles WHERE symbol = $1',
    [symbol],
  );
  return row?.session_date ?? null;
}

export async function getCandle(symbol: string, sessionDate: string): Promise<CandleRow | null> {
  return queryOne<CandleRow>('SELECT * FROM candles WHERE symbol = $1 AND session_date = $2', [
    symbol,
    sessionDate,
  ]);
}

export async function getCandlesForDate(sessionDate: string): Promise<CandleRow[]> {
  return query<CandleRow>('SELECT * FROM candles WHERE session_date = $1 ORDER BY symbol', [sessionDate]);
}

/**
 * Every candle where two-source reconciliation (worker/reconcile.ts)
 * disagreed past tolerance — regardless of how long ago, since the
 * replay dataset's dates drift with "now" (Section 1) and the single
 * seeded conflict (worker/sources.ts) won't reliably land on "today" by
 * the time anyone's looking. This is the system panel's durable record
 * of "the conflict-detection machinery actually ran," not just today's
 * freshness badge on the symbol page.
 */
export async function getUnconfirmedCandles(): Promise<CandleRow[]> {
  return query<CandleRow>('SELECT * FROM candles WHERE confirmed = false ORDER BY session_date DESC');
}

/** How many distinct sessions have been ingested so far — the system panel's "day X of the replay" proxy. */
export async function countIngestedSessionDates(): Promise<number> {
  const row = await queryOne<{ count: number }>('SELECT count(DISTINCT session_date)::int AS count FROM candles');
  return row?.count ?? 0;
}
