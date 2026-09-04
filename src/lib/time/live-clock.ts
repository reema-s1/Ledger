import type { Clock, SessionInfo } from './clock';
import { isMarketOpenAt, sessionFor } from './market-calendar';

/** Real wall clock. NSE hours (09:15-15:30 IST, Mon-Fri). */
export class LiveClock implements Clock {
  now(): Date {
    return new Date();
  }

  isMarketOpen(at: Date = this.now()): boolean {
    return isMarketOpenAt(at);
  }

  currentSession(at: Date = this.now()): SessionInfo {
    return sessionFor(at);
  }
}
