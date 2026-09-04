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
    </main>
  );
}
