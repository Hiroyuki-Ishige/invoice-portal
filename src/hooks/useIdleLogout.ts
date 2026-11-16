"use client";

import { useEffect, useRef } from "react";
import {
  IDLE_CHECK_INTERVAL_MS,
  LAST_ACTIVITY_KEY,
  idleWindowMs,
  sessionIsIdle,
  shouldTouchServer,
} from "@/lib/auth/idle-session";

/**
 * **Sign somebody out who has walked away, and tell them.**
 *
 * The server is what actually ends the session - middleware checks the marker
 * on every navigation and the touch endpoint refuses to revive a dead one. This
 * is the half that makes it *prompt*: a tab left open on the dashboard would
 * otherwise sit there looking signed in until somebody clicked something, which
 * is the one moment you do not want to discover you were signed out an hour
 * ago.
 *
 * Three decisions worth knowing:
 *
 * - **A timestamp checked on an interval, never a timer for the window.** A
 *   `setTimeout` for 24 hours does not survive a closed laptop, and background
 *   tabs have their timers throttled. Comparing two clocks does survive it, so
 *   this wakes up once a minute (and on focus, which is the moment somebody
 *   comes back to a sleeping tab) and subtracts.
 * - **`localStorage`, so tabs agree.** Activity in one tab is activity for the
 *   session; each tab writes there and listens for the others' writes. Without
 *   it, the tab you were not using signs the whole session out while you are
 *   working in the one you were.
 * - **The clock starts where the session did.** With nothing stored - a first
 *   load, a cleared browser - this stamps now rather than treating the absence
 *   as "infinitely idle", which would sign a person out the moment they
 *   arrived.
 */
export function useIdleLogout(active: boolean, onIdle: () => void) {
  // Held in refs, not state: every one of these changes many times a minute and
  // none of them belongs in a render.
  const lastTouchRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  const firedRef = useRef(false);

  /* The callback signs out and navigates; capturing a stale one would leave the
     interval calling into a dead closure after a re-render. Kept current in an
     effect rather than assigned during render - the React Compiler refuses a
     ref written while rendering, and it is right to: a render can be thrown
     away and re-run, and this one has a network call on the other end of it. */
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!active) return;
    firedRef.current = false;

    const readActivity = (): number | null => {
      try {
        const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
        const value = Number(raw);
        return raw && Number.isFinite(value) && value > 0 ? value : null;
      } catch {
        // Private mode, or storage blocked. The server still ends the session;
        // this half simply stops being prompt about it.
        return null;
      }
    };

    const writeActivity = (at: number) => {
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
      } catch {
        /* see above */
      }
    };

    /*
     * **A session that starts, starts now.**
     *
     * Written unconditionally, and that is a bug fix rather than tidiness. The
     * stamp outlives the tab it was written in - a browser closed without
     * signing out leaves one behind - so reading it and *keeping* it would let
     * a three-day-old stamp belong to a session five seconds old: the hook
     * would fire on its first check and bounce somebody who had only just
     * signed in, with a message telling them they had been inactive.
     *
     * This effect runs when a session is established and on every full page
     * load, both of which are somebody doing something. It does **not** re-run
     * on a client-side navigation within an open tab, so a tab left alone for a
     * day still ages: the stamp is reset by arriving, not by existing.
     */
    writeActivity(Date.now());

    const noteActivity = () => {
      if (firedRef.current) return;
      const now = Date.now();

      /* Written on every event, because it is a single localStorage write and
         the alternative - throttling it - is how the stored stamp ends up
         minutes behind the person. The *network* call is what is throttled. */
      writeActivity(now);

      if (shouldTouchServer(lastTouchRef.current, now)) {
        lastTouchRef.current = now;
        void fetch("/api/auth/touch", { method: "POST", credentials: "same-origin" })
          .then((response) => {
            // The server has already decided this session is over - it says so
            // rather than sliding the clock, and the tab should not wait for
            // its own timer to reach the same conclusion.
            if (response.status === 401) check();
          })
          .catch(() => {
            /* Offline, or a deploy in flight. The next event tries again, and
               the server's own check is what ends the session either way. */
          });
      }
    };

    const check = () => {
      if (firedRef.current) return;
      const lastActivity = readActivity();
      if (lastActivity === null) return;
      if (!sessionIsIdle(lastActivity, Date.now(), idleWindowMs())) return;
      // Once, however many tabs and timers arrive at it together.
      firedRef.current = true;
      onIdleRef.current();
    };

    /*
     * What counts as being here.
     *
     * Pointer and key events, not `mousemove`: a moving mouse is a cat on a
     * desk, and this is measured in hours - a person doing anything at all in a
     * day will press a key or click something. `visibilitychange` and `focus`
     * are here to *check*, not only to record: coming back to a tab is the
     * moment to find out it has expired.
     */
    const onEvent = () => noteActivity();
    const onReturn = () => {
      check();
      noteActivity();
    };
    const onStorage = (event: StorageEvent) => {
      // Another tab saw activity. Nothing to record - the value is already
      // written - but this tab's next check now reads the newer stamp.
      if (event.key === LAST_ACTIVITY_KEY) check();
    };

    window.addEventListener("pointerdown", onEvent, { passive: true });
    window.addEventListener("keydown", onEvent, { passive: true });
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("storage", onStorage);
    const interval = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);

    /* No check on mount: the stamp was just written, so it could only ever
       answer "not idle" - and a page load that arrives on a session already
       past the window never gets this far, because middleware redirects the
       navigation itself. */

    return () => {
      window.removeEventListener("pointerdown", onEvent);
      window.removeEventListener("keydown", onEvent);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [active]);
}

/**
 * Forget the activity stamp.
 *
 * Called on a deliberate sign-out, so the next person to sign in on this
 * browser starts a clock of their own rather than inheriting one that may
 * already have run out.
 */
export function clearIdleActivity(): void {
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* nothing to clear if it could not be written in the first place */
  }
}
