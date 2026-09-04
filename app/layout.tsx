import type { ReactNode } from 'react';
import { Nav } from './components/nav';
import { DataModeTag } from './components/data-mode-tag';
import { hasSession } from '../src/lib/current-user';
import { isPlaybackEnabled } from '../src/lib/feature-flags';
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
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {showNav && <Nav showPlayback={isPlaybackEnabled()} />}
        {children}
        <DataModeTag />
      </body>
    </html>
  );
}
