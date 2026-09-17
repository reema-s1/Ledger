'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { TOUR_STEPS } from './tour-steps';

const SEEN_KEY = 'ledger:tour-seen';

/**
 * A spotlight guided tour across six real pages, built on driver.js
 * (framework-agnostic, so no React-version peer-dependency risk) rather
 * than hand-rolled — the app doesn't avoid libraries on principle
 * (nothing here reinvents what a well-tested one already does well),
 * only avoids them where a plain, small solution was just as good (the
 * hand-drawn cluster SVG, no chart library).
 *
 * The real complexity isn't driver.js itself — it's that the tour spans
 * multiple Next.js routes, and each route is a fresh DOM tree. driver.js
 * only knows how to highlight elements already on the page, so page
 * transitions are driven manually: `onNextClick`/`onPrevClick` check
 * whether the next/previous step lives on a different route, navigate
 * there first if so, and a `pathname` effect resumes the same driver.js
 * instance once the new page has actually rendered — `waitForElement` +
 * `skipMissingElement` in the per-step config absorb the timing gap and
 * gracefully skip a step whose element genuinely isn't there (e.g. a
 * feature-flagged page that's off), rather than erroring.
 */
export function ProductTour({ playbackEnabled }: { playbackEnabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const driverRef = useRef<Driver | null>(null);
  const pendingRef = useRef<'start' | 'next' | 'prev' | null>(null);
  const [steps] = useState(() => TOUR_STEPS.filter((s) => s.optional !== 'playback' || playbackEnabled));

  // The popover is driver.js's own DOM node, positioned against whatever
  // element is currently highlighted — it has no idea a route change is
  // about to sweep that element away. Without this, it just sits there
  // showing the outgoing step, in the outgoing step's position, for the
  // whole gap between calling router.push() and the new page's target
  // element actually existing to highlight (the resume effect's own
  // timeout, plus driver.js's own waitForElement polling on top of that).
  // Fading it out the instant navigation starts, and back in only once the
  // next step is actually correctly positioned (onHighlighted, below),
  // turns that stale-card flash into a clean crossfade.
  //
  // Toggling a class on <body> rather than the popover's own inline style:
  // driver.js repositions the popover in response to scroll/resize events
  // that a route change can itself trigger, and that redraw resets
  // whatever inline opacity we'd set on it directly. A class on an
  // ancestor driver.js never touches, paired with an !important rule
  // (app/globals.css), survives any number of those redraws.
  function setPopoverVisible(visible: boolean) {
    document.body.classList.toggle('ledger-tour-transitioning', !visible);
  }

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Best-effort — worst case the tour just offers to auto-start again next time.
    }
    setPopoverVisible(true);
    driverRef.current?.destroy();
    driverRef.current = null;
  }

  function launch(startIndex: number) {
    driverRef.current?.destroy();

    const d = driver({
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 10,
      animate: true,
      smoothScroll: true,
      popoverClass: 'ledger-tour-popover',
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      doneBtnText: 'Done',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      onCloseClick: () => finish(),
      onDestroyed: () => {
        driverRef.current = null;
      },
      // Reveal whenever driver.js has landed on a step for the page we're
      // actually on now — not "the exact index we asked for". A slow page
      // (clusters' query is the heaviest in the app, and it just got
      // slower once Neon's compute was capped for cost reasons) can blow
      // past waitForElement below, and driver.js's own skipMissingElement
      // fallback then silently advances PAST the step we requested to
      // whichever one it finds next, entirely inside its own retry loop —
      // our onNextClick/goTo is never called for that hop. Gating the
      // reveal on an exact index match meant that hop left the popover
      // faded out forever: driver.js had genuinely moved on, our own
      // bookkeeping just never found out, so nothing ever un-hid it. This
      // check needs no bookkeeping of its own — it trusts whatever driver.js
      // actually just highlighted, which self-heals from a skip instead of
      // needing to predict one.
      onHighlighted: (_element, _step, opts) => {
        const idx = opts.index;
        if (typeof idx === 'number' && steps[idx]?.page === window.location.pathname) {
          setPopoverVisible(true);
        }
      },
      // driver.js decides which handler the Next/Done button actually
      // *runs* (not just which label it shows) by checking whether any
      // later step's element is already sitting in the DOM right now — a
      // fine heuristic on one page, but every step on a page we haven't
      // navigated to yet fails it, and a global onDoneClick means driver.js
      // always has a Done handler ready to reach for. So the *click*, not
      // just the label, silently ran finish() at the last step on each
      // page: no error, no navigation, the popover just vanished. The fix
      // is giving onDoneClick to only the true final step's own popover
      // (never the shared config) — with no global onDoneClick, that
      // lookup comes up empty everywhere else and the click always falls
      // through to our own onNextClick, regardless of driver.js's guess.
      steps: steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        return {
          element: s.selector,
          // Generous enough for a client-side route transition plus a
          // server-rendered page's data fetch to land — clusters' query in
          // particular (every symbol's divergence, on top of the cluster
          // groups themselves) is the heaviest page in the app, and can
          // genuinely take a few seconds on a cold or low-compute database.
          // A step whose element truly never shows up (a feature-flagged
          // page that's off) still resolves cleanly via skipMissingElement
          // below — this is purely about not giving up on a real element
          // that's just slow to arrive.
          waitForElement: 6000,
          skipMissingElement: true,
          popover: {
            title: s.title,
            description: s.description,
            ...(isLast ? { onDoneClick: () => finish() } : { nextBtnText: 'Next' }),
            onNextClick: () => goTo(i + 1),
            onPrevClick: () => goTo(i - 1),
          },
        };
      }),
    });

    driverRef.current = d;
    d.drive(startIndex);
  }

  function goTo(index: number) {
    const step = steps[index];
    const d = driverRef.current;
    if (!step || !d) {
      finish();
      return;
    }
    // Read the live URL rather than the `pathname` from this closure's
    // render: the popover's onNextClick/onPrevClick callbacks are built
    // once, inside launch(), and never rebuilt as navigation proceeds — so
    // a captured `pathname` stays frozen at whatever it was when the tour
    // launched. After the first cross-page jump that stale value no longer
    // matches reality, so every step from then on incorrectly re-triggers
    // a (no-op) navigation to a page it's already on, and since the URL
    // doesn't actually change, the pathname effect that resumes the driver
    // never fires again — the tour just sits there. window.location.pathname
    // has no such staleness; it's read fresh on every call.
    const currentPath = window.location.pathname;
    if (step.page !== currentPath) {
      pendingRef.current = index > (d.getActiveIndex() ?? 0) ? 'next' : 'prev';
      setPopoverVisible(false);
      router.push(step.page);
      return;
    }
    if (index > (d.getActiveIndex() ?? 0)) d.moveNext();
    else d.movePrevious();
  }

  function startTour() {
    const first = steps[0];
    if (!first) return;
    if (pathname === first.page) {
      launch(0);
    } else {
      pendingRef.current = 'start';
      router.push(first.page);
    }
  }

  // Resumes the tour once a cross-page navigation actually lands.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const timer = setTimeout(() => {
      if (pending === 'start') launch(0);
      else if (pending === 'next') driverRef.current?.moveNext();
      else driverRef.current?.movePrevious();
      // A short buffer on top of driver.js's own waitForElement — gives
      // the newly-navigated page's first paint a moment to happen before
      // driver.js starts polling for the target element.
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Auto-start once, for a genuinely first-time visitor — never again
  // after that, whether they finished or skipped.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = true; // can't read the flag — err toward not interrupting.
    }
    if (!seen) {
      const timer = setTimeout(() => startTour(), 800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      driverRef.current?.destroy();
      document.body.classList.remove('ledger-tour-transitioning');
    },
    [],
  );

  return (
    <button
      onClick={startTour}
      aria-label="Take a tour of Ledger"
      title="Take a tour"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'var(--surface)',
        border: '1px solid var(--rule)',
        color: 'var(--ink)',
        cursor: 'pointer',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    </button>
  );
}
