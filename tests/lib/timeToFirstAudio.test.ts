import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TTFA_BUDGET_MS,
  TTFA_EVENT,
  hasPendingPlaybackRequest,
  markPlaybackRequested,
  markPlaybackStarted,
  onTimeToFirstAudio,
  resetTimeToFirstAudio,
} from '@/lib/performance/timeToFirstAudio';

// PERF-02: the measurement rules matter more than the number. A sample taken
// from the wrong origin, or a second one for the same press of play, would
// make the metric look better or worse than the listener experienced.

describe('time to first audio', () => {
  beforeEach(() => {
    resetTimeToFirstAudio();
  });

  afterEach(() => {
    resetTimeToFirstAudio();
    vi.restoreAllMocks();
  });

  it('measures from the play request to the first playing event', () => {
    markPlaybackRequested(1000);
    const sample = markPlaybackStarted(1420);
    expect(sample).not.toBeNull();
    expect(sample?.ms).toBe(420);
    expect(sample?.withinBudget).toBe(true);
  });

  it('keeps the first request when play is pressed twice', () => {
    markPlaybackRequested(1000);
    markPlaybackRequested(1300);
    expect(markPlaybackStarted(1500)?.ms).toBe(500);
  });

  it('reports nothing for a playing event with no request behind it', () => {
    // Autoplay resuming, a crossfade handoff, a retry: real playback, but not
    // the thing this metric measures.
    expect(markPlaybackStarted(2000)).toBeNull();
  });

  it('clears the request once a sample is taken', () => {
    markPlaybackRequested(1000);
    markPlaybackStarted(1200);
    expect(hasPendingPlaybackRequest()).toBe(false);
    expect(markPlaybackStarted(1300)).toBeNull();
  });

  it('marks a sample over the budget as over it', () => {
    markPlaybackRequested(0);
    const sample = markPlaybackStarted(TTFA_BUDGET_MS + 1);
    expect(sample?.withinBudget).toBe(false);
    expect(TTFA_BUDGET_MS).toBe(1000);
  });

  it('never returns a negative sample if the clocks disagree', () => {
    markPlaybackRequested(2000);
    expect(markPlaybackStarted(1900)?.ms).toBe(0);
  });

  it('delivers the sample to subscribers and to the window event', () => {
    const listener = vi.fn();
    const unsubscribe = onTimeToFirstAudio(listener);
    const dispatched = vi.fn();
    window.addEventListener(TTFA_EVENT, dispatched);

    markPlaybackRequested(0);
    const sample = markPlaybackStarted(250);

    expect(listener).toHaveBeenCalledWith(sample);
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect((dispatched.mock.calls[0][0] as CustomEvent).detail).toEqual(sample);

    unsubscribe();
    window.removeEventListener(TTFA_EVENT, dispatched);
  });

  it('keeps reporting when a subscriber throws', () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('reporter exploded');
    });
    onTimeToFirstAudio(bad);
    onTimeToFirstAudio(good);

    markPlaybackRequested(0);
    expect(() => markPlaybackStarted(10)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
