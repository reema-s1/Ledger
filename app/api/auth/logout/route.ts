/**
 * POST /api/auth/logout
 *
 * Clears the user_id cookie so the landing screen (guest/login/signup)
 * shows again on the next visit. Doesn't touch the users row — logging
 * back in (or "Try as Guest" again) picks up right where any account
 * left off, cursors included.
 */

import { NextResponse } from 'next/server';
import { USER_ID_COOKIE } from '../../../../src/lib/user-id-cookie';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(USER_ID_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
