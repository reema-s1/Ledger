'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'ledger:theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private-browsing/storage-blocked: the toggle still works for this
    // load, it just won't be remembered next visit.
  }
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.5" y2="6.5" />
        <line x1="17.5" y1="17.5" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.5" y2="17.5" />
        <line x1="17.5" y1="6.5" x2="19.6" y2="4.4" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.5A9 9 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * One icon button, not a two-option pill — it shows the theme currently
 * active (sun = light, moon = dark) and clicking it flips straight to
 * the other. No shared React state with other instances (Nav and
 * Landing never render at once, so nothing needs to stay in sync).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setTheme(stored === 'light' || stored === 'dark' ? stored : getSystemTheme());
  }, []);

  if (theme === null) return null;

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        border: '1px solid var(--rule)',
        borderRadius: '50%',
        background: 'none',
        color: 'var(--ink-muted)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
