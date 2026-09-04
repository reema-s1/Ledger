/**
 * One symbol's full ingestion pipeline, per Section 5:
 *
 *   pull from QuoteSource -> adjust for corporate actions BEFORE any
 *   comparison -> write candle (idempotent) -> run significance engine
 *   -> append events above threshold
 *
 * plus the two-source conflict gate, corporate-action short-circuit, and
 * stale-alert resolution check. Backfills every session date newer than
 * what's already in `candles` for this symbol, one day at a time, in
 * chronological order — not just "the latest day" — so a worker
 * bootstrapping against history (or catching up after downtime) sees
 * each corporate action, conflict, and move on the actual day it
 * happened, using only data available as of that day (no lookahead).
 * A live, already-caught-up worker just processes the one new day each
 * poll finds.
 *
 * This is the only impure module in worker/ — everything it calls
 * (corporate-actions.ts, reconcile.ts, aggregate.ts, stale-alerts.ts,
 * src/significance) is a pure function.
 */

import type { Sources } from './sources';
import { adjustBarsForCorporateActions, isExDate, type CorporateAction, type RawBar } from './corporate-actions';
import { reconcileQuotes, type SourceQuote } from './reconcile';
import { checkForResolution } from './stale-alerts';
import { alignBars, computeClusterMeanReturns } from './aggregate';
import { listCorporateActions, type CorporateActionRow } from '../db/queries/corporate-actions';
import { upsertCandle, getLatestCandleDate } from '../db/queries/candles';
import { getLatestClusterForSymbol } from '../db/queries/clusters';
import { appendEvent, getUnresolvedMoveEvents, hasRecentEventOfKind } from '../db/queries/events';
import { evaluate } from '../src/significance/engine';
import { decompose } from '../src/significance/decompose';
import { DEFAULT_CONFIG } from '../src/significance/config';
import { checkReassurance } from '../src/significance/reassurance';
import type { SignificanceInput } from '../src/significance/types';
import { INDEX_SYMBOL } from '../src/seed/symbols';
import type { Candle } from '../src/lib/quotes/types';

const HISTORY_DAYS = 130;
const RECONCILE_TOLERANCE = 0.01; // 1% — beyond this, two sources count as disagreeing
// How far back to look before emitting a new reassurance card for a
// symbol — a multi-day market-wide dip shouldn't produce a near-identical
// "the market did this" card every single day.
const REASSURANCE_DEDUP_DAYS = 5;

export type IngestOutcome =
  | 'no-history'
  | 'unconfirmed'
  | 'corporate-action'
  | 'first-session'
  | 'no-cluster'
  | 'insufficient-cluster-history'
  | 'evaluated';

export interface IngestResult {
  symbol: string;
  sessionDate: string | null;
  outcome: IngestOutcome;
  significanceEvent: 'residual_move' | 'structural_break' | null;
  resolvedPriorEvent: boolean;
  /** A separate, lower-priority "the market explains this" card — only ever set when significanceEvent is null. */
  reassuranceEvent: boolean;
}

function toActions(rows: CorporateActionRow[]): CorporateAction[] {
  return rows.map((r) => ({ exDate: r.ex_date, type: r.type, ratio: r.ratio }));
}

function toRawBars(history: { sessionDate: string; c: number; v: number }[]): RawBar[] {
  return history.map((c) => ({ sessionDate: c.sessionDate, close: c.c, volume: c.v }));
}

function through(history: Candle[], sessionDate: string): Candle[] {
  return history.filter((c) => c.sessionDate <= sessionDate);
}

async function fetchAdjustedHistory(sources: Sources, symbol: string): Promise<{ raw: Candle[]; actions: CorporateAction[] } | null> {
  const [history, actionRows] = await Promise.all([
    sources.primary.getHistory(symbol, HISTORY_DAYS),
    listCorporateActions(symbol),
  ]);
  if (history.length === 0) return null;
  return { raw: history, actions: toActions(actionRows) };
}

async function resolvePriorEvents(symbol: string, currentClose: number, ts: Date): Promise<boolean> {
  const unresolved = await getUnresolvedMoveEvents(symbol, 5);
  let resolvedAny = false;
  for (const ev of unresolved) {
    const payload = ev.payload as { baselineClose?: number; triggerClose?: number };
    if (typeof payload.baselineClose !== 'number' || typeof payload.triggerClose !== 'number') continue;

    const check = checkForResolution(
      symbol,
      { baselineClose: payload.baselineClose, triggerClose: payload.triggerClose },
      currentClose,
    );
    if (!check.resolved) continue;

    const appended = await appendEvent({
      symbol,
      ts,
      kind: 'event_resolved',
      payload: { retracedFraction: check.retracedFraction, originalEventId: ev.id },
      supersedes: ev.id,
      explanation: check.explanation,
    });
    if (appended) resolvedAny = true;
  }
  return resolvedAny;
}

/** Processes every session date newer than what's already ingested for `symbol`. Returns one result per day processed. */
export async function ingestSymbol(symbol: string, sources: Sources): Promise<IngestResult[]> {
  const { primary, secondary } = sources;

  const [primaryHistory, secondaryHistory, actionRows, watermark] = await Promise.all([
    primary.getHistory(symbol, HISTORY_DAYS),
    secondary.getHistory(symbol, HISTORY_DAYS),
    listCorporateActions(symbol),
    getLatestCandleDate(symbol),
  ]);

  if (primaryHistory.length === 0) {
    return [{ symbol, sessionDate: null, outcome: 'no-history', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false }];
  }

  const actions = toActions(actionRows);
  const pendingDates = primaryHistory.map((c) => c.sessionDate).filter((d) => !watermark || d > watermark);
  if (pendingDates.length === 0) return [];

  const secondaryByDate = new Map(secondaryHistory.map((c) => [c.sessionDate, c]));

  // Cluster membership is looked up once per call, not once per backfilled
  // day — clusters recompute weekly (Section 4), so "the latest known
  // cluster" is an acceptable stand-in for "the cluster as of that day"
  // even during a multi-day backfill.
  const cluster = await getLatestClusterForSymbol(symbol);
  const peerSymbols = cluster ? cluster.members.filter((m) => m !== symbol) : [];
  const [indexFetched, peerFetched] = await Promise.all([
    fetchAdjustedHistory(sources, INDEX_SYMBOL),
    Promise.all(peerSymbols.map((peer) => fetchAdjustedHistory(sources, peer))),
  ]);

  const results: IngestResult[] = [];

  for (const sessionDate of pendingDates) {
    const historyThroughDay = through(primaryHistory, sessionDate);
    const todayRaw = historyThroughDay[historyThroughDay.length - 1]!;
    const secondaryToday = secondaryByDate.get(sessionDate) ?? null;

    // --- two-source conflict: never trust unconfirmed data downstream ---
    const primaryQuote: SourceQuote = { price: todayRaw.c, ts: todayRaw.ts, source: 'primary' };
    const secondaryQuote: SourceQuote | null = secondaryToday
      ? { price: secondaryToday.c, ts: secondaryToday.ts, source: 'secondary' }
      : null;
    const reconciled = reconcileQuotes(primaryQuote, secondaryQuote, RECONCILE_TOLERANCE);

    // Write the candle regardless — the raw print happened and belongs in
    // history — but tag it, so nothing downstream can mistake it for a
    // trustworthy live number without checking `confirmed` first.
    await upsertCandle({
      symbol,
      sessionDate,
      ts: todayRaw.ts,
      o: todayRaw.o,
      h: todayRaw.h,
      l: todayRaw.l,
      c: todayRaw.c,
      v: todayRaw.v,
      confirmed: reconciled.confirmed,
      source: 'primary',
    });

    if (!reconciled.confirmed) {
      console.warn(
        `[worker] ${symbol} ${sessionDate}: sources disagree by ${((reconciled.disagreementPct ?? 0) * 100).toFixed(2)}% — marked unconfirmed, skipping significance`,
      );
      results.push({ symbol, sessionDate, outcome: 'unconfirmed', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false });
      continue;
    }

    // --- corporate action on the ex-date: record it, never a price-move event today ---
    const action = isExDate(sessionDate, actions);
    if (action) {
      await appendEvent({
        symbol,
        ts: todayRaw.ts,
        kind: 'corporate_action',
        payload: { type: action.type, ratio: action.ratio },
        explanation: `${symbol} executed a 1:${action.ratio} ${action.type} today.`,
      });
      results.push({ symbol, sessionDate, outcome: 'corporate-action', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false });
      continue;
    }

    const symbolBars = adjustBarsForCorporateActions(toRawBars(historyThroughDay), actions);
    if (symbolBars.length < 2) {
      results.push({ symbol, sessionDate, outcome: 'first-session', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false });
      continue;
    }

    if (!cluster || !indexFetched || peerFetched.some((p) => p === null) || peerFetched.length === 0) {
      results.push({ symbol, sessionDate, outcome: cluster ? 'insufficient-cluster-history' : 'no-cluster', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false });
      continue;
    }

    const indexBarsRaw = adjustBarsForCorporateActions(toRawBars(through(indexFetched.raw, sessionDate)), []);
    const peerBarsRaw = (peerFetched as { raw: Candle[]; actions: CorporateAction[] }[]).map((p) =>
      adjustBarsForCorporateActions(toRawBars(through(p.raw, sessionDate)), p.actions),
    );

    const indexBars = alignBars(symbolBars, indexBarsRaw);
    const alignedPeerBars = peerBarsRaw.map((p) => alignBars(symbolBars, p)).filter((p): p is NonNullable<typeof p> => p !== null);

    if (!indexBars || alignedPeerBars.length === 0) {
      results.push({ symbol, sessionDate, outcome: 'insufficient-cluster-history', significanceEvent: null, resolvedPriorEvent: false, reassuranceEvent: false });
      continue;
    }

    const clusterReturns = computeClusterMeanReturns(symbolBars, alignedPeerBars);
    const clusterLabel = cluster.method === 'sector' ? cluster.cluster_id.replace('sector:', '') : 'its cluster';

    const input: SignificanceInput = {
      symbol,
      symbolBars: symbolBars.map((b) => ({ sessionDate: b.sessionDate, close: b.close, volume: b.volume })),
      indexBars,
      clusterReturns,
    };

    let significanceEvent: 'residual_move' | 'structural_break' | null = null;
    let reassuranceEvent = false;
    try {
      const result = evaluate(input, DEFAULT_CONFIG, clusterLabel);
      if (result) {
        const todayAdjusted = symbolBars[symbolBars.length - 1]!;
        const baselineAdjusted = symbolBars[symbolBars.length - 2]!;
        const appended = await appendEvent({
          symbol,
          ts: todayRaw.ts,
          kind: result.kind,
          payload: {
            decomposition: result.decomposition,
            baselineClose: baselineAdjusted.close,
            triggerClose: todayAdjusted.close,
          },
          significance: result.significance,
          explanation: result.explanation,
        });
        if (appended) significanceEvent = result.kind;
      } else {
        // Reassurance: a separate, lower-priority check that only ever
        // runs once the real engine has already stayed silent on this
        // exact decomposition. Never changes what the real engine
        // flags — decompose() is re-run here (not evaluate()) purely to
        // get the same numbers evaluate() already computed and discarded.
        const d = decompose(input, DEFAULT_CONFIG);
        const reassurance = checkReassurance(symbol, sessionDate, d);
        if (reassurance) {
          const dedupSince = new Date(todayRaw.ts.getTime() - REASSURANCE_DEDUP_DAYS * 24 * 60 * 60 * 1000);
          const alreadyRecent = await hasRecentEventOfKind(symbol, 'reassurance', dedupSince.toISOString());
          if (!alreadyRecent) {
            const appended = await appendEvent({
              symbol,
              ts: todayRaw.ts,
              kind: 'reassurance',
              payload: { observedReturn: reassurance.observedReturn, indexReturn: reassurance.indexReturn },
              explanation: reassurance.explanation,
            });
            if (appended) reassuranceEvent = true;
          }
        }
      }
    } catch (err) {
      console.warn(`[worker] ${symbol} ${sessionDate}: significance evaluation failed: ${(err as Error).message}`);
    }

    const resolvedPriorEvent = await resolvePriorEvents(symbol, symbolBars[symbolBars.length - 1]!.close, todayRaw.ts);

    results.push({ symbol, sessionDate, outcome: 'evaluated', significanceEvent, resolvedPriorEvent, reassuranceEvent });
  }

  return results;
}
