/**
 * NSE trading-hours math, shared by LiveClock and ReplayClock so the two
 * drivers can never disagree about when the market is open.
 *
 * Simplification (documented, not hidden): this does not model NSE trading
 * holidays, only the Mon-Fri / 09:15-15:30 IST weekly calendar. Good enough
 * for a watchlist demo; a real holiday table is a follow-up.
 */

import type { SessionPhase } from './clock';

const IST_OFFSET_MIN = 5 * 60 + 30; // UTC+5:30
const MARKET_OPEN_MIN = 9 * 60 + 15; // 09:15
const MARKET_CLOSE_MIN = 15 * 60 + 30; // 15:30

/** A Date whose UTC wall-clock fields equal the IST wall-clock time. */
function toISTFields(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0 = Sun .. 6 = Sat
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function istDateString(date: Date): string {
  const { year, month, day } = toISTFields(date);
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function isWeekday(date: Date): boolean {
  const { weekday } = toISTFields(date);
  return weekday >= 1 && weekday <= 5;
}

export function marketPhase(date: Date): SessionPhase {
  if (!isWeekday(date)) return 'closed';
  const { minutesOfDay } = toISTFields(date);
  if (minutesOfDay < MARKET_OPEN_MIN) return 'pre';
  if (minutesOfDay < MARKET_CLOSE_MIN) return 'open';
  return 'closed';
}

export function isMarketOpenAt(date: Date): boolean {
  return marketPhase(date) === 'open';
}

/**
 * The session a given instant belongs to. Before/at the open it's today's
 * pre-market; after the close it still reports today's date, phase closed
 * (the "session" doesn't roll to tomorrow until tomorrow's pre-market).
 */
export function sessionFor(date: Date): { date: string; phase: SessionPhase } {
  return { date: istDateString(date), phase: marketPhase(date) };
}

export const MARKET_OPEN_MINUTES_OF_DAY = MARKET_OPEN_MIN;
export const MARKET_CLOSE_MINUTES_OF_DAY = MARKET_CLOSE_MIN;

/** The Date (UTC) at which `sessionDate` (YYYY-MM-DD, IST calendar date) opens for trading. */
export function sessionOpenTs(sessionDate: string): Date {
  const dayStart = new Date(`${sessionDate}T00:00:00.000Z`);
  return new Date(dayStart.getTime() + (MARKET_OPEN_MIN - IST_OFFSET_MIN) * 60_000);
}

/** The Date (UTC) at which `sessionDate` (YYYY-MM-DD, IST calendar date) closes. */
export function sessionCloseTs(sessionDate: string): Date {
  const dayStart = new Date(`${sessionDate}T00:00:00.000Z`);
  return new Date(dayStart.getTime() + (MARKET_CLOSE_MIN - IST_OFFSET_MIN) * 60_000);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Beyond this the answer is "definitively overdue" and the exact figure stops mattering — a bound, not a business rule. */
const MAX_DAYS_SCANNED = 400;

/**
 * How many milliseconds the market was actually *open* between two
 * instants — the honest denominator for "is this quote overdue?"
 *
 * Wall-clock elapsed time is the wrong measure: a Friday closing price
 * looked at on Sunday is three days old and still the single most recent
 * real price that exists. Judging it against a polling interval says the
 * feed has been silent for 60x its cadence and flags it unreachable,
 * which is the system crying wolf about a market that was simply shut.
 * Counting only open-market time makes an overnight or weekend gap cost
 * nothing, while a feed that genuinely stops answering *during* a session
 * still crosses the same thresholds at the same rate it always did.
 *
 * Inherits market-calendar's documented holiday simplification: an
 * unmodelled NSE holiday still counts as open time here, so a quote can
 * read as overdue on a holiday. That's a smaller, rarer error than the
 * every-single-weekend one it replaces, and it fails toward "we're not
 * sure this is current" rather than toward false confidence.
 */
export function marketOpenMsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;

  let total = 0;
  let cursor = istDateString(from);

  for (let scanned = 0; scanned <= MAX_DAYS_SCANNED; scanned++) {
    const open = sessionOpenTs(cursor);
    const close = sessionCloseTs(cursor);
    if (open.getTime() > to.getTime()) break;

    if (isWeekday(open)) {
      const start = Math.max(open.getTime(), from.getTime());
      const end = Math.min(close.getTime(), to.getTime());
      if (end > start) total += end - start;
    }

    if (scanned === MAX_DAYS_SCANNED) return Number.MAX_SAFE_INTEGER;
    // IST has no DST, so a flat +24h off the session open always lands on
    // the next calendar day's session open.
    cursor = istDateString(new Date(open.getTime() + DAY_MS));
  }

  return total;
}
