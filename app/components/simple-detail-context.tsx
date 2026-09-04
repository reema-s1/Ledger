'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ExplanationMode = 'simple' | 'detailed';

const SimpleDetailContext = createContext<[ExplanationMode, (mode: ExplanationMode) => void]>([
  'simple',
  () => {},
]);

const STORAGE_KEY = 'ledger:explanation-mode';

/**
 * Per-session, not per-user — cheaper given the scope of this addition,
 * and explicitly sanctioned as an acceptable tradeoff. Persisted to
 * localStorage purely for convenience across reloads in the same
 * browser; never sent to the server, never computes anything new.
 */
export function SimpleDetailProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ExplanationMode>('simple');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'simple' || stored === 'detailed') setModeState(stored);
    } catch {
      // localStorage can throw (private browsing, blocked storage) — default stands.
    }
  }, []);

  function setMode(next: ExplanationMode) {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort; the in-memory state change above still applies for this session.
    }
  }

  return <SimpleDetailContext.Provider value={[mode, setMode]}>{children}</SimpleDetailContext.Provider>;
}

export function useSimpleDetail(): [ExplanationMode, (mode: ExplanationMode) => void] {
  return useContext(SimpleDetailContext);
}
