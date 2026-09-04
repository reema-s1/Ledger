import { cookies } from 'next/headers';
import { DEMO_USER_ID } from './demo-user';
import { USER_ID_COOKIE } from './user-id-cookie';

export { USER_ID_COOKIE };

/** True once a landing-screen choice (guest or login) has been made. */
export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return store.has(USER_ID_COOKIE);
}

/** Falls back to the fixed demo user so a direct/bookmarked link to an inner page never breaks. */
export async function getCurrentUserId(): Promise<number> {
  const store = await cookies();
  const raw = store.get(USER_ID_COOKIE)?.value;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEMO_USER_ID;
}
