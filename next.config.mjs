/** @type {import('next').NextConfig} */
const nextConfig = {
  // data/seed-dataset.json is read at runtime via a dynamic fs call
  // (src/seed/dataset.ts), not a static import, so Next's automatic file
  // tracing for serverless functions doesn't pick it up on its own —
  // without this, DATA_MODE=replay routes would silently fall back to
  // regenerating the dataset from scratch on every cold start (slow, and
  // on Vercel's read-only filesystem, that regeneration can't even be
  // cached to disk for next time).
  outputFileTracingIncludes: {
    '/api/**/*': ['./data/seed-dataset.json'],
    // The system panel reads the seed dataset directly (total replay days),
    // same dynamic-fs-read gap as the API routes above.
    '/system': ['./data/seed-dataset.json'],
  },
};

export default nextConfig;
