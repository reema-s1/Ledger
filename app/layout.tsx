import type { ReactNode } from 'react';
import { Nav } from './components/nav';
import { DataModeTag } from './components/data-mode-tag';
import { NotificationBell } from './components/notification-bell';
import { ProductTour } from './components/tour/product-tour';
import { hasSession, getCurrentUserId } from '../src/lib/current-user';
import { isPlaybackEnabled } from '../src/lib/feature-flags';
import { getTriggeredThresholds } from '../db/queries/watch-thresholds';
import './globals.css';

export const metadata = {
  title: 'Ledger',
  description: 'A smart market watchlist that shows the diff, not the state.',
};

// Runs before first paint so a stored theme choice (app/components/
// theme-toggle.tsx) applies immediately — without this, a dark-mode
// visitor would see a flash of the light theme on every load before
// React hydrates and corrects it.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ledger:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const showNav = await hasSession();
  // Deliberately not blocking the page on this — a slow threshold check
  // should never delay the whole app shell rendering. Empty on any
  // failure (a symbol with no candles yet, etc.) rather than surfacing an
  // error for what's a secondary, passive indicator.
  const triggered = showNav ? await getTriggeredThresholds(await getCurrentUserId()).catch(() => []) : [];
  const playbackEnabled = isPlaybackEnabled();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <div className="app-shell">
          {showNav && <Nav showPlayback={playbackEnabled} />}
          <div className="app-main">
            {showNav && (
              // height: 0 so this reserves no flow space of its own — with the
              // old padded row, every page's heading sat visibly lower than it
              // used to (that row's own height, stacked on top of the page's
              // own top padding). The icons are pulled back out with `absolute`
              // on the inner row, positioned at the same offset the old padding
              // used to give them, so they land in the same top-right spot —
              // inline with each page's own heading row — while the outer div
              // stays `sticky` so they're still pinned through scroll.
              <div style={{ position: 'sticky', top: 0, zIndex: 20, height: 0 }}>
                <div style={{ position: 'absolute', top: 16, right: 24, display: 'flex', gap: 8 }}>
                  <ProductTour playbackEnabled={playbackEnabled} />
                  <NotificationBell triggered={triggered} />
                </div>
              </div>
            )}
            {children}
            <DataModeTag />
          </div>
        </div>
      </body>
    </html>
  );
}
