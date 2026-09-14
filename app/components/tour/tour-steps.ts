/**
 * Step data for the guided product tour (app/components/tour/
 * product-tour.tsx). Each step names the real page and the real
 * `data-tour="..."` attribute on the actual rendered element — never a
 * separate mocked-up screenshot or fabricated UI, the tour walks the
 * live app.
 *
 * `page` drives cross-route navigation (the tour spans six real
 * screens); `optional` steps are skipped outright — before even
 * navigating — when the matching feature flag is off, so a viewer who's
 * never enabled Playback/the explanation lookup never gets steered at
 * a page that would 404 or show nothing.
 */
export interface TourStep {
  page: string;
  selector: string;
  title: string;
  description: string;
  /** Only include this step when the named flag is true — checked against ProductTour's own flags prop. */
  optional?: 'playback';
}

export const TOUR_STEPS: TourStep[] = [
  {
    page: '/',
    selector: '[data-tour="nav-links"]',
    title: 'Six real screens',
    description:
      'Digest, Watchlist, Clusters, System, and (if enabled) Playback — every one of them queries the live database, nothing here is a mockup.',
  },
  {
    page: '/',
    selector: '[data-tour="notification-bell"]',
    title: 'Personal reminders',
    description:
      "If you've set a manual move-size reminder on any stock, it shows up here — on every page, not just the watchlist. Click it any time to see what's triggered.",
  },
  {
    page: '/',
    selector: '[data-tour="digest-cards"]',
    title: 'The diff, not the state',
    description:
      "Every card leads with a real sentence, not a raw price. If a card shows the four small metrics under its headline (volume, move vs. cluster, z-score, signal), that's the significance engine's own math — not a summary written after the fact.",
  },
  {
    page: '/',
    selector: '[data-tour="ask-log"]',
    title: 'Ask the log',
    description:
      'Type a plain question about your watchlist. The answer is assembled entirely from real stored events — no AI guessing, every word traceable to something that actually happened.',
  },
  {
    page: '/watchlist',
    selector: '[data-tour="watchlist-table"]',
    title: 'Your real watchlist',
    description: 'Price, today’s move, a chart, real 1D volume, and a range bar honestly labeled by how much history is actually behind it.',
  },
  {
    page: '/watchlist',
    selector: '[data-tour="sparkline"]',
    title: 'Real markers, real cursor',
    description:
      'The small dots mark real flagged events. The dotted line is where you last left off — the line after it only turns color when something real actually cleared the significance bar since then, never just because the price moved.',
  },
  {
    page: '/watchlist',
    selector: '[data-tour="personal-threshold"]',
    title: 'Set your own reminder',
    description:
      '"Notify me if this moves more than X%" — a manual, personal note, deliberately styled differently from the engine’s own colors so it never reads as part of its judgment.',
  },
  {
    page: '/clusters',
    selector: '[data-tour="cluster-visual"]',
    title: 'Real correlation, not sector labels',
    description:
      'These groups come from real pairwise return correlation on real price history — hover a group to see it up close, click any dot to open that stock.',
  },
  {
    page: '/clusters',
    selector: '[data-tour="divergence-list"]',
    title: "Who's drifting right now",
    description: 'Each group is sorted by how far every member has actually diverged from it today — not just who belongs to it.',
  },
  {
    page: '/playback',
    selector: '[data-tour="playback-controls"]',
    title: 'Time travel',
    description:
      'Scrub to any real day, or jump straight to the next real flagged event — reconstructed live from the same event log the digest reads, not a recording.',
    optional: 'playback',
  },
  {
    page: '/system',
    selector: '[data-tour="system-page"]',
    title: 'The honest page',
    description: 'Real polling intervals, real source disagreements, real data quality — nothing on this page is illustrative.',
  },
];
