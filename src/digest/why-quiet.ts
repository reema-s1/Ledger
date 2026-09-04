/**
 * "8 symbols on your watchlist, all quiet" is a claim — this is what lets
 * a viewer verify it instead of taking it on faith. Re-runs the same
 * decomposition the worker runs (Section 3 + Section 5's cluster wiring),
 * but as a read-only inspection: returns the residual z-score and volume
 * confirmation for a symbol's latest session regardless of whether either
 * cleared the significance bar, instead of only ever showing events that
 * did.
 */

import { getRecentCandles } from '../../db/queries/candles';
import { listCorporateActions, type CorporateActionRow } from '../../db/queries/corporate-actions';
import { getLatestClusterForSymbol } from '../../db/queries/clusters';
import { adjustBarsForCorporateActions, isExDate, type CorporateAction, type RawBar } from '../../worker/corporate-actions';
import { alignBars, computeClusterMeanReturns } from '../../worker/aggregate';
import { decompose } from '../significance/decompose';
import { DEFAULT_CONFIG } from '../significance/config';
import { INDEX_SYMBOL } from '../seed/symbols';
import { createClock, createQuoteSource } from '../lib/data-mode';
import type { SignificanceInput } from '../significance/types';

export interface QuietReason {
  symbol: string;
  sessionDate: string | null;
  residualZ: number | null;
  volumeRatio: number | null;
  clearedBar: boolean;
  reason: string;
}

function toActions(rows: CorporateActionRow[]): CorporateAction[] {
  return rows.map((r) => ({ exDate: r.ex_date, type: r.type, ratio: r.ratio }));
}

async function fetchAdjustedBars(symbol: string, days: number): Promise<RawBar[] | null> {
  const [candles, actionRows] = await Promise.all([
    getRecentCandles(symbol, days),
    listCorporateActions(symbol),
  ]);
  if (candles.length === 0) return null;
  const raw: RawBar[] = candles.map((c) => ({ sessionDate: c.session_date, close: c.c, volume: c.v }));
  return adjustBarsForCorporateActions(raw, toActions(actionRows));
}

/**
 * Serves both `fetchAdjustedBars` (memoized, so a symbol that's both on
 * the watchlist and someone else's cluster peer is only ever fetched
 * once per batch) and the index bars (fetched exactly once regardless of
 * how many symbols are being explained — this used to be per-symbol,
 * which combined with a serverless 10s function timeout on a 12-symbol
 * watchlist was enough to make the whole endpoint 500 on Vercel).
 */
class RequestCache {
  private bars = new Map<string, Promise<RawBar[] | null>>();
  private indexBars: Promise<RawBar[] | null> | null = null;

  getBars(symbol: string, days: number): Promise<RawBar[] | null> {
    let p = this.bars.get(symbol);
    if (!p) {
      p = fetchAdjustedBars(symbol, days);
      this.bars.set(symbol, p);
    }
    return p;
  }

  getIndexBars(days: number): Promise<RawBar[] | null> {
    if (!this.indexBars) {
      this.indexBars = (async () => {
        const clock = createClock();
        const source = createQuoteSource(clock);
        const history = await source.getHistory(INDEX_SYMBOL, days);
        if (history.length === 0) return null;
        return history.map((c) => ({ sessionDate: c.sessionDate, close: c.c, volume: c.v }));
      })();
    }
    return this.indexBars;
  }
}

async function explainWhyQuiet(symbol: string, cache: RequestCache): Promise<QuietReason> {
  const [symbolBars, actionRows] = await Promise.all([
    cache.getBars(symbol, 130),
    listCorporateActions(symbol),
  ]);

  if (!symbolBars || symbolBars.length < 2) {
    return { symbol, sessionDate: null, residualZ: null, volumeRatio: null, clearedBar: false, reason: 'not enough history yet' };
  }

  const sessionDate = symbolBars[symbolBars.length - 1]!.sessionDate;

  if (isExDate(sessionDate, toActions(actionRows))) {
    return { symbol, sessionDate, residualZ: null, volumeRatio: null, clearedBar: false, reason: 'corporate action today, not evaluated as a price move' };
  }

  const cluster = await getLatestClusterForSymbol(symbol);
  if (!cluster) {
    return { symbol, sessionDate, residualZ: null, volumeRatio: null, clearedBar: false, reason: 'no cluster computed yet' };
  }
  const peers = cluster.members.filter((m) => m !== symbol);

  const [indexBarsRaw, peerBarsRaw] = await Promise.all([
    cache.getIndexBars(130),
    Promise.all(peers.map((p) => cache.getBars(p, 130))),
  ]);

  const indexBars = indexBarsRaw ? alignBars(symbolBars, indexBarsRaw) : null;
  const alignedPeers = peerBarsRaw
    .filter((p): p is RawBar[] => p !== null)
    .map((p) => alignBars(symbolBars, p))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (!indexBars || alignedPeers.length === 0) {
    return { symbol, sessionDate, residualZ: null, volumeRatio: null, clearedBar: false, reason: 'insufficient cluster history' };
  }

  const clusterReturns = computeClusterMeanReturns(symbolBars, alignedPeers);
  const input: SignificanceInput = {
    symbol,
    symbolBars: symbolBars.map((b) => ({ sessionDate: b.sessionDate, close: b.close, volume: b.volume })),
    indexBars,
    clusterReturns,
  };

  const d = decompose(input, DEFAULT_CONFIG);
  const clearedBar =
    (Math.abs(d.residualZ) >= DEFAULT_CONFIG.residualZGate && d.volumeWeightedZ >= DEFAULT_CONFIG.significanceThreshold) ||
    (d.isStructuralBreak && Math.abs(d.residualZ) >= DEFAULT_CONFIG.breakResidualZGate);

  const reason = `residual ${Math.abs(d.residualZ).toFixed(1)}σ (bar is ${DEFAULT_CONFIG.residualZGate}σ), ${d.volumeRatio.toFixed(1)}x normal volume`;

  return { symbol, sessionDate, residualZ: d.residualZ, volumeRatio: d.volumeRatio, clearedBar, reason };
}

export async function explainWhyQuietForSymbols(symbols: string[]): Promise<QuietReason[]> {
  const cache = new RequestCache();
  return Promise.all(symbols.map((s) => explainWhyQuiet(s, cache)));
}
