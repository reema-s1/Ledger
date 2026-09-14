'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LedgerMark } from './ledger-mark';
import { ThemeToggle } from './theme-toggle';

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

export function Nav({ showPlayback = false }: { showPlayback?: boolean }) {
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
          >
            {link.label}
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
