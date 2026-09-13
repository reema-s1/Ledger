import type { QuoteQuality } from '../../worker/freshness';
import { formatAge } from '../lib/format';

/**
 * Replaces a generic "stale"/"unconfirmed" badge with a sentence: what's
 * actually wrong, since when, and what it means for trusting the number
 * shown (item 4). Only rendered for a non-'fresh' quality — a fresh quote
 * needs no explanation, and showing nothing by default (rather than a
 * reassuring "all good" banner) keeps the default view uncluttered.
 */
export function DataQualityNotice({ quality, asOf, now }: { quality: QuoteQuality; asOf: Date; now: Date }) {
  if (quality === 'fresh') return null;
  const age = formatAge(now.getTime() - asOf.getTime());

  const copy: Record<Exclude<QuoteQuality, 'fresh'>, string> = {
    stale: `Last confirmed price is ${age} old — polling hasn't caught up to this symbol's usual cadence yet. The number is real and was trustworthy when it printed; it just isn't current-to-the-minute.`,
    unavailable: `Data provider unreachable for ${age} — well past this symbol's expected refresh interval, not just one slow poll. Showing the last known price for reference; treat it as informational until the feed recovers.`,
    invalid: `The last print didn't survive two-source reconciliation (sources disagreed beyond tolerance) — recorded for the history, but never used to raise an alert. Don't treat this as a trustworthy current price.`,
  };

  const color = quality === 'invalid' || quality === 'unavailable' ? 'var(--down)' : 'var(--unconfirmed)';

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--ink-muted)',
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        padding: '10px 14px',
        marginBottom: 16,
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
      <span>{copy[quality]}</span>
    </div>
  );
}
