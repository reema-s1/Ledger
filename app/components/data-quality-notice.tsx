import { marketMsSinceSessionClose, SESSION_MS, type QuoteQuality } from '../../worker/freshness';
import { istDateString } from '../../src/lib/time/market-calendar';

function sessionLabel(asOf: Date): string {
  return new Date(`${istDateString(asOf)}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Replaces a generic "stale"/"unconfirmed" badge with a sentence: what's
 * actually wrong, since when, and what it means for trusting the number
 * shown (item 4). Only rendered for a non-'fresh' quality — a fresh quote
 * needs no explanation, and showing nothing by default (rather than a
 * reassuring "all good" banner) keeps the default view uncluttered.
 */
export function DataQualityNotice({ quality, asOf, now }: { quality: QuoteQuality; asOf: Date; now: Date }) {
  if (quality === 'fresh') return null;
  // Counted the same way classifyFreshness judged it: open-market time
  // since that session's close, in whole sessions. Whole sessions because
  // prices arrive once a day — "6h old" would imply a feed expected to tick.
  const sessions = Math.max(1, Math.floor(marketMsSinceSessionClose(asOf, now) / SESSION_MS));
  const behind = `${sessions} trading session${sessions === 1 ? '' : 's'}`;
  const day = sessionLabel(asOf);

  const copy: Record<Exclude<QuoteQuality, 'fresh'>, string> = {
    stale: `Latest price is the ${day} close — ${behind} ${sessions === 1 ? "has" : "have"} closed since without a newer one loaded. The number was right for that day; it just isn't the latest session.`,
    // Deliberately doesn't assert the provider is down: this can't tell a
    // failed daily run apart from an unlisted NSE holiday or a suspended
    // stock — all look identical from here. Naming the symptom is the
    // honest version.
    unavailable: `Latest price is the ${day} close, ${behind} behind. The daily update may have failed for this stock, or it may not have traded (an NSE holiday isn't modelled, so it looks the same from here). Shown for reference only.`,
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
