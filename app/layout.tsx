import type { ReactNode } from 'react';
import { Nav } from './components/nav';
import './globals.css';

export const metadata = {
  title: 'Ledger',
  description: 'A smart market watchlist that shows the diff, not the state.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
