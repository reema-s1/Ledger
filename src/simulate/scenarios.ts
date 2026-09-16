/**
 * Failure drills for /simulate: made-up prices pushed through the same
 * pure functions the daily ingest uses, in the same order, so the page can
 * show what Ledger actually does when a feed misbehaves or the market
 * sells off. Nothing here reads or writes the database.
 *
 * runPipeline mirrors worker/ingest.ts's per-session decision sequence —
 * reconcile two sources -> short-circuit a corporate action's ex-date ->
 * adjust for splits -> put the stock on the index calendar -> cluster mean
 * -> evaluate -> reassurance only if evaluate stayed silent — minus the
 * writes. It calls the real modules rather than reimplementing any of
 * them; only the sequencing is repeated here, because ingest.ts interleaves
 * it with database calls that can't run in a browser.
 */

import { reconcileQuotes, RECONCILE_TOLERANCE, type ReconciledQuote } from '../../worker/reconcile';
import { adjustBarsForCorporateActions, isExDate, type CorporateAction, type RawBar } from '../../worker/corporate-actions';
import { alignBars, computeClusterMeanReturns, restrictToSharedDates } from '../../worker/aggregate';
import { classifyFreshness, classifyQuoteQuality, type FreshnessLevel, type QuoteQuality } from '../../worker/freshness';
import { evaluate } from '../significance/engine';
import { decompose } from '../significance/decompose';
import { DEFAULT_CONFIG } from '../significance/config';
import { checkReassurance, type ReassuranceResult } from '../significance/reassurance';
import type { Decomposition, SignificanceInput, SignificanceResult } from '../significance/types';
import { gaussian, seededRng } from '../seed/rng';

/** Deliberately not a listed NSE ticker, so no simulated number can be mistaken for a real stock's. */
export const SIM_SYMBOL = 'SAMPLE';
export const SIM_CLUSTER_LABEL = 'IT';

const HISTORY_SESSIONS = 90;
const PEER_COUNT = 3;
const LAST_SESSION = '2026-09-15';
const BASE_VOLUME = 1_000_000;

export type PipelineOutcome = 'unconfirmed' | 'corporate-action' | 'first-session' | 'insufficient-cluster-history' | 'evaluated';

export interface PipelineInput {
  symbol: string;
  clusterLabel: string;
  /** Raw, as-traded bars, oldest first; the last one is the session being processed. */
  stock: RawBar[];
  stockActions: CorporateAction[];
  /** Feed B's close for the same session, or null when there's no second source. */
  secondaryClose: number | null;
  index: RawBar[];
  peers: RawBar[][];
}

export interface PipelineResult {
  outcome: PipelineOutcome;
  sessionDate: string;
  reconciled: ReconciledQuote;
  action: CorporateAction | null;
  event: SignificanceResult | null;
  reassurance: ReassuranceResult | null;
  /** Present whenever scoring ran, flagged or not — the numbers behind a quiet result. */
  decomposition: Decomposition | null;
}

/** Daily bars are stamped at the 09:15 IST open, as Yahoo's are. */
function sessionTs(sessionDate: string): Date {
  return new Date(`${sessionDate}T03:45:00.000Z`);
}

export function runPipeline(input: PipelineInput): PipelineResult {
  const today = input.stock[input.stock.length - 1]!;
  const sessionDate = today.sessionDate;
  const ts = sessionTs(sessionDate);
  const base = { sessionDate, action: null, event: null, reassurance: null, decomposition: null };

  const reconciled = reconcileQuotes(
    { price: today.close, ts, source: 'primary' },
    input.secondaryClose === null ? null : { price: input.secondaryClose, ts, source: 'secondary' },
    RECONCILE_TOLERANCE,
  );
  if (!reconciled.confirmed) return { ...base, outcome: 'unconfirmed', reconciled };

  const action = isExDate(sessionDate, input.stockActions);
  if (action) return { ...base, outcome: 'corporate-action', reconciled, action };

  const symbolBars = adjustBarsForCorporateActions(input.stock, input.stockActions);
  if (symbolBars.length < 2) return { ...base, outcome: 'first-session', reconciled };

  const indexBarsRaw = adjustBarsForCorporateActions(input.index, []);
  const peerBarsRaw = input.peers.map((p) => adjustBarsForCorporateActions(p, []));

  const scoredBars = restrictToSharedDates(symbolBars, indexBarsRaw);
  const scoresToday = scoredBars.length >= 2 && scoredBars[scoredBars.length - 1]!.sessionDate === sessionDate;
  const indexBars = scoresToday ? alignBars(scoredBars, indexBarsRaw) : null;
  const alignedPeerBars = peerBarsRaw.map((p) => alignBars(scoredBars, p)).filter((p): p is NonNullable<typeof p> => p !== null);
  if (!indexBars || alignedPeerBars.length === 0) {
    return { ...base, outcome: 'insufficient-cluster-history', reconciled };
  }

  const significanceInput: SignificanceInput = {
    symbol: input.symbol,
    symbolBars: scoredBars.map((b) => ({ sessionDate: b.sessionDate, close: b.close, volume: b.volume })),
    indexBars,
    clusterReturns: computeClusterMeanReturns(scoredBars, alignedPeerBars),
  };

  const event = evaluate(significanceInput, DEFAULT_CONFIG, input.clusterLabel);
  const decomposition = event ? event.decomposition : decompose(significanceInput, DEFAULT_CONFIG);
  const reassurance = event ? null : checkReassurance(input.symbol, sessionDate, decomposition);
  return { ...base, outcome: 'evaluated', reconciled, event, reassurance, decomposition };
}

// --- synthetic market ----------------------------------------------------

/** `n` weekdays ending on (and including) `end`, oldest first. */
function weekdaysEndingAt(end: string, n: number): string[] {
  const dates: string[] = [];
  let d = new Date(`${end}T00:00:00Z`);
  while (dates.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.unshift(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() - 86_400_000);
  }
  return dates;
}

function barsFromReturns(dates: string[], startPrice: number, returns: number[], volumes: number[]): RawBar[] {
  let close = startPrice;
  return dates.map((sessionDate, i) => {
    if (i > 0) close *= 1 + returns[i]!;
    return { sessionDate, close, volume: volumes[i]! };
  });
}

export interface MarketDay {
  /** Today's returns as fractions: -0.03 = down 3%. */
  market: number;
  sector: number;
  stock: number;
  /** Today's volume as a multiple of the stock's normal volume. */
  volumeRatio: number;
}

interface SyntheticMarket {
  dates: string[];
  index: RawBar[];
  peers: RawBar[][];
  stock: RawBar[];
}

/**
 * 90 calm sessions — a stock and three sector peers all tracking the index
 * with their own noise — then one final session with exactly the returns
 * asked for. Seeded, so the same inputs always give the same answer.
 */
export function buildMarket(day: MarketDay, endDate = LAST_SESSION): SyntheticMarket {
  const rng = seededRng('ledger-simulate');
  const dates = weekdaysEndingAt(endDate, HISTORY_SESSIONS);
  const last = dates.length - 1;

  const indexReturns = dates.map((_, i) => (i === last ? day.market : 0.009 * gaussian(rng)));
  const peerReturns = Array.from({ length: PEER_COUNT }, () =>
    dates.map((_, i) => (i === last ? day.sector : indexReturns[i]! + 0.006 * gaussian(rng))),
  );
  const stockReturns = dates.map((_, i) => (i === last ? day.stock : indexReturns[i]! + 0.005 * gaussian(rng)));
  const volumes = () => dates.map((_, i) => (i === last ? BASE_VOLUME : BASE_VOLUME * (1 + 0.1 * gaussian(rng))));

  const stockVolumes = volumes();
  stockVolumes[last] = BASE_VOLUME * day.volumeRatio;

  return {
    dates,
    index: barsFromReturns(dates, 24_000, indexReturns, volumes()),
    peers: peerReturns.map((r) => barsFromReturns(dates, 1_500, r, volumes())),
    stock: barsFromReturns(dates, 1_800, stockReturns, stockVolumes),
  };
}

// --- drills ----------------------------------------------------------------

/** The market, the stock's sector, and the stock itself each move by a chosen amount today. */
export function simulateMarketDay(day: MarketDay): PipelineResult {
  const m = buildMarket(day);
  return runPipeline({ symbol: SIM_SYMBOL, clusterLabel: SIM_CLUSTER_LABEL, stock: m.stock, stockActions: [], secondaryClose: null, index: m.index, peers: m.peers });
}

/** A move that clears the bar on its own: up 4.5% on twice normal volume, market and sector flat. */
export const FEED_DRILL_DAY: MarketDay = { market: 0, sector: 0, stock: 0.045, volumeRatio: 2 };

export interface FeedDisagreementResult {
  feedA: number;
  feedB: number;
  tolerance: number;
  result: PipelineResult;
  /** The same day with no second feed at all — what would have been flagged had feed B agreed. */
  withoutConflict: PipelineResult;
}

/** Feed B reports today's close `offset` away from feed A (0.03 = 3% higher). */
export function simulateFeedDisagreement(offset: number): FeedDisagreementResult {
  const m = buildMarket(FEED_DRILL_DAY);
  const feedA = m.stock[m.stock.length - 1]!.close;
  const feedB = feedA * (1 + offset);
  const common = { symbol: SIM_SYMBOL, clusterLabel: SIM_CLUSTER_LABEL, stock: m.stock, stockActions: [], index: m.index, peers: m.peers };
  return {
    feedA,
    feedB,
    tolerance: RECONCILE_TOLERANCE,
    result: runPipeline({ ...common, secondaryClose: feedB }),
    withoutConflict: runPipeline({ ...common, secondaryClose: null }),
  };
}

export interface StalenessResult {
  asOf: Date;
  now: Date;
  freshness: FreshnessLevel;
  quality: QuoteQuality;
}

/** The last price is Wednesday 19 Aug's bar; `sessionsClosed` further sessions have closed with no newer one. */
export function simulateStaleness(sessionsClosed: number): StalenessResult {
  const asOf = sessionTs('2026-08-19');
  let d = new Date('2026-08-19T00:00:00Z');
  for (let closed = 0; closed < sessionsClosed; ) {
    d = new Date(d.getTime() + 86_400_000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) closed++;
  }
  // 17:00 IST, after that day's close and the daily job's run time.
  const now = new Date(`${d.toISOString().slice(0, 10)}T11:30:00.000Z`);
  const freshness = classifyFreshness(asOf, now);
  return { asOf, now, freshness, quality: classifyQuoteQuality(freshness, true) };
}

export const SPLIT_RATIO = 5;

export type SplitPhase = 'ex-date' | 'next-session';

export interface SplitResult {
  phase: SplitPhase;
  exDate: string;
  /** Raw, as-traded change on the session being processed. */
  rawChange: number;
  withAdjustment: PipelineResult;
  withoutAdjustment: PipelineResult;
}

/**
 * A 1:5 split. 'ex-date' processes the split day itself (flat in real
 * terms, -80% as traded). 'next-session' processes the day after, when the
 * stock genuinely falls 4% on twice normal volume.
 */
export function simulateSplit(phase: SplitPhase): SplitResult {
  const today: MarketDay =
    phase === 'ex-date'
      ? { market: 0, sector: 0, stock: 0, volumeRatio: 1 }
      : { market: 0, sector: 0, stock: -0.04, volumeRatio: 2 };
  const m = buildMarket(today);
  const exDate = phase === 'ex-date' ? m.dates[m.dates.length - 1]! : m.dates[m.dates.length - 2]!;

  // Economically continuous series -> what the exchange actually printed:
  // every pre-split close 5x higher, every pre-split volume 5x lower.
  const rawStock = m.stock.map((b) =>
    b.sessionDate < exDate ? { ...b, close: b.close * SPLIT_RATIO, volume: b.volume / SPLIT_RATIO } : b,
  );
  const actions: CorporateAction[] = [{ exDate, type: 'split', ratio: SPLIT_RATIO }];
  const common = { symbol: SIM_SYMBOL, clusterLabel: SIM_CLUSTER_LABEL, stock: rawStock, secondaryClose: null, index: m.index, peers: m.peers };
  const n = rawStock.length;

  return {
    phase,
    exDate,
    rawChange: rawStock[n - 1]!.close / rawStock[n - 2]!.close - 1,
    withAdjustment: runPipeline({ ...common, stockActions: actions }),
    withoutAdjustment: runPipeline({ ...common, stockActions: [] }),
  };
}
