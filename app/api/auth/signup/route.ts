/**
 * POST /api/auth/signup
 * body: { username, password }
 *
 * Same stub as /api/auth/login (see src/lib/auth.ts) — a plain users-table
 * insert, not a real registration system. A new signed-up account starts
 * with the same starter watchlist as a guest account (src/lib/starter-
 * watchlist.ts), so it isn't empty on first login.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getUserByUsername, createUserWithCredentials } from '../../../../db/queries/users';
import { addToWatchlist } from '../../../../db/queries/watchlist';
import { STARTER_WATCHLIST } from '../../../../src/lib/starter-watchlist';
import { hashPassword } from '../../../../src/lib/auth';
import { USER_ID_COOKIE } from '../../../../src/lib/user-id-cookie';

interface SignupBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignupBody | null;
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'username and password are required' }, { status: 400 });
  }

  const username = body.username.trim();
  const password = body.password;
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  const user = await createUserWithCredentials(username, username, hashPassword(password));
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
