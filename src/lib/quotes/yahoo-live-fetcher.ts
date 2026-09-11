/**
 * LiveQuoteFetcher against Yahoo Finance's public chart endpoint — the
 * same unofficial, no-API-key source already used for historical seed
 * data (scripts/fetch-real-history.ts), just reading its live snapshot
 * fields (`meta.regularMarketPrice`/`regularMarketTime`) instead of the
 * historical OHLCV arrays. No SLA — an unofficial endpoint can change
 * shape or rate-limit without notice — but it's the same trade-off
 * already accepted and documented for the real historical data, not a
 * new one. This supersedes the unconfigured stub that used to sit here.
 */

import type { LiveQuoteFetcher } from './live-quote-source';
import type { Candle } from './types';
import { istDateString } from '../time/market-calendar';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function yahooTicker(symbol: string): string {
  return symbol === 'NIFTY' ? '%5ENSEI' : `${symbol}.NS`;
}

interface YahooQuoteArrays {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YahooChartResult {
  meta: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    regularMarketVolume?: number;
  };
  timestamp?: number[];
  indicators: { quote: [YahooQuoteArrays] };
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<YahooChartResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${symbol}`);
  const body = (await res.json()) as { chart: { result: YahooChartResult[] | null; error: unknown } };
  const result = body.chart.result?.[0];
  if (!result) throw new Error(`Yahoo Finance: no result for ${symbol} (${JSON.stringify(body.chart.error)})`);
  return result;
}

export const yahooLiveFetcher: LiveQuoteFetcher = {
  async fetchQuote(symbol: string) {
    const result = await fetchChart(symbol, '1d', '1m');
    const { regularMarketPrice, regularMarketTime, regularMarketVolume } = result.meta;
    if (typeof regularMarketPrice !== 'number' || typeof regularMarketTime !== 'number') {
      throw new Error(`Yahoo Finance: missing regularMarketPrice/Time for ${symbol}`);
    }
    return {
      price: regularMarketPrice,
      volume: regularMarketVolume ?? 0,
      ts: new Date(regularMarketTime * 1000),
    };
  },

  async fetchHistory(symbol: string, days: number) {
    const result = await fetchChart(symbol, '3mo', '1d');
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators.quote[0];
    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      const v = quote.volume[i];
      if (o == null || h == null || l == null || c == null || v == null) continue;
      const ts = new Date(timestamps[i]! * 1000);
      candles.push({ symbol, sessionDate: istDateString(ts), ts, o, h, l, c, v });
    }
    return candles.slice(-days);
  },
};
