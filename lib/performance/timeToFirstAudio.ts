/**
 * Time-to-first-audio (PERF-02).
 *
 * The listener app's primary metric is not LCP: a page can paint in 800 ms and
 * still take four seconds to make a sound. TTFA is measured from the moment
 * the app asks an <audio> element to play to the moment that element reports
 * `playing` — the point at which the browser has enough buffered data to
 * actually start the stream.
 *
 * Two rules keep the number honest:
 *
 *  - A request is only recorded once. A user pressing play twice does not
 *    double the baseline.
 *  - A `playing` event with no recorded request — autoplay resuming, a
 *    crossfade handoff, a retry — produces no sample rather than a number
 *    measured from the wrong origin. An absent sample is better than a made-up
 *    one.
 *
 * Samples are delivered to subscribers and to a window event so any reporter
 * (analytics, Sentry, a console logger in development) can pick them up
 * without this module depending on one.
 */

/** The p75 target for a cached stream. Above this, playback feels slow. */
export const TTFA_BUDGET_MS = 1000;

export interface TimeToFirstAudioSample {
  /** Milliseconds from the play request to the first `playing` event. */
  ms: number;
  /** Wall-clock timestamp of the first audible frame. */
  at: number;
  /** True when the sample is inside the budget. */
  withinBudget: boolean;
}

export const TTFA_EVENT = 'audioblocks:time-to-first-audio';

type Listener = (sample: TimeToFirstAudioSample) => void;

let requestedAt: number | null = null;
const listeners = new Set<Listener>();

function clock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function wallClock(): number {
  return Date.now();
}

/** Records the moment playback was requested. Idempotent until playback starts. */
export function markPlaybackRequested(at: number = clock()): void {
  if (requestedAt === null) requestedAt = at;
}

/**
 * Records the first audible frame and returns the sample, or `null` when
 * playback started without a request this module saw.
 */
export function markPlaybackStarted(at: number = clock()): TimeToFirstAudioSample | null {
  if (requestedAt === null) return null;

  const ms = Math.max(0, at - requestedAt);
  requestedAt = null;

  const sample: TimeToFirstAudioSample = {
    ms,
    at: wallClock(),
    withinBudget: ms <= TTFA_BUDGET_MS,
  };

  for (const listener of listeners) {
    try {
      listener(sample);
    } catch {
      // A reporter must never break playback.
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(TTFA_EVENT, { detail: sample }));
  }

  return sample;
}

/** Subscribes to samples. Returns the unsubscribe function. */
export function onTimeToFirstAudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears the pending request. For tests, and for a track change that never starts. */
export function resetTimeToFirstAudio(): void {
  requestedAt = null;
}

/** True when a play request is outstanding. */
export function hasPendingPlaybackRequest(): boolean {
  return requestedAt !== null;
}
