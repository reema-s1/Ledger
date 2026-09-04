'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LedgerMark } from './ledger-mark';

/**
 * The gate in front of the digest/watchlist/cluster routes. Two ways in:
 * a zero-friction guest account (a fresh one per session, so concurrent
 * reviewers never see each other's changes — see api/auth/guest), or a
 * login stub whose real purpose is letting the same account be reached
 * from a second tab/device to watch cursor reconciliation happen live.
 */
export function Landing() {
  const router = useRouter();
  const [guestPending, setGuestPending] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleGuest() {
    setGuestPending(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      if (!res.ok) throw new Error('guest sign-in failed');
      router.refresh();
    } catch {
      setGuestPending(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginPending(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoginError(body?.error ?? 'Could not log in.');
        setLoginPending(false);
        return;
      }
      router.refresh();
    } catch {
      setLoginError('Could not reach the server.');
      setLoginPending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '1.5px solid var(--rule)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LedgerMark size={16} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center' }}>Ledger</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-muted)', textAlign: 'center', margin: 0, maxWidth: 300 }}>
            A watchlist that shows the diff, not the state.
          </p>
        </div>

        <button
          onClick={handleGuest}
          disabled={guestPending}
          style={{
            width: '100%',
            padding: '13px 18px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 700,
            fontSize: 14.5,
            cursor: guestPending ? 'default' : 'pointer',
            opacity: guestPending ? 0.7 : 1,
          }}
        >
          {guestPending ? 'Setting up your watchlist…' : 'Try as Guest'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', margin: '8px 0 0' }}>
          A fresh account with a pre-built watchlist. No sign-up.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            or log in
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="tabular"
            style={{
              padding: '11px 14px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 14,
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="tabular"
            style={{
              padding: '11px 14px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 14,
            }}
          />
          {loginError && (
            <p style={{ fontSize: 12.5, color: 'var(--down)', margin: 0 }}>{loginError}</p>
          )}
          <button
            type="submit"
            disabled={loginPending || !username || !password}
            style={{
              padding: '12px 18px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--ink)',
              fontWeight: 600,
              fontSize: 14,
              cursor: loginPending || !username || !password ? 'default' : 'pointer',
              opacity: loginPending ? 0.6 : 1,
            }}
          >
            {loginPending ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-faint)', textAlign: 'center', margin: '10px 0 0' }}>
          demo account: <strong style={{ color: 'var(--ink-muted)' }}>demo</strong> /{' '}
          <strong style={{ color: 'var(--ink-muted)' }}>demo</strong>
        </p>
      </div>
    </main>
  );
}
