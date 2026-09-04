import { query, withTransaction } from '../client';

export interface ClusterRow {
  cluster_id: string;
  session_date: string;
  members: string[];
  method: string;
}

export interface ClusterInput {
  clusterId: string;
  members: string[];
  method: string;
}

/**
 * Replaces the full cluster set for a session date in one transaction
 * (delete + insert), since clustering is recomputed wholesale weekly
 * (Section 4), not incrementally.
 */
export async function replaceClustersForDate(sessionDate: string, clusters: ClusterInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM clusters WHERE session_date = $1', [sessionDate]);
    for (const c of clusters) {
      await client.query(
        `INSERT INTO clusters (cluster_id, session_date, members, method)
         VALUES ($1, $2, $3, $4)`,
        [c.clusterId, sessionDate, c.members, c.method],
      );
    }
  });
}

export async function getClustersForDate(sessionDate: string): Promise<ClusterRow[]> {
  return query<ClusterRow>('SELECT * FROM clusters WHERE session_date = $1 ORDER BY cluster_id', [
    sessionDate,
  ]);
}

/** Most recent session date that has a cluster set computed, if any. */
export async function getLatestClusterDate(): Promise<string | null> {
  const rows = await query<{ session_date: string }>(
    'SELECT DISTINCT session_date FROM clusters ORDER BY session_date DESC LIMIT 1',
  );
  return rows[0]?.session_date ?? null;
}

/**
 * The most recently computed cluster set at or before `sessionDate` —
 * clusters are recomputed weekly (Section 4), so most dates have no row
 * of their own; Playback's scrubber needs "whichever snapshot was in
 * effect on this day," not an exact match.
 */
export async function getClustersAsOf(sessionDate: string): Promise<ClusterRow[]> {
  const rows = await query<{ session_date: string }>(
    'SELECT DISTINCT session_date FROM clusters WHERE session_date <= $1 ORDER BY session_date DESC LIMIT 1',
    [sessionDate],
  );
  const nearest = rows[0]?.session_date;
  if (!nearest) return [];
  return getClustersForDate(nearest);
}

/** The most recently computed cluster containing `symbol`, if any. */
export async function getLatestClusterForSymbol(symbol: string): Promise<ClusterRow | null> {
  const latestDate = await getLatestClusterDate();
  if (!latestDate) return null;
  const rows = await query<ClusterRow>(
    'SELECT * FROM clusters WHERE session_date = $1 AND $2 = ANY(members)',
    [latestDate, symbol],
  );
  return rows[0] ?? null;
}
