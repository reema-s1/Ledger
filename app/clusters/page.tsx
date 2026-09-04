import Link from 'next/link';
import { getLatestClusterDate, getClustersForDate } from '../../db/queries/clusters';
import { getRecentlyMovedSymbols } from '../../db/queries/events';
import { ClusterVisual, type ClusterVisualGroup } from '../components/cluster-visual';

export const dynamic = 'force-dynamic';

function formatClusterLabel(clusterId: string, method: string): string {
  if (method === 'sector') return clusterId.replace('sector:', '');
  return clusterId;
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

  const groups: ClusterVisualGroup[] = clusters.map((c) => ({
    id: c.cluster_id,
    label: formatClusterLabel(c.cluster_id, c.method),
    members: c.members,
  }));

  const method = clusters[0]?.method ?? 'sector';

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
      <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 0, marginBottom: 32 }}>
        <span style={{ color: 'var(--down)' }}>●</span> structural break &nbsp;
        <span style={{ color: 'var(--unconfirmed)' }}>●</span> recent move &nbsp;
        <span style={{ color: 'var(--accent)' }}>●</span> tracking its group
      </p>

      <ClusterVisual groups={groups} moved={moved} />

      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((g) => (
          <div key={g.id}>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{g.label}</span> —{' '}
              {method === 'sector'
                ? `these move together, all ${g.label} companies.`
                : 'these have moved together over the past 130 sessions.'}{' '}
              <span style={{ color: 'var(--ink-faint)' }}>tap a symbol below, then "Why grouped?" for the numbers.</span>
            </p>
            <p className="tabular" style={{ fontSize: 12.5, margin: 0 }}>
              {g.members.map((m, i) => (
                <span key={m}>
                  <Link href={`/symbol/${m}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                    {m}
                  </Link>
                  {i < g.members.length - 1 ? <span style={{ color: 'var(--ink-faint)' }}>, </span> : null}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
