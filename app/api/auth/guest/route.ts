/**
 * POST /api/auth/guest
 *
 * A fresh account per guest session, not one shared identity — the event
 * log and candles are global (keyed by symbol, not user), so "fresh" only
 * means a new users row plus a starter watchlist; nothing about the
 * market history needs copying. Read cursors default to 0, so a new
 * guest's digest starts fully unread, same as any real new user would.
 * Concurrent reviewers each get their own copy, isolated by cookie.
 */

import { NextResponse } from 'next/server';
import { createUser } from '../../../../db/queries/users';
import { addToWatchlist } from '../../../../db/queries/watchlist';
import { STARTER_WATCHLIST } from '../../../../src/lib/starter-watchlist';
import { USER_ID_COOKIE } from '../../../../src/lib/user-id-cookie';

export async function POST() {
  const user = await createUser('Guest');
  for (const symbol of STARTER_WATCHLIST) {
    await addToWatchlist(user.id, symbol);
  }

  const response = NextResponse.json({ user_id: user.id });
  response.cookies.set(USER_ID_COOKIE, String(user.id), {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  });
  return response;
}
