/**
 * `npm run resolve-alerts [-- --min-age-sessions N]`
 *
 * Grades every past flagged event old enough to judge (default 5
 * sessions) and not yet graded. Meant to run periodically (a cron, or
 * manually) — same "not on the request path" convention as
 * clusters:recompute.
 */

import { runResolutionJob } from '../worker/resolution-job';
import { closePool } from '../db/client';

function parseArgs(argv: string[]): { minAgeSessions?: number } {
  const idx = argv.indexOf('--min-age-sessions');
  if (idx === -1) return {};
  const value = Number(argv[idx + 1]);
  return Number.isFinite(value) ? { minAgeSessions: value } : {};
}

async function main() {
  const { minAgeSessions } = parseArgs(process.argv.slice(2));
  const result = await runResolutionJob(minAgeSessions);
  console.log(`Graded ${result.graded} event(s), skipped ${result.skipped} (missing baseline/current price data).`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
