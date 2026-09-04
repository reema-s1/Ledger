import { queryOne } from '../client';

export interface ReadCursorRow {
  user_id: number;
  symbol: string;
  last_event_id: number;
  device_id: string;
  updated_at: Date;
}

/**
 * Advances a cursor to `upToEventId`, monotonically only. The UPSERT's
 * DO UPDATE is guarded by `read_cursors.last_event_id < EXCLUDED value`,
 * so a stale/out-of-order write (a slow device catching up, two devices
 * racing) can never rewind a cursor — it's a silent no-op, not an error.
 * Always returns the cursor's current state after the attempt, whichever
 * device actually won.
 */
export async function ackCursor(
  userId: number,
  symbol: string,
  upToEventId: number,
  deviceId: string,
): Promise<ReadCursorRow> {
  await queryOne(
    `INSERT INTO read_cursors (user_id, symbol, last_event_id, device_id, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, symbol) DO UPDATE
       SET last_event_id = EXCLUDED.last_event_id,
           device_id = EXCLUDED.device_id,
           updated_at = now()
       WHERE read_cursors.last_event_id < EXCLUDED.last_event_id`,
    [userId, symbol, upToEventId, deviceId],
  );

  const current = await getCursor(userId, symbol);
  if (!current) throw new Error('ackCursor: cursor missing after upsert');
  return current;
}

export async function getCursor(userId: number, symbol: string): Promise<ReadCursorRow | null> {
  return queryOne<ReadCursorRow>(
    'SELECT * FROM read_cursors WHERE user_id = $1 AND symbol = $2',
    [userId, symbol],
  );
}

/** Cursor position, defaulting to 0 (never read) for symbols with no row yet. */
export async function getCursorOrDefault(userId: number, symbol: string): Promise<number> {
  const row = await getCursor(userId, symbol);
  return row?.last_event_id ?? 0;
}
