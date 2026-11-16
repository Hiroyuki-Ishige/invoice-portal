"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  MAX_SIGN_IN_BOUNCES,
  clearSignInBounces,
  destinationAfterAuth,
  noteSignInBounce,
} from "@/lib/auth/return-path";
import { signedOutMessage, signedOutReasonOf } from "@/lib/auth/idle-session";
import type { SignInBlock } from "@/lib/providers/dataverse/msal-browser";
import { BusyRing } from "@/components/ui/Loading";
import { AppName } from "@/components/ui/AppName";

/**
 * How long "Redirecting to sign in..." is allowed to be true.
 *
 * **A spinner is a promise about the next few seconds, and this one had no way
 * to break it.** `login()` only ever *returns* when the redirect did not
 * happen, so most failures do surface - but a navigation that is started and
 * never takes surfaces as MSAL's own 30-second `redirectNavigationTimeout`,
 * and half a minute of a spinner reads as a broken app. This is shorter than
 * that on purpose: it puts a button on the screen while the redirect may still
 * be in flight, which costs nothing, because a redirect that arrives takes the
 * page with it.
 */
const SIGN_IN_WATCHDOG_MS = 15_000;

/**
 * How long this screen waits for **somebody else's** navigation before making
 * it itself, and before giving up and putting a control on screen.
 *
 * **The state these cover is "signed in, and still here".** `AuthProvider`
 * owns where an authenticated caller goes and navigates there itself, so this
 * screen shows a spinner and waits - and the effect below deliberately starts
 * a sign-in only for somebody who is *not* signed in, which means the watchdog
 * above belongs to that sign-in and to nothing else. When the navigation does
 * not happen, nothing here notices: the spinner and the word "Redirecting" are
 * all there is, for as long as the tab is open. That is what a session left
 * for ten hours looked like on 2026-09-19 - the sign-in had **succeeded**
 * (`[AuthProvider] Profile authorized` in the console, cookies written), and
 * only the closing `window.location.replace()` never took, which is what a
 * navigation issued as a machine goes to sleep does.
 *
 * So: re-issue it once, because it is the navigation that was meant to happen
 * anyway, and if the page is still here after that, stop spinning and say so
 * with something to press (rules 10 and 37). A redirect that keeps coming back
 * here is not this screen's problem to solve - `noteSignInBounce()` already
 * counts those and stops at three.
 */
const RESUME_NAVIGATE_MS = 3_000;
const RESUME_STALLED_MS = 12_000;

/** What the screen says when the redirect never started. One closed set. */
function blockedMessage(block: SignInBlock): { title: string; detail: string } {
  if (block === "not_configured") {
    return {
      title: "Sign-in is not set up for this site.",
      detail:
        "The app has no Microsoft sign-in configured, so there is nothing to " +
        "redirect to. An administrator has to set it before anyone can sign in.",
    };
  }
  if (block === "interaction_in_progress") {
    return {
      title: "A sign-in was already running on this tab.",
      detail:
        "An earlier sign-in from this tab was never finished, so this one was " +
        "refused. Try again to forget it and start a fresh one.",
    };
  }
  return {
    title: "Could not open the Microsoft sign-in page.",
    detail:
      "Nothing was sent to Microsoft, so nothing has been signed in or out. " +
      "Try again; if it keeps happening, check that this site is not blocked.",
  };
}

/**
 * The screen nobody is meant to read - **except when they are**.
 *
 * Middleware sends every signed-out request for a real page here with the page
 * it wanted in `redirectTo`, and this signs them in and hands them back - so
 * following a link from mail into a ringi is one click, not a sign-in and then
 * a hunt through the list. If MSAL still holds the account (it caches in
 * localStorage) there is no prompt at all and this shows for a moment.
 *
 * **That silence is wrong when the session was taken away.** Middleware has
 * been sending `?message=session_expired` since it was written and this screen
 * never read it, so the parameter went nowhere: whoever it was about was signed
 * back in before they could see anything. An idle timeout that behaved the same
 * way would be no timeout at all - the message *is* the feature. So a known
 * `message` stops the automatic sign-in, says what happened and waits for a
 * click.
 *
 * What it also has to do is notice when the sign-in circle is not closing. If
 * the `dv_*` cookies cannot be written, the return trip meets the same
 * middleware check and comes straight back here, with nothing on screen but a
 * spinner and nothing in the flow that stops. Three arrivals in one tab is
 * taken as proof of that, and the person is told.
 */
export default function SignInPage() {
  /* `useSearchParams` suspends while the query is read, so the boundary is
     required rather than decorative - without it this page cannot be
     prerendered at all. */
  return (
    <Suspense fallback={<SignInFrame>{null}</SignInFrame>}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const { isLoading, isAuthenticated, isInitialized, login } = useAuth();
  const searchParams = useSearchParams();
  const loginAttemptedRef = useRef(false);
  const countedRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  /** Set the moment it is known the browser is not going anywhere. */
  const [blocked, setBlocked] = useState<SignInBlock | null>(null);
  /** Signed in, this screen has re-issued the navigation, and it is still here. */
  const [isStalled, setIsStalled] = useState(false);

  /* Looked up in a closed set, never rendered from the URL: this text arrives
     in a query string, and a screen that printed whatever was in it would be a
     sign-in page that says whatever a link tells it to. */
  const reason = signedOutReasonOf(searchParams.get("message"));

  useEffect(() => {
    // Counted once per arrival, not once per effect run: React re-runs mount
    // effects in StrictMode, and a guard that counts twice per visit would call
    // a healthy second sign-in a loop. The state is set on the next tick
    // because a synchronous setState inside an effect cascades a render - the
    // count itself is what has to happen at mount, not the re-render.
    if (countedRef.current) return;
    countedRef.current = true;
    if (noteSignInBounce() > MAX_SIGN_IN_BOUNCES) queueMicrotask(() => setIsStuck(true));
  }, []);

  /**
   * Start the sign-in, and **watch that it leaves**.
   *
   * `login()` resolves only when the redirect did not happen, so its answer is
   * always a failure to show. The timer covers the other half: a redirect that
   * was handed to the browser and never took. Between them there is no path
   * back to a spinner that stays.
   */
  const startSignIn = useCallback(
    (options?: { prompt?: "login" | "select_account"; force?: boolean }) => {
      setBlocked(null);
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = window.setTimeout(
        () => setBlocked("failed"),
        SIGN_IN_WATCHDOG_MS
      );
      void login(options).then((block) => {
        if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
        setBlocked(block);
      });
    },
    [login]
  );

  /* The page is about to be replaced on the happy path, but a timer that
     outlives its component is a setState on nothing - and StrictMode mounts
     twice. */
  useEffect(
    () => () => {
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
    },
    []
  );

  /**
   * Where an already-signed-in caller belongs - **the same answer
   * `AuthProvider` gives** (rule 5), so the two cannot send one person to two
   * places. `null` there means "you are already where you asked to be", which
   * on this screen is never true: nobody asks for the sign-in page.
   */
  const resumeTarget = useCallback(
    () =>
      destinationAfterAuth(
        window.location.pathname + window.location.search,
        searchParams.get("redirectTo")
      ) ?? "/dashboard",
    [searchParams]
  );

  /**
   * **Signed in, and still here.** See `RESUME_NAVIGATE_MS`.
   *
   * `reason` is excluded on purpose, and it is the same exclusion the sign-in
   * effect below makes: a session that was taken away has a sentence to show
   * and a button to press, and navigating out from under it would be the bug
   * that message exists to fix.
   */
  useEffect(() => {
    if (isStuck || reason) return;
    /* **`!isLoading`, not `isInitialized`.** The pair is what the sentence at
       the bottom of this file reads, but the state being caught here is the one
       where `AuthProvider` returned early *to navigate* - and on that path it
       never sets `isInitialized`. `isLoading` is cleared by its `finally`
       whichever way it left, so this is the one flag that means "it has
       finished", which is what has to be true before a second navigation is
       anything but a race. */
    if (isLoading || !isAuthenticated) return;

    const move = window.setTimeout(
      () => window.location.replace(resumeTarget()),
      RESUME_NAVIGATE_MS
    );
    const stall = window.setTimeout(() => setIsStalled(true), RESUME_STALLED_MS);
    return () => {
      window.clearTimeout(move);
      window.clearTimeout(stall);
    };
  }, [isStuck, reason, isLoading, isAuthenticated, resumeTarget]);

  useEffect(() => {
    if (isStuck) return;
    /* **A message means the sign-in is theirs to start.** Signing them straight
       back in would show the sentence for as long as a redirect takes, which is
       the same as not showing it. */
    if (reason) return;
    // Only attempt login once, after initialization is complete
    if (isInitialized && !isLoading && !isAuthenticated && !loginAttemptedRef.current) {
      loginAttemptedRef.current = true;
      startSignIn();
    }
  }, [isInitialized, isLoading, isAuthenticated, isStuck, reason, startSignIn]);

  if (isStuck) {
    return (
      <SignInFrame spinner={false}>
        <div className="max-w-sm mx-auto">
          <p className="text-slate-600 dark:text-slate-300 mb-1">
            Signed in with Microsoft, but this app could not keep the session.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            This usually means cookies are blocked for this site. Allow them, then try
            again.
          </p>
          <SignInButton
            label="Try again"
            onClick={() => {
              // Reset the count first, or the reload lands straight back on
              // this message.
              clearSignInBounces();
              window.location.reload();
            }}
          />
        </div>
      </SignInFrame>
    );
  }

  /* Ahead of `reason`, because it is the newer fact: whatever sent somebody
     here, what is true now is that the redirect did not happen. */
  if (blocked) {
    const { title, detail } = blockedMessage(blocked);
    return (
      <SignInFrame spinner={false}>
        <div className="max-w-sm mx-auto">
          <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">{title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{detail}</p>
          {/* `force` only here - a retry somebody asked for is the one case
              where forgetting a running interaction is the right thing. */}
          <SignInButton
            label="Try again"
            onClick={() => startSignIn({ force: true })}
          />
        </div>
      </SignInFrame>
    );
  }

  if (reason) {
    const { title, detail } = signedOutMessage(reason);
    return (
      <SignInFrame spinner={false}>
        <div className="max-w-sm mx-auto">
          <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">{title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{detail}</p>
          <SignInButton
            label="Sign in"
            onClick={() =>
              /* **The account picker, after a timeout too.** A local sign-out
                 leaves the Microsoft session alive, so this is one click back
                 in. It asked for `prompt: "login"` until 2026-09-17 and was
                 reported as "sign-in now wants my email" - retyping
                 credentials every morning was judged the wrong price for a
                 timeout that is hygiene, not a boundary (the hourly token is
                 the boundary). The sentence above still says why they are
                 here, which is what the timeout is for. */
              startSignIn()
            }
          />
        </div>
      </SignInFrame>
    );
  }

  /* Last, because everything above is a better answer than this one: each of
     them knows *why* the screen is not moving, and this only knows that it is
     not. */
  if (isStalled) {
    return (
      <SignInFrame spinner={false}>
        <div className="max-w-sm mx-auto">
          <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">
            You are signed in, but this screen did not move on.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            The session is live and nothing was lost - only the page that should
            have opened. Carry on from here.
          </p>
          <SignInButton
            label="Continue"
            onClick={() => window.location.replace(resumeTarget())}
          />
        </div>
      </SignInFrame>
    );
  }

  return (
    <SignInFrame>
      <p className="text-slate-500 dark:text-slate-400">
        {isLoading || !isInitialized ? "Loading..." : "Redirecting to sign in..."}
      </p>
    </SignInFrame>
  );
}

/** The one layout all four states are drawn in, so none of them can drift. */
function SignInFrame({
  children,
  spinner = true,
}: {
  children: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="text-center px-6">
        {/* The app's own ring. It was `border-t-blue-500` - a Tailwind blue
            that is not one of the five, on the first screen anybody sees
            (rule 33). */}
        {spinner && (
          <div className="flex justify-center mb-4">
            <BusyRing size={48} />
          </div>
        )}
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          <AppName />
        </h1>
        {children}
      </div>
    </div>
  );
}

function SignInButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm rounded-lg bg-[#0057BC] text-white hover:bg-[#004494] transition-all duration-300 ease-in-out"
    >
      {label}
    </button>
  );
}
