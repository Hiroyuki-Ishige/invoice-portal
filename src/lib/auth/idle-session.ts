/**
 * **When a session has been left alone long enough to end it.**
 *
 * One clock, and this is the arithmetic behind it: how long the window is, and
 * whether a given "last seen" stamp has fallen outside it. Pure - no cookies,
 * no DOM, no `next/*` - because three very different places have to agree about
 * the answer:
 *
 * - **middleware**, on the edge, which is what actually ends the session;
 * - the **touch** endpoint, which refuses to slide a clock that has already run
 *   out (a background tab must not be able to resurrect a dead session);
 * - the **browser**, which watches the same window so somebody sitting on an
 *   open tab is told, rather than finding out at their next click.
 *
 * ### Why the value is compared, not the cookie's own expiry
 *
 * The obvious build is a cookie with `maxAge` set to the window: the browser
 * expires it and its absence means "idle". That cannot tell **"idle"** from
 * **"never signed in here"**, and the two need different screens - one says
 * *you were signed out*, the other must say nothing at all. So the cookie
 * carries the stamp and outlives the window, and the **server** does the
 * comparison (rule 2). A browser that keeps a stale value is telling the server
 * exactly what it needs to know.
 *
 * ### What this is and is not
 *
 * It is hygiene: it closes a session somebody walked away from. It is **not** a
 * security boundary - the boundary is the Azure AD access token, which expires
 * hourly and only MSAL can renew. Worth saying out loud, because an idle
 * timeout is easy to mistake for one (rule 10).
 */

/** The window, in hours, and where it is configured. */
export const DEFAULT_IDLE_HOURS = 24;

/**
 * How long a session may sit untouched, in hours.
 *
 * **`NEXT_PUBLIC_`, and it has to be** (rule 14): the browser half of this
 * watches the same window, and a server-only variable is plain `undefined` in a
 * client bundle - it would fall silently through to the default while the
 * server used the configured value, and the two halves would disagree about
 * when the session ended with nothing on screen to say so.
 *
 * A value that is not a positive number is the default rather than an error: a
 * mistyped variable must not leave the app with no timeout, or with one of zero
 * hours that signs everybody out on their next click.
 */
export function idleWindowHours(): number {
  const configured = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_IDLE_HOURS;
}

export function idleWindowMs(): number {
  return Math.round(idleWindowHours() * 60 * 60 * 1000);
}

/**
 * How long the "last seen" marker itself is kept.
 *
 * Far longer than the window, because the marker is what tells "signed out
 * after a day away" from "first visit from this browser". It is cleared the
 * moment either of those is answered - on an idle sign-out and on an ordinary
 * one - so it never outlives the session it describes by more than the window.
 */
export const LAST_SEEN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Has this session been left alone past the window?
 *
 * A missing or unreadable stamp is **not** idle: absent means this browser has
 * no session to end, and a value that will not parse is a marker somebody has
 * damaged - neither is evidence that a person walked away, and answering "yes"
 * to either would sign people out with a message about inactivity that did not
 * happen.
 */
export function sessionIsIdle(
  lastSeen: string | number | null | undefined,
  now: number,
  windowMs: number = idleWindowMs()
): boolean {
  const stamp = typeof lastSeen === "number" ? lastSeen : Number(lastSeen);
  /*
   * **One test, and it catches every kind of nothing.** `Number(undefined)` and
   * `Number("nonsense")` are `NaN`; `Number(null)` and `Number("")` are `0`. So
   * a missing, empty or damaged marker fails here, and none of them is idle: an
   * absent marker means this browser has no session to end, and a damaged one
   * is not evidence that anybody walked away. Answering "yes" to either would
   * put a message about inactivity in front of somebody who had just arrived.
   *
   * Rule 18's shape, in the other direction: a value that is not a number is
   * not a comparison - and here the safe answer is "not idle", because this
   * decision *takes something away* rather than granting it.
   */
  if (!Number.isFinite(stamp) || stamp <= 0) return false;
  /* Signed, deliberately: a stamp in the future is a clock that disagrees -
     a device set wrong, or a marker written before a daylight change - and
     `Math.abs()` here would sign that person out for being early. */
  return now - stamp > windowMs;
}

/**
 * How often the browser tells the server it is still there.
 *
 * Not on every keystroke: this is a write to a cookie on every request it rides
 * with, and the window is measured in hours. Five minutes is fine-grained
 * enough that the clock is never more than five minutes behind the person, and
 * coarse enough that a typist costs one request.
 */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Whether enough time has passed to bother the server again. */
export function shouldTouchServer(lastTouch: number | null, now: number): boolean {
  if (lastTouch === null || !Number.isFinite(lastTouch)) return true;
  return now - lastTouch >= TOUCH_INTERVAL_MS;
}

/**
 * How often the browser checks its own clock.
 *
 * **A check on an interval, never a `setTimeout` for the window itself.** A
 * timer set for 24 hours does not survive a laptop lid, and background tabs
 * have their timers throttled to the minute or worse - so the one thing that
 * must not decide when a session ends is a long timer. This wakes up often
 * enough to be prompt, and compares two timestamps, which sleep cannot break.
 */
export const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

/** Where the browser keeps its own copy, shared across tabs. */
export const LAST_ACTIVITY_KEY = "capex_last_activity";

/**
 * Why somebody is looking at the sign-in screen.
 *
 * A closed set, because it arrives in a query string: the screen looks the
 * value up here and shows nothing for a word it does not know, so no wording
 * ever comes from the URL.
 */
export type SignedOutReason = "idle" | "session_expired";

export function signedOutReasonOf(value: string | null | undefined): SignedOutReason | null {
  return value === "idle" || value === "session_expired" ? value : null;
}

/**
 * What the screen says, and it says the window out loud.
 *
 * "You have been signed out" leaves the reader wondering whether something
 * broke. Naming the hours answers it and tells them what to expect next time.
 */
export function signedOutMessage(reason: SignedOutReason): { title: string; detail: string } {
  if (reason === "idle") {
    const hours = idleWindowHours();
    return {
      title: "You are logged out. Please log in again.",
      detail:
        `This application signs you out after ${hours} ${hours === 1 ? "hour" : "hours"} ` +
        "without activity. Anything you had typed and not saved was not kept.",
    };
  }
  return {
    title: "Your session has expired. Please log in again.",
    detail: "Sign in to carry on where you were.",
  };
}
