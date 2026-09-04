/**
 * GET /api/cluster-correlations?symbol=TCS
 *
 * The correlation values behind a symbol's current cluster grouping —
 * Section 4's "expose an endpoint... so the UI can show why symbols are
 * grouped," wired up from the symbol detail page's "why grouped?".
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getLatestClusterForSymbol } from '../../../db/queries/clusters';
import { getCorrelationsFor } from '../../../src/clustering/why-grouped';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol query param is required' }, { status: 400 });
  }

  const cluster = await getLatestClusterForSymbol(symbol);
  if (!cluster) {
    return NextResponse.json({ method: null, correlations: [] });
  }

  const peers = cluster.members.filter((m) => m !== symbol);

  if (cluster.method === 'sector') {
    return NextResponse.json({
      method: 'sector',
      note: 'Grouped by sector label — not enough history yet for correlation clustering (needs 90+ sessions).',
      correlations: [],
    });
  }

  const correlations = await getCorrelationsFor(symbol, peers);
  return NextResponse.json({ method: 'correlation', correlations });
}
