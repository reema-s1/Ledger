'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LedgerMark } from './ledger-mark';
import { ThemeToggle } from './theme-toggle';
import type { TriggeredThreshold } from '../../db/queries/watch-thresholds';

const LINKS = [
  { href: '/', label: 'Digest' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/clusters', label: 'Clusters' },
  { href: '/system', label: 'System' },
];

const PLAYBACK_LINK = { href: '/playback', label: 'Playback' };

/** A symbol page ("/symbol/TCS") counts as active under Digest — there's no nav item of its own for it. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/symbol/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

export function Nav({
  showPlayback = false,
  triggered = [],
}: {
  showPlayback?: boolean;
  /** Personal reminders (item 19) that today's real move actually exceeds — visible from every page, not only /watchlist, since that was a real gap: a triggered reminder was previously invisible unless you happened to visit that one page. Still purely passive — no push, no popup, just a badge on the nav item that leads to the detail. */
  triggered?: TriggeredThreshold[];
}) {
  const pathname = usePathname();
  const links = showPlayback ? [...LINKS, PLAYBACK_LINK] : LINKS;

  return (
    <header className="app-nav">
      <Link href="/" className="app-nav-logo">
        <LedgerMark />
        Ledger
      </Link>

      <nav className="app-nav-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link app-nav-link"
            data-active={isActive(pathname, link.href)}
            style={{ position: 'relative' }}
            title={
              link.href === '/watchlist' && triggered.length > 0
                ? `Reminder${triggered.length > 1 ? 's' : ''} hit: ${triggered.map((t) => t.symbol).join(', ')}`
                : undefined
            }
          >
            {link.label}
            {link.href === '/watchlist' && triggered.length > 0 && (
              <span
                aria-label={`${triggered.length} personal reminder${triggered.length > 1 ? 's' : ''} hit`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  marginLeft: 6,
                  borderRadius: 999,
                  background: 'var(--accent-blue)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  verticalAlign: 'middle',
                }}
              >
                🔔{triggered.length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="app-nav-footer">
        <ThemeToggle />
        <button onClick={handleLogout} className="nav-link app-nav-link app-nav-logout">
          Log out
        </button>
      </div>
    </header>
  );
}
