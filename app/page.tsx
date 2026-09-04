import { getDigestForUser } from '../src/digest/get-digest';
import { listWatchlist } from '../db/queries/watchlist';
import { DEMO_USER_ID } from '../src/lib/demo-user';
import { DigestCard } from './components/digest-card';
import { EmptyState } from './components/empty-state';
import { MarkAllRead } from './components/mark-all-read';
import type { DigestItem, DigestTier } from '../src/digest/types';

export const dynamic = 'force-dynamic';

const SECTION_LABEL: Record<DigestTier, string> = {
  recent: 'Today',
  episode: 'This week',
  chapter: 'Earlier',
};
const TIER_ORDER: DigestTier[] = ['recent', 'episode', 'chapter'];

function groupByTier(items: DigestItem[]): Map<DigestTier, DigestItem[]> {
  const grouped = new Map<DigestTier, DigestItem[]>();
  for (const tier of TIER_ORDER) grouped.set(tier, []);
  for (const item of items) grouped.get(item.tier)!.push(item);
  return grouped;
}

export default async function DigestPage() {
  const [{ items }, watchlist] = await Promise.all([
    getDigestForUser(DEMO_USER_ID),
    listWatchlist(DEMO_USER_ID),
  ]);

  if (items.length === 0) {
    return (
      <main className="container">
        <EmptyState watchlistCount={watchlist.length} />
      </main>
    );
  }

  const grouped = groupByTier(items);

  const acksBySymbol = new Map<string, number>();
  for (const item of items) {
    const max = Math.max(...item.eventIds);
    acksBySymbol.set(item.symbol, Math.max(acksBySymbol.get(item.symbol) ?? 0, max));
  }
  const allAcks = [...acksBySymbol.entries()].map(([symbol, upToEventId]) => ({ symbol, upToEventId }));

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24 }}>What&rsquo;s new</h1>
        <MarkAllRead acks={allAcks} />
      </div>

      {TIER_ORDER.map((tier) => {
        const tierItems = grouped.get(tier)!;
        if (tierItems.length === 0) return null;
        return (
          <section key={tier} style={{ marginBottom: 36 }}>
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--ink-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {SECTION_LABEL[tier]}
            </h2>
            <div>
              {tierItems.map((item, i) => (
                <DigestCard key={`${item.symbol}-${item.tier}-${i}`} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
