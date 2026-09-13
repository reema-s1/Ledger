/**
 * POST /api/watch-threshold   body: { user_id, symbol, threshold_pct }  -> set/replace
 * DELETE /api/watch-threshold body: { user_id, symbol }                 -> clear
 *
 * A personal, manual reminder threshold (item 19) — "notify me if this
 * moves more than X%, regardless of significance." Never read by the
 * significance engine; purely a per-user display preference the
 * watchlist table checks against today's raw move.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { setWatchThreshold, removeWatchThreshold } from '../../../db/queries/watch-thresholds';

interface ThresholdBody {
  user_id?: unknown;
  symbol?: unknown;
  threshold_pct?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ThresholdBody | null;
  if (
    !body ||
    typeof body.user_id !== 'number' ||
    typeof body.symbol !== 'string' ||
    typeof body.threshold_pct !== 'number' ||
    !(body.threshold_pct > 0)
  ) {
    return NextResponse.json(
      { error: 'user_id (number), symbol (string), and threshold_pct (positive number) are required' },
      { status: 400 },
    );
  }
  await setWatchThreshold(body.user_id, body.symbol, body.threshold_pct);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ThresholdBody | null;
  if (!body || typeof body.user_id !== 'number' || typeof body.symbol !== 'string') {
    return NextResponse.json({ error: 'user_id (number) and symbol (string) are required' }, { status: 400 });
  }
  await removeWatchThreshold(body.user_id, body.symbol);
  return NextResponse.json({ ok: true });
}
