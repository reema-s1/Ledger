/**
 * Alert accountability: retrospectively grades every past flagged event
 * (residual_move / structural_break) that's old enough and hasn't been
 * graded yet. Purely additive and purely retrospective — this file never
 * touches significance thresholds, never changes what counts as an
 * alert, and never mutates an original event (a new 'resolution' event
 * references it via `supersedes`, same append-only pattern as everything
 * else in this log). Deliberately isolated from worker/ingest.ts and
 * worker/stale-alerts.ts — cutting this file entirely removes the
 * feature and nothing else.
 */

import { getEventsNeedingResolution, appendEvent, type EventRow } from '../db/queries/events';
import { getRecentCandles } from '../db/queries/candles';
import { listCorporateActions, type CorporateActionRow } from '../db/queries/corporate-actions';
import { adjustBarsForCorporateActions, type CorporateAction } from './corporate-actions';
import { gradeResolution } from '../src/resolution/grade';

const DEFAULT_MIN_AGE_SESSIONS = 5;
const HISTORY_DAYS = 130;

function toActions(rows: CorporateActionRow[]): CorporateAction[] {
  return rows.map((r) => ({ exDate: r.ex_date, type: r.type, ratio: r.ratio }));
}

/** Approximates N trading sessions as calendar days, padded for weekends — same spirit as the reassurance dedup window. */
function sessionsToCalendarDays(sessions: number): number {
  return Math.ceil(sessions * 1.5) + 2;
}

async function currentAdjustedClose(symbol: string): Promise<number | null> {
  const [candles, actionRows] = await Promise.all([
    getRecentCandles(symbol, HISTORY_DAYS),
    listCorporateActions(symbol),
  ]);
  if (candles.length === 0) return null;
  const raw = candles.map((c) => ({ sessionDate: c.session_date, close: c.c, volume: c.v }));
  const adjusted = adjustBarsForCorporateActions(raw, toActions(actionRows));
  return adjusted[adjusted.length - 1]!.close;
}

export interface ResolutionJobResult {
  graded: number;
  skipped: number;
}

/**
 * Grades every eligible event once, then returns. Meant to be run
 * periodically (`npm run resolve-alerts`, a cron, or manually) — not a
 * long-lived loop like worker/index.ts, since there's no reason to poll
 * faster than once every session close.
 */
export async function runResolutionJob(minAgeSessions = DEFAULT_MIN_AGE_SESSIONS): Promise<ResolutionJobResult> {
  const cutoff = new Date(Date.now() - sessionsToCalendarDays(minAgeSessions) * 24 * 60 * 60 * 1000);
  const candidates = await getEventsNeedingResolution(cutoff.toISOString());

  let graded = 0;
  let skipped = 0;

  for (const original of candidates) {
    const outcome = await gradeOne(original);
    if (outcome) graded++;
    else skipped++;
  }

  return { graded, skipped };
}

async function gradeOne(original: EventRow): Promise<boolean> {
  const payload = original.payload as { baselineClose?: number; triggerClose?: number };
  if (typeof payload.baselineClose !== 'number' || typeof payload.triggerClose !== 'number') return false;

  const currentClose = await currentAdjustedClose(original.symbol);
  if (currentClose === null) return false;

  const kindLabel = original.kind === 'structural_break' ? 'structural break' : 'unusual move';
  const grade = gradeResolution(original.symbol, kindLabel, payload.baselineClose, payload.triggerClose, currentClose);

  // Floored to the day, not the exact instant — so running the job twice
  // in the same day is idempotent via the (symbol, ts, kind) unique
  // constraint, same as everything else in the log, instead of relying
  // solely on the `supersedes` NOT EXISTS check to avoid a double-grade
  // if two runs' candidate queries overlap.
  const gradedAtDay = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);

  const appended = await appendEvent({
    symbol: original.symbol,
    ts: gradedAtDay,
    kind: 'resolution',
    payload: { outcome: grade.outcome, retainedFraction: grade.retainedFraction, originalEventId: original.id },
    supersedes: original.id,
    explanation: grade.explanation,
  });

  return appended !== null;
}
