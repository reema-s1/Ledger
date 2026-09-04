import type { ReactNode } from 'react';
import { Nav } from './components/nav';
import { hasSession } from '../src/lib/current-user';
import './globals.css';

export const metadata = {
  title: 'Ledger',
  description: 'A smart market watchlist that shows the diff, not the state.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const showNav = await hasSession();
  return (
    <html lang="en">
      <body>
        {showNav && <Nav />}
        {children}
      </body>
    </html>
  );
}
