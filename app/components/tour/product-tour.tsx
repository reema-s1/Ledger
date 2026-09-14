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

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Best-effort — worst case the tour just offers to auto-start again next time.
    }
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
      onDoneClick: () => finish(),
      onDestroyed: () => {
        driverRef.current = null;
      },
      steps: steps.map((s, i) => ({
        element: s.selector,
        // 2.5s is generous enough for a client-side route transition plus
        // a server-rendered page's data fetch to land, without leaving a
        // real "this element truly isn't here" case waiting too long.
        waitForElement: 2500,
        skipMissingElement: true,
        popover: {
          title: s.title,
          description: s.description,
          onNextClick: () => goTo(i + 1),
          onPrevClick: () => goTo(i - 1),
        },
      })),
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
    if (step.page !== pathname) {
      pendingRef.current = index > (d.getActiveIndex() ?? 0) ? 'next' : 'prev';
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

  useEffect(() => () => driverRef.current?.destroy(), []);

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
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      🎓
    </button>
  );
}
