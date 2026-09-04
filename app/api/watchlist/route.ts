/**
 * GET /api/watchlist?user_id=       -> current watchlist
 * POST /api/watchlist                body: { user_id, symbol }    -> add
 * DELETE /api/watchlist               body: { user_id, symbol }    -> remove
 */

import { NextResponse, type NextRequest } from 'next/server';
import { listWatchlist, addToWatchlist, removeFromWatchlist } from '../../../db/queries/watchlist';

function parseUserId(value: string | null): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest) {
  const userId = parseUserId(request.nextUrl.searchParams.get('user_id'));
  if (!userId) return NextResponse.json({ error: 'user_id query param is required' }, { status: 400 });

  const items = await listWatchlist(userId);
  return NextResponse.json({ items });
}

interface WatchlistBody {
  user_id?: unknown;
  symbol?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as WatchlistBody | null;
  if (!body || typeof body.user_id !== 'number' || typeof body.symbol !== 'string') {
    return NextResponse.json({ error: 'user_id (number) and symbol (string) are required' }, { status: 400 });
  }
  await addToWatchlist(body.user_id, body.symbol);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as WatchlistBody | null;
  if (!body || typeof body.user_id !== 'number' || typeof body.symbol !== 'string') {
    return NextResponse.json({ error: 'user_id (number) and symbol (string) are required' }, { status: 400 });
  }
  await removeFromWatchlist(body.user_id, body.symbol);
  return NextResponse.json({ ok: true });
}
