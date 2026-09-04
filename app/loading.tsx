/**
 * Next.js shows this automatically for any route under app/ whose Server
 * Component is still fetching (a real gap now that we know Vercel
 * cold-starts + Neon round-trips aren't instant) — there's no more
 * specific loading.tsx per route, so this one root-level skeleton covers
 * the digest, watchlist, clusters, and symbol pages alike. Shaped
 * roughly like a list of cards rather than a generic spinner, so it
 * reads as "content incoming" instead of an error state.
 */
export default function DigestLoading() {
  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
        <div className="skeleton" style={{ width: 140, height: 26 }} />
        <div className="skeleton" style={{ width: 80, height: 14 }} />
      </div>

      <div className="skeleton" style={{ width: 60, height: 11, marginBottom: 12 }} />

      {[92, 76, 64].map((width, i) => (
        <div
          key={i}
          style={{
            padding: '18px 20px',
            marginBottom: 10,
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div className="skeleton" style={{ width: 120, height: 11, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: `${width}%`, height: 16, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: `${Math.max(width - 25, 30)}%`, height: 16 }} />
        </div>
      ))}
    </main>
  );
}
