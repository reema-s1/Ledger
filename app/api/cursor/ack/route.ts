/**
 * POST /api/cursor/ack
 * body: { user_id, symbol, up_to_event_id, device_id }
 *
 * Advances the user's cursor for one symbol, monotonically only —
 * db/queries/cursors.ts `ackCursor` guards the update so a lower
 * event id (a stale/out-of-order write from a slow device) is a
 * silent no-op, never an error, and never rewinds what another
 * device already advanced to.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ackCursor } from '../../../../db/queries/cursors';

interface AckBody {
  user_id?: unknown;
  symbol?: unknown;
  up_to_event_id?: unknown;
  device_id?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as AckBody | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { user_id, symbol, up_to_event_id, device_id } = body;
  if (
    typeof user_id !== 'number' ||
    typeof symbol !== 'string' ||
    typeof up_to_event_id !== 'number' ||
    typeof device_id !== 'string'
  ) {
    return NextResponse.json(
      { error: 'user_id (number), symbol (string), up_to_event_id (number), device_id (string) are required' },
      { status: 400 },
    );
  }

  const cursor = await ackCursor(user_id, symbol, up_to_event_id, device_id);
  return NextResponse.json({
    symbol: cursor.symbol,
    last_event_id: cursor.last_event_id,
    device_id: cursor.device_id,
    updated_at: cursor.updated_at,
  });
}
