# Lighthouse CI budgets

Launch-readiness item `PERF-01`.

## What runs

`.github/workflows/lighthouse.yml` on every pull request: install, production
build, `npx @lhci/cli autorun` against `.lighthouserc.js`. Three runs per URL
are averaged, which is the smallest number that stops one noisy run from
failing a build.

Two URLs, both public:

- `/` — the landing page, the most-visited entry point
- `/marketPlace` — the busiest catalogue route

Authenticated routes are not measured here: they need a session, and a budget
suite that has to mint one is a suite that breaks for reasons unrelated to
performance. Their behaviour is covered by the Playwright suite.

## The assertions, and why each exists

| Assertion                      | Threshold          | Why                                                                          |
| :----------------------------- | :----------------- | :--------------------------------------------------------------------------- |
| `categories:performance`       | ≥ 0.90             | The headline.                                                                |
| `categories:accessibility`     | ≥ 0.90             | A regression here is a bug, not a preference.                                |
| `largest-contentful-paint`     | ≤ 2500 ms          | The Core Web Vitals "good" line.                                             |
| `cumulative-layout-shift`      | ≤ 0.1              | Same line; the font strategy in `PERF-07` protects it.                       |
| `total-blocking-time`          | ≤ 200 ms           | The lab proxy for INP.                                                       |
| `resource-summary:script:size` | ≤ 450 KB           | `size-limit` caps the entry bundles; this caps what the page actually loads. |
| `resource-summary:image:size`  | ≤ 500 KB (warn)    | Warning, because a catalogue page legitimately carries artwork.              |
| `uses-responsive-images`       | 0 oversized (warn) | Pairs with the `sizes` audit in `PERF-04`.                                   |
| `unused-javascript`            | ≤ 100 KB (warn)    | Catches a dependency pulled into the wrong route.                            |

Budgets are errors only where a regression is the contributor's own: score,
LCP, CLS, TBT and script bytes. The warning-level image and unused-JS numbers
are guidance — an image-heavy catalogue page can be correct and still trip
them.

## Running it locally

```sh
npm run build
npm run lighthouse
```

`startServerCommand` is `npm run start`, so the production build must exist
first. The report is written to `.lighthouseci/` and the summary is printed.

## What this cannot see

- **Time to first audio.** Lighthouse has no notion of a stream starting; that
  is measured separately (`docs/TTFA.md`).
- **Authenticated routes.** See above.
- **A regression that only appears under real network conditions.** The
  throttling profile is a model, not a user's connection.
