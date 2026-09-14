import Link from 'next/link';
import type { TriggeredThreshold } from '../../db/queries/watch-thresholds';

/**
 * A standalone bell, top-right of the content area on every page — not
 * tucked inside a nav link, so it's visible even if someone never
 * scrolls to or clicks the Watchlist item. Still purely passive by
 * design (item 19's whole point): no push notification, no popup outside
 * the browser tab, nothing proactive — just visible the moment you're
 * looking at any page, where a triggered reminder previously wasn't
 * visible anywhere except by manually opening /watchlist and scanning
 * every row.
 *
 * `position: sticky` inside `.app-main` (not `position: fixed` on the
 * viewport) deliberately — that way it naturally sits to the right of
 * the desktop sidebar and below the mobile top bar without any manual
 * breakpoint math to avoid overlapping either.
 */
export function NotificationBell({ triggered }: { triggered: TriggeredThreshold[] }) {
  const count = triggered.length;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', justifyContent: 'flex-end', padding: '16px 24px 0' }}>
      <Link
        href="/watchlist"
        aria-label={count > 0 ? `${count} personal reminder${count > 1 ? 's' : ''} hit — view watchlist` : 'No personal reminders hit'}
        title={count > 0 ? `Reminder${count > 1 ? 's' : ''} hit: ${triggered.map((t) => t.symbol).join(', ')}` : 'No personal reminders hit'}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          textDecoration: 'none',
          fontSize: 15,
        }}
      >
        🔔
        {count > 0 && (
          <span
            aria-hidden="true"
            className="tabular"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--accent-blue)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              border: '1.5px solid var(--bg)',
            }}
          >
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}
