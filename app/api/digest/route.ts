/**
 * GET /api/digest?user_id=1
 *
 * Events since the user's cursor, per watchlisted symbol, hierarchically
 * compacted (src/digest/compact.ts), plus the current cursor position for
 * each symbol. Does NOT advance any cursor — reading is explicit, via a
 * separate POST /api/cursor/ack once the user has actually seen this.
 *
 * `user_id` stands in for a real session/auth system, which is out of
 * scope for this project — documented simplification, not an oversight.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getDigestForUser } from '../../../src/digest/get-digest';

export async function GET(request: NextRequest) {
  const userIdRaw = request.nextUrl.searchParams.get('user_id');
  const userId = Number(userIdRaw);
  if (!userIdRaw || !Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'user_id query param is required' }, { status: 400 });
  }

  const result = await getDigestForUser(userId);
  return NextResponse.json(result);
}
