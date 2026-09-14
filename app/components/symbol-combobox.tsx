'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboboxSymbol {
  symbol: string;
  name: string;
  sector: string;
}

function label(s: ComboboxSymbol): string {
  return `${s.symbol} — ${s.name}`;
}

/**
 * A type-to-filter replacement for the plain `<select>` the watchlist's
 * add control used to be. With ~28 symbols left after a starter watchlist
 * takes its share, a native select means scrolling a long unordered list
 * hunting for a ticker you already know the name of — and because the
 * seed universe is deliberately finance-heavy (src/seed/symbols.ts groups
 * 19 of 40 symbols across Banking/PSU Bank/NBFC so correlation clustering
 * has real structure to find), what's left in that list reads as almost
 * all banks and pharma, which makes the scrolling worse.
 *
 * Filtering matches ticker *or* company name, so "tata" finds TCS and
 * TATAPOWER while "bank" finds the whole banking block — a user who knows
 * the company but not the NSE ticker (the common case) can still get
 * there. An empty box shows everything, so it never hides the full list
 * behind knowing what to type.
 */
export function SymbolCombobox({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: ComboboxSymbol[];
  value: string;
  onChange: (symbol: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = 'symbol-combobox-list';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlight inside the list as filtering shrinks it, or a
  // stale index from a previous, longer result set would point past the end.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function pick(s: ComboboxSymbol) {
    onChange(s.symbol);
    setQuery(label(s));
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((h) => {
        if (filtered.length === 0) return 0;
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      // Enter on a typed query picks the top match rather than doing
      // nothing — "type the name, press enter" is the whole point of
      // replacing the select, and requiring a deliberate click would
      // undo it.
      const choice = filtered[highlighted] ?? filtered[0];
      if (open && choice) {
        e.preventDefault();
        pick(choice);
      }
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label="Search symbols to add"
        placeholder="Search by ticker or company…"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // A typed query no longer corresponds to the last pick, so the
          // Add button must go back to disabled until something is chosen
          // again — otherwise a half-typed box could still add whatever
          // was selected before it.
          if (value) onChange('');
        }}
        onFocus={() => {
          setOpen(true);
          inputRef.current?.select();
        }}
        onKeyDown={handleKeyDown}
        className="tabular"
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          color: 'var(--ink)',
          fontSize: 13,
        }}
      />

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow)',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
              No symbol matches “{query.trim()}”.
            </li>
          ) : (
            filtered.map((s, i) => (
              <li key={s.symbol} role="option" aria-selected={s.symbol === value}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  onMouseEnter={() => setHighlighted(i)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: i === highlighted ? 'var(--accent-soft)' : 'transparent',
                    color: 'var(--ink)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span className="tabular" style={{ fontWeight: 600 }}>
                    {s.symbol}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', textAlign: 'right' }}>
                    {s.name} · {s.sector}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
