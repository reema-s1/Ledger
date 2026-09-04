import type { LiveQuoteFetcher } from './live-quote-source';

/**
 * Placeholder LiveQuoteFetcher. This repo doesn't ship credentials for a
 * real NSE data vendor, so `DATA_MODE=live` is wired end-to-end but fails
 * loudly and immediately with instructions, instead of silently doing
 * nothing or pretending to work. Swap this out for a real implementation
 * (REST poll, WebSocket, whatever the chosen vendor offers) that satisfies
 * `LiveQuoteFetcher` — nothing else in the codebase needs to change.
 */
export const unconfiguredLiveFetcher: LiveQuoteFetcher = {
  async fetchQuote(symbol: string) {
    throw new Error(
      `DATA_MODE=live but no market data provider is configured. ` +
        `Implement LiveQuoteFetcher.fetchQuote for "${symbol}" in ` +
        `src/lib/quotes/live-provider-stub.ts (or wherever you wire the ` +
        `real vendor) and pass it to createQuoteSource. Until then, use ` +
        `DATA_MODE=replay.`,
    );
  },
  async fetchHistory(symbol: string) {
    throw new Error(
      `DATA_MODE=live but no market data provider is configured. ` +
        `Implement LiveQuoteFetcher.fetchHistory for "${symbol}". ` +
        `Until then, use DATA_MODE=replay.`,
    );
  },
};
