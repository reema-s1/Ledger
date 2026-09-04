'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClientUserId } from '../../src/lib/current-user-client';

export function MarkAllRead({ acks }: { acks: { symbol: string; upToEventId: number }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const userId = getClientUserId();
      await Promise.all(
        acks.map((a) =>
          fetch('/api/cursor/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              symbol: a.symbol,
              up_to_event_id: a.upToEventId,
              device_id: 'web',
            }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--accent-blue)',
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: '0.01em',
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.5 : 1,
        padding: 0,
      }}
    >
      {pending ? 'Marking read…' : 'Mark all read'}
    </button>
  );
}
