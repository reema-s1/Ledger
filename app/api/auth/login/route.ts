/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * A stub, not a real auth system (see src/lib/auth.ts) — a direct lookup
 * against `users`, no session library, no JWT. Its purpose is narrow: let
 * a reviewer log into the SAME account from two devices/tabs and watch
 * cursor reconciliation (Section 6) happen live, which "Try as guest"
 * (a fresh account each time) can't demonstrate.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getUserByUsername } from '../../../../db/queries/users';
import { hashPassword } from '../../../../src/lib/auth';
import { USER_ID_COOKIE } from '../../../../src/lib/user-id-cookie';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'username and password are required' }, { status: 400 });
  }

  const user = await getUserByUsername(body.username);
  if (!user || !user.password_hash || user.password_hash !== hashPassword(body.password)) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const response = NextResponse.json({ user_id: user.id });
  response.cookies.set(USER_ID_COOKIE, String(user.id), {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  });
  return response;
}
