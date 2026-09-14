import type { QuoteQuality } from '../../worker/freshness';
import { marketOpenMsBetween } from '../../src/lib/time/market-calendar';
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
  // Open-market age, matching what classifyFreshness actually measured to
  // arrive at this quality — quoting wall-clock age here instead would
  // read as "3d old" for a Friday close looked at on Monday morning,
  // which is both alarming and not the number any threshold was judged
  // against.
  const age = formatAge(marketOpenMsBetween(asOf, now));

  const copy: Record<Exclude<QuoteQuality, 'fresh'>, string> = {
    stale: `Last confirmed price is ${age} old — polling hasn't caught up to this symbol's usual cadence yet. The number is real and was trustworthy when it printed; it just isn't current-to-the-minute.`,
    // Deliberately doesn't assert the provider is down, because this can't
    // tell that apart from an unmodelled NSE holiday or ingestion simply
    // not having run — all three look identical from here (a session's
    // worth of open market with no new print). Naming the symptom rather
    // than guessing at a cause is the honest version; the age shown is
    // already measured in open-market time, so a weekend never triggers it.
    unavailable: `No new price through ${age} of open market — well past this symbol's expected refresh interval, not just one slow poll. That usually means the feed has stopped answering, though an unlisted market holiday looks the same from here. Showing the last confirmed price for reference; treat it as informational until it refreshes.`,
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
