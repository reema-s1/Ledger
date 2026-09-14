import { notFound } from 'next/navigation';
import { isPlaybackEnabled, isExplanationLookupEnabled } from '../../src/lib/feature-flags';
import { hasSession, getCurrentUserId } from '../../src/lib/current-user';
import { listIngestedSessionDates } from '../../db/queries/candles';
import { listWatchlist } from '../../db/queries/watchlist';
import { getFlaggedEventDates } from '../../db/queries/events';
import { Landing } from '../components/landing';
import { PlaybackScrubber } from '../components/playback-scrubber';

export const dynamic = 'force-dynamic';

export default async function PlaybackPage() {
  if (!isPlaybackEnabled()) notFound();
  if (!(await hasSession())) return <Landing />;

  const userId = await getCurrentUserId();
  const watchlist = await listWatchlist(userId);
  const [sessionDates, eventDates] = await Promise.all([
    listIngestedSessionDates(),
    getFlaggedEventDates(watchlist.map((w) => w.symbol)),
  ]);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Playback</h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 0, marginBottom: 32, maxWidth: 560 }}>
        Scrub back through your watchlist&rsquo;s history — the digest and cluster grouping exactly as they
        would have looked on any earlier day, reconstructed live from the event log.
      </p>
      {sessionDates.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)', fontSize: 14 }}>No ingested sessions yet.</p>
      ) : (
        <PlaybackScrubber sessionDates={sessionDates} eventDates={eventDates} showExplain={isExplanationLookupEnabled()} />
      )}
    </main>
  );
}
