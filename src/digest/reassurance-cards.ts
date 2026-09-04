/**
 * Reassurance events never reach compact.ts — that function is untouched
 * by this feature. They're filtered out of the event list before
 * compaction (see get-digest.ts) and assembled here into their own small
 * list instead: "today only" (the explanation cites "today" specifically,
 * so an aged one wouldn't read correctly), capped and sorted by
 * magnitude so a bad week for the market doesn't turn this into a second
 * noisy feed.
 */

import type { DigestEvent } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REASSURANCE_CARDS = 3;

interface ReassurancePayload {
  observedReturn?: number;
}

export interface ReassuranceCard {
  symbol: string;
  headline: string;
  eventId: number;
  ts: string;
}

export function buildReassuranceCards(events: DigestEvent[], now: Date): ReassuranceCard[] {
  return events
    .filter((e) => e.kind === 'reassurance' && now.getTime() - e.ts.getTime() < DAY_MS)
    .map((e) => ({
      symbol: e.symbol,
      headline: e.explanation ?? '',
      eventId: e.id,
      ts: e.ts.toISOString(),
      magnitude: Math.abs((e.payload as ReassurancePayload).observedReturn ?? 0),
    }))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_REASSURANCE_CARDS)
    .map(({ magnitude: _magnitude, ...card }) => card);
}
