import { query } from '../client';

export interface IngestStatusRow {
  symbol: string;
  session_date: string | null;
  outcome: string;
  checked_at: Date;
}

/**
 * Upserts the most recent ingestion outcome for a symbol — one row per
 * symbol, always overwritten with the latest cycle's result. This is a
 * status mirror for the system panel, not a history; the event log
 * (db/queries/events.ts) is still the durable record of anything that
 * actually happened.
 */
export async function upsertIngestStatus(symbol: string, sessionDate: string | null, outcome: string): Promise<void> {
  await query(
    `INSERT INTO ingest_status (symbol, session_date, outcome, checked_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (symbol) DO UPDATE SET session_date = $2, outcome = $3, checked_at = now()`,
    [symbol, sessionDate, outcome],
  );
}

/** Every symbol's latest known ingestion outcome — the system panel's "why nothing happened" table. */
export async function listIngestStatuses(): Promise<IngestStatusRow[]> {
  return query<IngestStatusRow>('SELECT * FROM ingest_status ORDER BY symbol');
}
