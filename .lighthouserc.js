/**
 * Lighthouse CI budgets (PERF-01).
 *
 * `size-limit` already fails a pull request whose JavaScript grows past its
 * budget. It cannot see the two things a listener notices first: when the
 * largest element appears, and whether the page jumps while it does. Lighthouse
 * measures both against a throttled mobile profile, and these assertions make
 * a regression a red build rather than a manual review.
 *
 * Run locally with `npm run lighthouse` (needs a production build), or let
 * `.github/workflows/lighthouse.yml` do it on the pull request.
 *
 * The thresholds match `docs/LIGHTHOUSE_CI.md` and `lib/performance/timeToFirstAudio.ts`'s
 * sibling budgets: LCP 2.5 s and CLS 0.1 are the Core Web Vitals "good" line,
 * TBT 200 ms is the lab proxy for INP.
 */
module.exports = {
  ci: {
    collect: {
      // The two public entry points. Authenticated routes need a session, which
      // a static budget run does not have; their performance is covered by the
      // Playwright suite instead.
      url: ['http://localhost:3000/', 'http://localhost:3000/marketPlace'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        // A stable mobile profile: Lighthouse's default throttling is applied
        // on top of this, so the numbers are comparable between runs.
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
      },
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 120000,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Core Web Vitals, at the p75 "good" thresholds.
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],

        // A page that ships a megabyte of fonts or images fails here even when
        // its score happens to stay above 0.9.
        'resource-summary:script:size': ['error', { maxNumericValue: 450 * 1024 }],
        'resource-summary:image:size': ['warn', { maxNumericValue: 500 * 1024 }],
        'uses-responsive-images': ['warn', { maxLength: 0 }],
        'unused-javascript': ['warn', { maxNumericValue: 100 * 1024 }],
      },
    },
    upload: {
      // Temporary public storage is enough to read the report from a PR; no
      // account or token has to be kept in the repository.
      target: 'temporary-public-storage',
    },
  },
};
