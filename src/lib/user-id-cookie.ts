/**
 * Just the cookie name, in its own module with no server-only imports —
 * src/lib/current-user.ts (Server Components, via next/headers) and
 * src/lib/current-user-client.ts (Client Components, via document.cookie)
 * both need it, and next/headers can't be pulled into a client bundle.
 */
export const USER_ID_COOKIE = 'user_id';
