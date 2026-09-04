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
