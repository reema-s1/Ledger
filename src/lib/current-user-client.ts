import { DEMO_USER_ID } from './demo-user';
import { USER_ID_COOKIE } from './user-id-cookie';

/** Client-component counterpart of getCurrentUserId (src/lib/current-user.ts) — same cookie, read via document.cookie. */
export function getClientUserId(): number {
  if (typeof document === 'undefined') return DEMO_USER_ID;
  const match = document.cookie.match(new RegExp(`(?:^|; )${USER_ID_COOKIE}=([^;]+)`));
  const parsed = match?.[1] ? Number(decodeURIComponent(match[1])) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEMO_USER_ID;
}
