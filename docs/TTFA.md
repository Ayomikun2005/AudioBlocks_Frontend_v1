# Time to first audio

Launch-readiness item `PERF-02`.

## The metric

**TTFA** is the time from the user asking to play a track to the first
audible frame — the `<audio>` element's `playing` event. It is not LCP, and it
is not time-to-first-byte: a page can paint in 800 ms and still take four
seconds to make a sound, which for a streaming product is the number that
matters.

## How it is measured

`lib/performance/timeToFirstAudio.ts` holds the only definition:

- `markPlaybackRequested()` is called immediately before `audio.play()` in
  `hooks/player/useAudioEngine.ts`. The first call wins; a second press of play
  does not move the baseline.
- `markPlaybackStarted()` is called on the element's `playing` event. It
  returns a sample (`ms`, `at`, `withinBudget`) and clears the pending request.
- A `playing` event with no pending request — autoplay resuming, a crossfade
  handoff, a retry — returns `null` and reports nothing. Measuring from the
  wrong origin is worse than not measuring.

Samples go to subscribers (`onTimeToFirstAudio`) and to a
`audioblocks:time-to-first-audio` window event, so analytics can pick them up
without this module depending on analytics.

## The target

`TTFA_BUDGET_MS = 1000`. A cached stream should be audible within a second at
p75; a first, uncached play is expected to be slower and is reported with the
same metric rather than hidden. The budget is compared per sample
(`withinBudget`) and should be alerted at p75, the way the Web Vitals budgets
are.

## What moves it

- **Preloading the next track** (the gapless path in `useCrossfade`) — the
  biggest single lever: the next segment is fetched while the current one
  plays.
- **Segment length.** Long single-file streams mean no early bytes to play;
  segmented delivery lets playback start on the first segment.
- **Codec and bitrate.** Re-encoding is the last resort, after delivery.
- **The wallet and analytics bundles.** They compete for the same connection
  during a cold start; `PERF-03`'s lazy-loading exists partly to stop that.

## Where to see it

`tests/lib/timeToFirstAudio.test.ts` pins the measurement rules. A production
dashboard should plot TTFA p75 per route next to LCP, and alert when the p75
crosses the budget.
