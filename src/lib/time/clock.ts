/**
 * The only source of "now" and "is the market open" anywhere in this codebase.
 *
 * Hard rule: no other module may call Date.now() / `new Date()` for business
 * logic, or reason about market hours itself. Everything goes through a
 * Clock, obtained from the DATA_MODE-aware factory in `../data-mode`.
 */

export type SessionPhase = 'pre' | 'open' | 'closed';

export interface SessionInfo {
  /** IST calendar date of the current/most recent session, YYYY-MM-DD. */
  date: string;
  phase: SessionPhase;
}

export interface Clock {
  /** Current time (wall-clock in live mode, simulated in replay mode). */
  now(): Date;
  /** Whether NSE is trading at the given instant (default: now). */
  isMarketOpen(at?: Date): boolean;
  /** The session the given instant (default: now) belongs to. */
  currentSession(at?: Date): SessionInfo;
}
