import { createHash } from 'node:crypto';

/**
 * Deliberately not real password security — no salt-per-user, no bcrypt/
 * scrypt, no rate limiting. This project has no auth system by design
 * (see src/lib/demo-user.ts); the login screen exists only so a reviewer
 * can sign into the same seeded account from a second device/tab to watch
 * cursor reconciliation happen live. A fixed pepper is enough to avoid
 * storing raw passwords in the table, nothing more.
 */
const STUB_PEPPER = 'ledger-demo-stub';

export function hashPassword(password: string): string {
  return createHash('sha256').update(STUB_PEPPER + password).digest('hex');
}
