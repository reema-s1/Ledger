import { hasSession } from '../../src/lib/current-user';
import { Landing } from '../components/landing';
import { FailureDrills } from '../components/failure-drills';

export const dynamic = 'force-dynamic';

export default async function SimulatePage() {
  if (!(await hasSession())) return <Landing />;

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Simulate</h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 0, marginBottom: 24, maxWidth: 600, lineHeight: 1.55 }}>
        Made-up prices for a made-up stock, run through the same code the daily ingest uses — so you can see what
        happens when a feed misbehaves or the market falls. Nothing here is saved, and none of it touches your
        watchlist or digest.
      </p>
      <FailureDrills />
    </main>
  );
}
