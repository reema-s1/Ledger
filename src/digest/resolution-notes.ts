/**
 * Attaches a resolution's outcome as one clause onto the episode/chapter
 * item that already covers its original event — never touches
 * compact.ts, which has no idea 'resolution' events exist ('resolution'
 * is filtered out before compactEvents runs, same as 'reassurance' — see
 * get-digest.ts). Purely additive: existing headlines are extended, not
 * replaced or recomputed.
 *
 * One real correctness case this handles: a resolution can arrive for an
 * original event the user already read in an earlier visit (its id is
 * below their cursor, so it's not in the current fetch and has no
 * matching item to attach to). Since the resolution event's *own* id is
 * new/unread, it still needs to be shown and ackable — otherwise no ack
 * button would ever cover it and the cursor could never advance past it.
 * Those become small standalone chapter-tier items instead of being
 * silently dropped.
 */

import type { DigestEvent, DigestItem } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface ResolutionPayload {
  originalEventId?: number;
}

export function attachResolutionNotes(items: DigestItem[], resolutionEvents: DigestEvent[], now: Date): DigestItem[] {
  const resolutionByOriginal = new Map<number, DigestEvent>();
  for (const e of resolutionEvents) {
    const originalId = (e.payload as ResolutionPayload).originalEventId;
    if (typeof originalId !== 'number') continue;
    const existing = resolutionByOriginal.get(originalId);
    if (!existing || e.id > existing.id) resolutionByOriginal.set(originalId, e);
  }
  if (resolutionByOriginal.size === 0) return items;

  const matchedOriginalIds = new Set<number>();

  const enriched = items.map((item) => {
    if (item.tier === 'recent') return item; // a same-day resolution for a 5+-session-old event can't land here anyway
    const resolvedEventId = item.eventIds.find((id) => resolutionByOriginal.has(id));
    if (resolvedEventId === undefined) return item;

    matchedOriginalIds.add(resolvedEventId);
    const resolution = resolutionByOriginal.get(resolvedEventId)!;
    const daysAgo = Math.max(1, Math.round((now.getTime() - new Date(item.fromTs).getTime()) / DAY_MS));
    const dayWord = daysAgo === 1 ? 'day' : 'days';
    // A chapter item can fold several moves into one "N moves flagged, net
    // X% since..." headline — appending the resolution clause with the
    // same "Flagged N days ago" framing read as if it graded that whole
    // aggregate, when it's really about just one of those moves. Only
    // reword when there's an aggregate to disambiguate from; a single-move
    // item has nothing to confuse it with.
    const clause =
      item.eventIds.length > 1
        ? (resolution.explanation ?? '').replace(
            /^Flagged for [^—]+—\s*/,
            `One of those, flagged ${daysAgo} ${dayWord} ago — `,
          )
        : (resolution.explanation ?? '').replace(/^Flagged for /, `Flagged ${daysAgo} ${dayWord} ago for `);

    return {
      ...item,
      headline: `${item.headline} ${clause}`,
      eventIds: [...item.eventIds, resolution.id],
      resolutionNote: clause,
    };
  });

  const orphaned: DigestItem[] = [];
  for (const [originalId, resolution] of resolutionByOriginal) {
    if (matchedOriginalIds.has(originalId)) continue;
    orphaned.push({
      tier: 'chapter',
      kind: 'resolved',
      symbol: resolution.symbol,
      headline: (resolution.explanation ?? '').replace(/^Flagged for /, 'Flagged earlier for '),
      eventIds: [resolution.id],
      fromTs: resolution.ts.toISOString(),
      toTs: resolution.ts.toISOString(),
    });
  }

  return [...enriched, ...orphaned];
}
