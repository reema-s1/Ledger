'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LedgerMark } from './ledger-mark';

const LINKS = [
  { href: '/', label: 'Digest' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/clusters', label: 'Clusters' },
];

/** A symbol page ("/symbol/TCS") counts as active under Digest — there's no nav item of its own for it. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/symbol/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header
      style={{
        borderBottom: '1px solid var(--rule)',
        background: 'var(--bg)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            fontFamily: 'var(--font-sans)',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            textDecoration: 'none',
            color: 'var(--ink)',
          }}
        >
          <LedgerMark />
          Ledger
        </Link>
        <nav style={{ display: 'flex', gap: 24 }}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              data-active={isActive(pathname, link.href)}
              style={{
                fontSize: 13.5,
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
