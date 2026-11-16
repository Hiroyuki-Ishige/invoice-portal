/**
 * Per-user rate limiting for endpoints that cost money per call.
 *
 * Authentication stops strangers spending the Azure budget; it does not stop a
 * signed-in user looping uploads. This adds a ceiling on both request rate and
 * concurrency.
 *
 * Scope, stated plainly: the counters live in the process, so each serverless
 * instance enforces its own limits and the effective ceiling is the limit times
 * the number of warm instances. That is a real weakness of in-memory limiting,
 * accepted here because the goal is to blunt runaway usage rather than to meter
 * it exactly. A shared store (Redis / Upstash) is what to reach for if exact
 * limits ever matter.
 */

interface Window {
  /** Timestamps of accepted requests inside the current window. */
  hits: number[];
  inFlight: number;
}

const windows = new Map<string, Window>();

/** Stops the map growing without bound when many users pass through. */
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Requests allowed to run at the same time. */
  maxConcurrent: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Human-readable reason, suitable for returning to the caller. */
  reason?: string;
  /** Seconds after which the caller may retry, for the Retry-After header. */
  retryAfterSeconds?: number;
  /** Must be called when the request finishes, to release the concurrency slot. */
  release: () => void;
}

const noop = () => {};

function getWindow(key: string): Window {
  let entry = windows.get(key);
  if (!entry) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      const oldest = windows.keys().next().value;
      if (oldest) windows.delete(oldest);
    }
    entry = { hits: [], inFlight: 0 };
    windows.set(key, entry);
  }
  return entry;
}

/**
 * Claims a slot for `key`. Call `release()` in a finally block; a leaked slot
 * would permanently reduce the user's concurrency allowance for this process.
 */
export function claimRateLimitSlot(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = getWindow(key);

  entry.hits = entry.hits.filter((at) => now - at < options.windowMs);

  if (entry.inFlight >= options.maxConcurrent) {
    return {
      allowed: false,
      reason: "Another quotation is still being read. Wait for it to finish, then try again.",
      retryAfterSeconds: 30,
      release: noop,
    };
  }

  if (entry.hits.length >= options.limit) {
    const oldest = Math.min(...entry.hits);
    const retryAfterSeconds = Math.max(1, Math.ceil((options.windowMs - (now - oldest)) / 1000));
    return {
      allowed: false,
      reason: `Too many quotations read in a short time (limit ${options.limit} per ${Math.round(
        options.windowMs / 60000
      )} minutes). Try again shortly.`,
      retryAfterSeconds,
      release: noop,
    };
  }

  entry.hits.push(now);
  entry.inFlight += 1;

  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      entry.inFlight = Math.max(0, entry.inFlight - 1);
    },
  };
}
