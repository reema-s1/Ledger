/**
 * A wider watchlist than the brief's "12 stocks is usually 3 bets" example
 * deliberately increases the odds that, whenever the seed dataset is
 * regenerated, *something* lands in each of the three digest tiers
 * (recent/episode/chapter) instead of everything falling into one — since
 * the seed dataset's calendar is anchored to "now" (src/seed/generate.ts),
 * which symbols carry the freshest events shifts every time `npm run seed`
 * runs. BAJFINANCE (the split) and WIPRO (the structural break) stay in
 * either way, since those are the fixtures worth showing off regardless of
 * timing.
 *
 * Shared by scripts/seed-demo-user.ts (the fixed demo account) and the
 * guest landing-screen path (a fresh account per guest session), so both
 * start from the same real, populated watchlist.
 */
export const STARTER_WATCHLIST = [
  'TCS',
  'INFY',
  'WIPRO',
  'HDFCBANK',
  'BAJFINANCE',
  'RELIANCE',
  'TECHM',
  'IDFCFIRSTB',
  'TORNTPHARM',
  'SBIN',
  'ICICIBANK',
  'MPHASIS',
];
