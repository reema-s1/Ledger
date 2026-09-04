import type { Clock, SessionInfo } from './clock';
import { isMarketOpenAt, sessionFor } from './market-calendar';

/**
 * Simulated clock. Time only moves when the replay engine
 * (ReplayQuoteSource) advances it — never from wall time. This is what
 * makes replay deterministic: same seed + same speed produces the exact
 * same sequence of `now()` values regardless of how fast the host machine
 * actually runs.
 */
export class ReplayClock implements Clock {
  private simNow: Date;

  constructor(startAt: Date) {
    this.simNow = startAt;
  }

  now(): Date {
    return this.simNow;
  }

  isMarketOpen(at: Date = this.now()): boolean {
    return isMarketOpenAt(at);
  }

  currentSession(at: Date = this.now()): SessionInfo {
    return sessionFor(at);
  }

  /**
   * Internal: only the replay engine may move simulated time forward.
   * Monotonic, like everything else in this system.
   */
  _advanceTo(date: Date): void {
    if (date.getTime() < this.simNow.getTime()) {
      throw new Error(
        `ReplayClock cannot move backwards: ${this.simNow.toISOString()} -> ${date.toISOString()}`,
      );
    }
    this.simNow = date;
  }
}
