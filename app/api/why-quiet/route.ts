/**
 * GET /api/why-quiet?user_id=1
 *
 * Turns "N symbols on your watchlist, all quiet" from a claim into
 * something inspectable: the actual residual z-score and volume
 * confirmation for each watchlisted symbol's latest session, computed
 * live, whether or not it cleared the significance bar.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { listWatchlist } from '../../../db/queries/watchlist';
import { explainWhyQuietForSymbols } from '../../../src/digest/why-quiet';

export async function GET(request: NextRequest) {
  const userIdRaw = request.nextUrl.searchParams.get('user_id');
  const userId = Number(userIdRaw);
  if (!userIdRaw || !Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'user_id query param is required' }, { status: 400 });
  }

  const watchlist = await listWatchlist(userId);
  const reasons = await explainWhyQuietForSymbols(watchlist.map((w) => w.symbol));
  return NextResponse.json({ reasons });
}
