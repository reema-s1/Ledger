/**
 * Hierarchical compaction: the read path's core job. A user gone 4 months
 * must not receive 40,000 events — they get a readable paragraph. Pure
 * function of (events, now) so it's unit-testable without a database.
 *
 *   < 1 day away   -> individual events, full detail  ("recent")
 *   1-7 days       -> one narrative per symbol, price-move events merged
 *                     ("episode", e.g. "drifted -6% over 3 sessions")
 *   > 7 days       -> one line per symbol, net change  ("chapter")
 *
 * A resolved move (Section 5's `event_resolved`, superseding its trigger)
 * is folded into a single item showing the resolved outcome — "spiked 6%,
 * gave it all back" — never displayed as two separate lines (the live
 * alert, then its resolution). Corporate-action events never get merged
 * into a price-move narrative; they're informational, not a move.
 */

import type { DigestEvent, DigestItem, DigestItemKind, DigestTier } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPISODE_CUTOFF_MS = 7 * DAY_MS;

interface MovePayload {
  baselineClose?: number;
  triggerClose?: number;
}

interface ResolutionPayload {
  originalEventId?: number;
}

/** An event ready to display: superseded originals already carry their resolution's text. */
interface EffectiveEvent {
  id: number;
  symbol: string;
  ts: Date;
  kind: string;
  explanation: string;
  payload: MovePayload;
  /** Set when this event was resolved — its resolution event's id, folded in for eventIds. */
  resolvedByEventId?: number;
}

function buildEffectiveEvents(events: DigestEvent[]): EffectiveEvent[] {
  const resolutionByOriginal = new Map<number, DigestEvent>();
  for (const e of events) {
    if (e.kind !== 'event_resolved') continue;
    const originalId = (e.payload as ResolutionPayload).originalEventId;
    if (typeof originalId !== 'number') continue;
    const existing = resolutionByOriginal.get(originalId);
    if (!existing || e.id > existing.id) resolutionByOriginal.set(originalId, e);
  }

  const effective: EffectiveEvent[] = [];
  for (const e of events) {
    if (e.kind === 'event_resolved') continue; // metadata only, never shown standalone

    const resolution = resolutionByOriginal.get(e.id);
    effective.push({
      id: e.id,
      symbol: e.symbol,
      ts: e.ts,
      kind: e.kind,
      explanation: (resolution?.explanation ?? e.explanation) ?? '',
      payload: e.payload as MovePayload,
      resolvedByEventId: resolution?.id,
    });
  }
  return effective;
}

function tierFor(ageMs: number): DigestTier {
  if (ageMs < DAY_MS) return 'recent';
  if (ageMs < EPISODE_CUTOFF_MS) return 'episode';
  return 'chapter';
}

function eventIdsOf(e: EffectiveEvent): number[] {
  return e.resolvedByEventId ? [e.id, e.resolvedByEventId] : [e.id];
}

/** A resolved event badges as 'resolved' regardless of its original kind — that's the more useful fact once it's resolved. */
function kindOf(e: EffectiveEvent): DigestItemKind {
  if (e.resolvedByEventId) return 'resolved';
  return e.kind as DigestItemKind;
}

function pluralize(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** Groups one tier's events by symbol into narrative DigestItems. */
function narrateGroup(symbol: string, events: EffectiveEvent[], tier: DigestTier): DigestItem[] {
  const items: DigestItem[] = [];

  const corporateActions = events.filter((e) => e.kind === 'corporate_action');
  const moves = events
    .filter((e) => e.kind === 'residual_move' || e.kind === 'structural_break')
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  for (const ca of corporateActions) {
    items.push({
      tier,
      kind: kindOf(ca),
      symbol,
      headline: ca.explanation,
      eventIds: eventIdsOf(ca),
      fromTs: ca.ts.toISOString(),
      toTs: ca.ts.toISOString(),
    });
  }

  if (moves.length > 0) {
    const first = moves[0]!;
    const last = moves[moves.length - 1]!;
    const eventIds = moves.flatMap(eventIdsOf);

    const priced = moves.filter(
      (e) => typeof e.payload.baselineClose === 'number' && typeof e.payload.triggerClose === 'number',
    );

    let headline: string;
    if (priced.length > 0) {
      const netFrom = priced[0]!.payload.baselineClose!;
      const netTo = priced[priced.length - 1]!.payload.triggerClose!;
      const netPct = ((netTo - netFrom) / netFrom) * 100;
      const dir = netPct >= 0 ? 'up' : 'down';
      const magnitude = Math.abs(netPct).toFixed(1);

      headline =
        tier === 'episode'
          ? `${symbol} drifted ${dir} ${magnitude}% over ${pluralize(moves.length, 'session')}.`
          : `${symbol}: ${pluralize(moves.length, 'move')} flagged, net ${dir} ${magnitude}% since ${first.ts.toISOString().slice(0, 10)}.`;
    } else {
      headline =
        tier === 'episode'
          ? `${symbol}: ${pluralize(moves.length, 'move')} flagged.`
          : `${symbol}: ${pluralize(moves.length, 'move')} flagged since ${first.ts.toISOString().slice(0, 10)}.`;
    }

    // A folded narrative badges as a break if any of the moves it summarizes were one — the
    // headline differentiator shouldn't disappear just because it got compacted with routine moves.
    const kind: DigestItemKind = moves.some((m) => m.kind === 'structural_break') ? 'structural_break' : 'residual_move';
    items.push({ tier, kind, symbol, headline, eventIds, fromTs: first.ts.toISOString(), toTs: last.ts.toISOString() });
  }

  return items;
}

export function compactEvents(events: DigestEvent[], now: Date): DigestItem[] {
  const effective = buildEffectiveEvents(events);

  const buckets: Record<DigestTier, EffectiveEvent[]> = { recent: [], episode: [], chapter: [] };
  for (const e of effective) {
    buckets[tierFor(now.getTime() - e.ts.getTime())].push(e);
  }

  const items: DigestItem[] = [];

  // Recent: individual events, full detail, newest first.
  for (const e of [...buckets.recent].sort((a, b) => b.ts.getTime() - a.ts.getTime())) {
    items.push({
      tier: 'recent',
      kind: kindOf(e),
      symbol: e.symbol,
      headline: e.explanation,
      eventIds: eventIdsOf(e),
      fromTs: e.ts.toISOString(),
      toTs: e.ts.toISOString(),
    });
  }

  // Episodes and chapters: one narrative per symbol per tier.
  for (const tier of ['episode', 'chapter'] as const) {
    const bySymbol = new Map<string, EffectiveEvent[]>();
    for (const e of buckets[tier]) {
      const arr = bySymbol.get(e.symbol) ?? [];
      arr.push(e);
      bySymbol.set(e.symbol, arr);
    }
    for (const [symbol, symEvents] of bySymbol) {
      items.push(...narrateGroup(symbol, symEvents, tier));
    }
  }

  return items;
}
