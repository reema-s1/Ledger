'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClientUserId } from '../../src/lib/current-user-client';

interface AckButtonProps {
  symbol: string;
  upToEventId: number;
  label?: string;
  /** For cards that must never visually compete with a real alert (e.g. reassurance) — plain text, no pill. */
  quiet?: boolean;
}

export function AckButton({ symbol, upToEventId, label = 'Mark seen', quiet = false }: AckButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await fetch('/api/cursor/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: getClientUserId(),
          symbol,
          up_to_event_id: upToEventId,
          device_id: 'web',
        }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={quiet ? undefined : 'ack-btn'}
      style={
        quiet
          ? {
              background: 'none',
              border: 'none',
              color: 'var(--ink-faint)',
              fontSize: 11.5,
              padding: 0,
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.5 : 1,
            }
          : undefined
      }
    >
      {pending ? '…' : label}
    </button>
  );
}
