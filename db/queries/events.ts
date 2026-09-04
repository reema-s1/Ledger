import { query, queryOne } from '../client';

export interface EventRow {
  id: number;
  symbol: string;
  ts: Date;
  kind: string;
  payload: Record<string, unknown>;
  significance: number | null;
  explanation: string | null;
  supersedes: number | null;
  created_at: Date;
}

export interface AppendEventInput {
  symbol: string;
  ts: Date;
  kind: string;
  payload?: Record<string, unknown>;
  significance?: number | null;
  explanation?: string | null;
  supersedes?: number | null;
}

/**
 * Appends one event. Idempotent on (symbol, ts, kind): reprocessing the
 * same underlying candle/tick does not duplicate the event it already
 * produced — returns null in that case rather than the (non-existent) new
 * row. A correction is a *new* event with `supersedes` pointing at the
 * prior id, never a rewrite of that row (events has no UPDATE path — see
 * the append-only trigger in db/migrations/0001_init.sql).
 */
export async function appendEvent(input: AppendEventInput): Promise<EventRow | null> {
  return queryOne<EventRow>(
    `INSERT INTO events (symbol, ts, kind, payload, significance, explanation, supersedes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (symbol, ts, kind) DO NOTHING
     RETURNING *`,
    [
      input.symbol,
      input.ts,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.significance ?? null,
      input.explanation ?? null,
      input.supersedes ?? null,
    ],
  );
}

/** Events for one symbol strictly after `sinceEventId`, oldest first. */
export async function getEventsSince(symbol: string, sinceEventId: number): Promise<EventRow[]> {
  return query<EventRow>(
    'SELECT * FROM events WHERE symbol = $1 AND id > $2 ORDER BY id ASC',
    [symbol, sinceEventId],
  );
}

/** Events for many symbols, each after its own cursor. Still oldest-first per symbol. */
export async function getEventsSinceForSymbols(
  cursors: { symbol: string; sinceEventId: number }[],
): Promise<EventRow[]> {
  if (cursors.length === 0) return [];
  const symbols = cursors.map((c) => c.symbol);
  const sinceIds = cursors.map((c) => c.sinceEventId);
  return query<EventRow>(
    `SELECT e.* FROM events e
     JOIN unnest($1::text[], $2::bigint[]) AS c(symbol, since_id)
       ON e.symbol = c.symbol AND e.id > c.since_id
     ORDER BY e.symbol, e.id ASC`,
    [symbols, sinceIds],
  );
}

export async function getEvent(id: number): Promise<EventRow | null> {
  return queryOne<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
}

/**
 * Recent price-move events for a symbol that nothing has superseded yet
 * — candidates for the stale-alert resolution check (Section 5): did the
 * move that triggered this fully or mostly reverse since?
 */
export async function getUnresolvedMoveEvents(symbol: string, limit = 5): Promise<EventRow[]> {
  return query<EventRow>(
    `SELECT e.* FROM events e
     WHERE e.symbol = $1
       AND e.kind IN ('residual_move', 'structural_break')
       AND NOT EXISTS (SELECT 1 FROM events r WHERE r.supersedes = e.id)
     ORDER BY e.id DESC
     LIMIT $2`,
    [symbol, limit],
  );
}

/** Most recent events for a symbol, regardless of any cursor — for the symbol detail page. */
export async function getRecentEventsForSymbol(symbol: string, limit = 20): Promise<EventRow[]> {
  return query<EventRow>('SELECT * FROM events WHERE symbol = $1 ORDER BY id DESC LIMIT $2', [
    symbol,
    limit,
  ]);
}

/**
 * Symbols with a structural_break or residual_move since `sinceIso`,
 * mapped to the more severe kind seen ('structural_break' wins) — the
 * cluster view's "which node is drifting out of its group" signal.
 */
export async function getRecentlyMovedSymbols(sinceIso: string): Promise<Map<string, string>> {
  const rows = await query<{ symbol: string; kind: string }>(
    `SELECT symbol, kind FROM events
     WHERE kind IN ('structural_break', 'residual_move') AND ts >= $1`,
    [sinceIso],
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    const existing = out.get(r.symbol);
    if (!existing || r.kind === 'structural_break') out.set(r.symbol, r.kind);
  }
  return out;
}

/**
 * True if a symbol already has a 'reassurance' event at or after
 * `sinceIso` — the dedup check so a multi-day market-wide dip doesn't
 * emit a near-identical "the market did this" card every single day.
 */
export async function hasRecentEventOfKind(symbol: string, kind: string, sinceIso: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM events WHERE symbol = $1 AND kind = $2 AND ts >= $3) AS exists`,
    [symbol, kind, sinceIso],
  );
  return row?.exists ?? false;
}

/**
 * Flagged events (residual_move / structural_break) older than
 * `maxTsIso` with no 'resolution' event referencing them yet — the
 * resolution job's work queue. Purely retrospective: this never looks at
 * whether an event *should* have fired, only what happened after.
 */
export async function getEventsNeedingResolution(maxTsIso: string, limit = 200): Promise<EventRow[]> {
  return query<EventRow>(
    `SELECT e.* FROM events e
     WHERE e.kind IN ('residual_move', 'structural_break')
       AND e.ts <= $1
       AND NOT EXISTS (SELECT 1 FROM events r WHERE r.supersedes = e.id AND r.kind = 'resolution')
     ORDER BY e.id ASC
     LIMIT $2`,
    [maxTsIso, limit],
  );
}

/** One symbol's events since a date, most recent first — Ask the log's single-symbol retrieval path. */
export async function getEventsForSymbolSince(symbol: string, sinceIso: string, limit = 20): Promise<EventRow[]> {
  return query<EventRow>(
    'SELECT * FROM events WHERE symbol = $1 AND ts >= $2 ORDER BY ts DESC LIMIT $3',
    [symbol, sinceIso, limit],
  );
}

/**
 * Events across several symbols since a date, most-significant first
 * (falling back to recency for events with no significance score, e.g.
 * corporate actions and reassurance) — Ask the log's whole-watchlist
 * retrieval path, so "what happened" leads with the thing that actually
 * mattered most, not just whatever happened most recently.
 */
export async function getEventsForSymbolsSince(symbols: string[], sinceIso: string, limit = 20): Promise<EventRow[]> {
  if (symbols.length === 0) return [];
  return query<EventRow>(
    `SELECT * FROM events WHERE symbol = ANY($1::text[]) AND ts >= $2
     ORDER BY significance DESC NULLS LAST, ts DESC
     LIMIT $3`,
    [symbols, sinceIso, limit],
  );
}

/** Outcome counts across the most recent N resolution events — the calibration line ("14 held, 6 reverted"). */
export async function getResolutionStats(limit = 20): Promise<{ held: number; partially_reverted: number; reverted: number; total: number }> {
  const rows = await query<{ outcome: string }>(
    `SELECT payload->>'outcome' AS outcome FROM events
     WHERE kind = 'resolution'
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  const stats = { held: 0, partially_reverted: 0, reverted: 0, total: rows.length };
  for (const r of rows) {
    if (r.outcome === 'held') stats.held++;
    else if (r.outcome === 'partially_reverted') stats.partially_reverted++;
    else if (r.outcome === 'reverted') stats.reverted++;
  }
  return stats;
}
