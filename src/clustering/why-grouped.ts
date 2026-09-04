/**
 * The correlation values actually behind a cluster grouping — Section 4's
 * brief asked for clustering to be inspectable ("expose an endpoint
 * returning cluster membership with correlation values, so the UI can
 * show why symbols are grouped"). Impure (touches the DB); the pure
 * math is `pairwiseCorrelations` in `./correlation.ts`.
 */

import { getRecentCandles } from '../../db/queries/candles';
import { listCorporateActions, type CorporateActionRow } from '../../db/queries/corporate-actions';
import { adjustBarsForCorporateActions, type CorporateAction } from '../../worker/corporate-actions';
import { returnsFromCloses } from '../significance/stats';
import { pairwiseCorrelations } from './correlation';
import type { SymbolReturns } from './types';

function toActions(rows: CorporateActionRow[]): CorporateAction[] {
  return rows.map((r) => ({ exDate: r.ex_date, type: r.type, ratio: r.ratio }));
}

async function fetchReturns(symbol: string, days: number): Promise<SymbolReturns | null> {
  const [candles, actionRows] = await Promise.all([
    getRecentCandles(symbol, days),
    listCorporateActions(symbol),
  ]);
  if (candles.length < 2) return null;
  const raw = candles.map((c) => ({ sessionDate: c.session_date, close: c.c, volume: c.v }));
  const adjusted = adjustBarsForCorporateActions(raw, toActions(actionRows));
  return { symbol, returns: returnsFromCloses(adjusted.map((b) => b.close)) };
}

export interface ClusterCorrelation {
  peer: string;
  correlation: number;
}

/** Correlation of `symbol` against each of its cluster peers, sorted strongest first. */
export async function getCorrelationsFor(symbol: string, peers: string[]): Promise<ClusterCorrelation[]> {
  if (peers.length === 0) return [];

  const allReturns = await Promise.all([symbol, ...peers].map((s) => fetchReturns(s, 130)));
  const bySymbol = new Map<string, SymbolReturns>();
  for (const r of allReturns) if (r) bySymbol.set(r.symbol, r);

  const self = bySymbol.get(symbol);
  if (!self) return [];

  const members = [symbol, ...peers].filter((s) => bySymbol.has(s));
  const pairs = pairwiseCorrelations(members, [...bySymbol.values()]);

  return pairs
    .filter((p) => p.a === symbol || p.b === symbol)
    .map((p) => ({ peer: p.a === symbol ? p.b : p.a, correlation: p.correlation }))
    .sort((a, b) => b.correlation - a.correlation);
}
