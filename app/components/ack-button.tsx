'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEMO_USER_ID } from '../../src/lib/demo-user';

interface AckButtonProps {
  symbol: string;
  upToEventId: number;
  label?: string;
}

export function AckButton({ symbol, upToEventId, label = 'Seen' }: AckButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await fetch('/api/cursor/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
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
      style={{
        background: 'var(--accent-soft)',
        border: 'none',
        borderRadius: 999,
        color: 'var(--up)',
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: '0.02em',
        padding: '5px 12px',
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? '…' : label}
    </button>
  );
}
