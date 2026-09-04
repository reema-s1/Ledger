import { getDigestForUser } from '../src/digest/get-digest';
import { listWatchlist } from '../db/queries/watchlist';
import { hasSession, getCurrentUserId } from '../src/lib/current-user';
import { AskLog } from './components/ask-log';
import { DigestCard } from './components/digest-card';
import { EmptyState } from './components/empty-state';
import { Landing } from './components/landing';
import { MarkAllRead } from './components/mark-all-read';
import { ReassuranceCard } from './components/reassurance-card';
import { ResolutionStatsLine } from './components/resolution-stats-line';
import { SimpleDetailProvider } from './components/simple-detail-context';
import { SimpleDetailToggle } from './components/simple-detail-toggle';
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
  if (!(await hasSession())) {
    return <Landing />;
  }
  const userId = await getCurrentUserId();

  const [{ items, reassurance, resolutionStats }, watchlist] = await Promise.all([
    getDigestForUser(userId),
    listWatchlist(userId),
  ]);

  if (items.length === 0) {
    return (
      <main className="container">
        <EmptyState watchlistCount={watchlist.length} />
        {reassurance.length > 0 && (
          <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 20 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--ink-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Explained moves
            </h2>
            {reassurance.map((card) => (
              <ReassuranceCard key={card.eventId} card={card} />
            ))}
          </div>
        )}
        <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>
          <ResolutionStatsLine stats={resolutionStats} />
          <AskLog />
        </div>
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
    <SimpleDetailProvider>
      <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, gap: 16 }}>
          <h1 style={{ fontSize: 24 }}>What&rsquo;s new</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <SimpleDetailToggle />
            <MarkAllRead acks={allAcks} />
          </div>
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

        {reassurance.length > 0 && (
          <section style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--rule)' }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--ink-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Explained moves
            </h2>
            {reassurance.map((card) => (
              <ReassuranceCard key={card.eventId} card={card} />
            ))}
          </section>
        )}

        <ResolutionStatsLine stats={resolutionStats} />
        <AskLog />
      </main>
    </SimpleDetailProvider>
  );
}
