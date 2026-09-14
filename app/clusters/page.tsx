import { getLatestClusterDate, getClustersForDate } from '../../db/queries/clusters';
import { getRecentlyMovedSymbols } from '../../db/queries/events';
import { explainWhyQuietForSymbols } from '../../src/digest/why-quiet';
import { ClusterVisual, type ClusterVisualGroup } from '../components/cluster-visual';
import { DivergenceRow } from '../components/divergence-row';

export const dynamic = 'force-dynamic';

/**
 * Correlation cluster ids (e.g. "c52") are internal merge-order counters
 * from the hierarchical clustering algorithm (src/clustering/
 * correlation.ts) — every symbol starts as its own singleton "c0..c{n-1}",
 * and every merge creates a new "c{nextId++}", continuing that same
 * counter. They were never meant to be shown to a user; this assigns a
 * clean display number instead, ordered by a stable, meaningful sort
 * (largest group first, tie-broken alphabetically) rather than exposing
 * "the 52nd merge operation" as if it meant something.
 */
function withDisplayLabels(groups: { id: string; members: string[]; method: string }[]) {
  const sorted = [...groups].sort((a, b) => {
    if (b.members.length !== a.members.length) return b.members.length - a.members.length;
    return a.members[0]!.localeCompare(b.members[0]!);
  });
  return sorted.map((g, i) => ({
    ...g,
    label: g.method === 'sector' ? g.id.replace('sector:', '') : `Group ${i + 1}`,
  }));
}

export default async function ClustersPage() {
  const latestDate = await getLatestClusterDate();

  if (!latestDate) {
    return (
      <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Clusters</h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 14 }}>
          No clusters computed yet — run <code className="tabular">npm run clusters:recompute</code>.
        </p>
      </main>
    );
  }

  const sinceDate = new Date(new Date(latestDate).getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [clusters, moved] = await Promise.all([
    getClustersForDate(latestDate),
    getRecentlyMovedSymbols(sinceDate),
  ]);

  const method = clusters[0]?.method ?? 'sector';

  const groups: ClusterVisualGroup[] = withDisplayLabels(
    clusters.map((c) => ({ id: c.cluster_id, members: c.members, method: c.method })),
  );

  // Item 15: peer-group divergence, extending this same screen rather than
  // a parallel view — the real decomposition (already computed for "Show
  // me anyway") re-read for every clustered symbol, not just watchlisted
  // ones, so every group shows who's actually drifting from its peers
  // right now, not just who belongs to it.
  const allMembers = groups.flatMap((g) => g.members);
  const divergence = await explainWhyQuietForSymbols(allMembers);
  const divergenceBySymbol = new Map(divergence.map((d) => [d.symbol, d]));
  const maxAbsZ = Math.max(1, ...divergence.map((d) => (d.residualZ !== null ? Math.abs(d.residualZ) : 0)));

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Clusters</h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 0, marginBottom: 8 }}>
        As of {latestDate} ·{' '}
        {method === 'sector'
          ? 'grouped by sector — not enough history yet for correlation clustering'
          : 'grouped by 90-session return correlation'}
        .
      </p>
      <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 0, marginBottom: 32, maxWidth: 620, lineHeight: 1.6 }}>
        <span style={{ color: 'var(--down)' }}>●</span> structural break &nbsp;
        <span style={{ color: 'var(--unconfirmed)' }}>●</span> recent move &nbsp;
        <span style={{ color: 'var(--accent)' }}>●</span> tracking its group
        <br />
        Every dot is a spoke back to its group's center — a faint one by default, a bold colored one only if that
        stock has actually moved recently. Distance from center and spoke weight both say the same thing: how far
        this stock has drifted from its group. Click any dot to open that symbol.
      </p>

      <ClusterVisual groups={groups} moved={moved} />

      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.map((g, i) => {
          const sortedMembers = [...g.members].sort((a, b) => {
            const za = divergenceBySymbol.get(a)?.residualZ;
            const zb = divergenceBySymbol.get(b)?.residualZ;
            return Math.abs(zb ?? 0) - Math.abs(za ?? 0);
          });
          return (
            // The tour targets just the first group, not the whole
            // (often page-length) list — see the same reasoning on the
            // watchlist table's header row above.
            <div key={g.id} data-tour={i === 0 ? 'divergence-list' : undefined}>
              <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 10px' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{g.label}</span> —{' '}
                {method === 'sector'
                  ? `these move together, all ${g.label} companies.`
                  : 'these have moved together over the past 130 sessions.'}{' '}
                <span style={{ color: 'var(--ink-faint)' }}>sorted by divergence from the group right now — tap a symbol, then "Why grouped?" for the numbers.</span>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sortedMembers.map((m) => {
                  const d = divergenceBySymbol.get(m);
                  return (
                    <DivergenceRow
                      key={m}
                      entry={{ symbol: m, residualZ: d?.residualZ ?? null, clearedBar: d?.clearedBar ?? false }}
                      maxAbsZ={maxAbsZ}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
