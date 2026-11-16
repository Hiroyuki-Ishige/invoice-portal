/**
 * Where a person goes after signing in.
 *
 * The reason this is its own module rather than three lines inside
 * `AuthProvider`: mail sent by this app links straight at a ringi
 * (`/approval/{id}`, and `?step=5` from a route notification), and a link is
 * followed by somebody who is *not* signed in on that browser far more often
 * than by somebody who is. Everything between the click and the ringi is this
 * decision, made twice - once when middleware bounces the request to
 * `/sign-in`, once when MSAL comes back - and the two have to agree.
 *
 * No `process.env` in here on purpose: a client component imports it, and a
 * server-only variable read from a browser bundle is `undefined` rather than an
 * error (CLAUDE.md rule 14).
 */

/**
 * Pages that mean "the sign-in just finished and nobody asked for anywhere".
 *
 * Only somewhere on this list gets sent to `/dashboard`. Anywhere else, the
 * person is already on the page they wanted, and moving them throws it away.
 *
 * `/` is here because the callback shim (`/auth/callback` returns HTML that
 * does `location.replace('/' + hash)`) drops everybody on the landing page
 * mid-flow - arriving there *with a fresh Azure AD response in hand* is part of
 * signing in, not a choice.
 */
export const AUTH_ENTRY_PATHS = ["/", "/sign-in", "/auth/callback"];

/**
 * The same list for somebody who was *already* signed in when the page loaded.
 *
 * `/` is deliberately absent. With no redirect response involved, a visit to
 * the landing page is somebody typing the address or clicking the logo, and
 * bouncing them to the dashboard would make the home page unreachable while
 * signed in.
 */
export const RESUMED_SESSION_ENTRY_PATHS = ["/sign-in", "/auth/callback"];

/**
 * **Is this page a stop on the way back from Microsoft?** True when the hash
 * holds an authorization response (`code=` or `error=`, with the `state=` MSAL
 * matches it by).
 *
 * The callback shim sends everybody to `/` with that hash, and MSAL 5.15.0
 * does not finish there: `RedirectClient.handleRedirectPromise` replaces the
 * location with the page the sign-in *started* from (`/sign-in?...`) and then
 * waits out `redirectNavigationTimeout` - so `isLoading` stays true for as long
 * as `/` is on screen. A Sign In button on that page is one the person has
 * just pressed, offered again while it is being answered (reported
 * 2026-10-11 as a flash of the button between clicking it and being in).
 */
export function carriesAuthResponse(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has("state") && (params.has("code") || params.has("error"));
}

/**
 * A return path this app is willing to navigate to, or `null`.
 *
 * `redirectTo` arrives in a query string, so it is written by whoever composed
 * the URL - which may be a stranger sending a link to an employee. It ends up
 * in `window.location.replace()`, and the browser is perfectly happy to accept
 * `//evil.example` (protocol-relative: a different site) or `https://…` there.
 * A person who has just typed their password into a real Microsoft prompt and
 * been dropped on somebody else's page has no reason to distrust it, which is
 * what makes an open redirect after sign-in worth more than it looks.
 *
 * So: same-origin relative paths only. One leading slash, no scheme, no
 * backslashes (browsers read `\` as `/` in a URL, so `/\evil.example` is
 * `//evil.example`), and nothing under `/api/`, which returns JSON and is never
 * somewhere to land.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;

  const path = value.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("\\")) return null;
  // Control characters, including the tab/newline a browser strips before
  // parsing - `/\tevil` would otherwise pass this and navigate off-site.
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.startsWith("/api/")) return null;

  return path;
}

/**
 * Where to navigate once the caller is authenticated - or `null` for "stay".
 *
 * `currentUrl` is the path *and* query (`window.location.pathname +
 * window.location.search`), because `?step=5` is the difference between opening
 * a ringi on Circulation with Approve in front of the reader and opening it on
 * Step 1.
 *
 * The `null` return is the point of the whole function. MSAL navigates back to
 * the page where sign-in started before it hands the response over
 * (`navigateToLoginRequestUrl`, on by default and confirmed in
 * `RedirectClient` in the installed 5.15.0), so by the time anything here runs,
 * the deep link has usually already been restored. Answering `/dashboard`
 * there - which is what the code did - discards it after the fact.
 */
export function destinationAfterAuth(
  currentUrl: string,
  requested: string | null | undefined,
  entryPaths: readonly string[] = AUTH_ENTRY_PATHS
): string | null {
  const currentPath = currentUrl.split(/[?#]/)[0] || "/";
  const target = safeReturnPath(requested);

  if (target) {
    // Already there. Comparing against the path as well as the full URL keeps
    // `/approval/x` from being re-navigated to itself when no query was asked
    // for, which would be a reload rather than a move.
    if (target === currentUrl || target === currentPath) return null;
    return target;
  }

  return entryPaths.includes(currentPath) ? "/dashboard" : null;
}

/**
 * **Where a Sign In button goes: the sign-in screen, carrying this page.**
 *
 * Not `login()`. Every button outside `/sign-in` called that directly and threw
 * the answer away - and `login()` *only* returns when the redirect did not
 * happen, so what was being discarded was always a failure to report: sign-in
 * not configured, an interaction already running, a navigation that never took.
 * The button stayed enabled and nothing moved, which is what "I cannot click
 * Sign In" looks like from the outside (reported 2026-09-20).
 *
 * `/sign-in` already owns all of that - it starts the sign-in, watches that it
 * leaves, and words every way it can fail - so the honest fix is one door
 * rather than five copies of the watchdog (rule 5). The screen signs somebody
 * in the moment it loads, so the extra hop costs a paint, not a click.
 *
 * `here` is read from `window.location` by the caller rather than from
 * `useSearchParams`, which in a root-layout component would opt every page in
 * the app out of static rendering for a value needed at one click.
 */
export function signInHref(here: string): string {
  const url = new URL("/sign-in", "http://placeholder");
  /* Not the sign-in screen itself, and not the landing page: "return me to
     where I was" has to mean somewhere worth returning to - the same list the
     idle sign-out uses, so the two cannot disagree about it. */
  const target = safeReturnPath(here);
  if (target && !AUTH_ENTRY_PATHS.includes(target.split(/[?#]/)[0])) {
    url.searchParams.set("redirectTo", target);
  }
  return url.pathname + url.search;
}

/**
 * How many times in a row this tab has been sent to `/sign-in`.
 *
 * The loop this guards against: middleware sees no `dv_access_token` and sends
 * `/approval/x` to `/sign-in`; sign-in authenticates against MSAL, which
 * succeeds because MSAL's own session is in localStorage; the cookie write
 * fails or is refused; the return to `/approval/x` meets the same middleware
 * check. Nothing in that circle prompts anybody, so it spins silently and the
 * screen never settles. A wrong page is a nuisance; a page that flickers
 * forever looks like a broken app and cannot even be read.
 */
export const SIGN_IN_BOUNCE_KEY = "capex_signin_bounces";
export const MAX_SIGN_IN_BOUNCES = 3;

/** Count this visit to the sign-in screen. Returns the number so far. */
export function noteSignInBounce(): number {
  if (typeof window === "undefined") return 0;
  try {
    const next = Number(window.sessionStorage.getItem(SIGN_IN_BOUNCE_KEY) ?? 0) + 1;
    window.sessionStorage.setItem(SIGN_IN_BOUNCE_KEY, String(next));
    return next;
  } catch {
    // Private mode, or storage disabled. The guard is a courtesy; losing it
    // must not stop somebody signing in.
    return 0;
  }
}

/** Forget the count. Called from any page that is not the sign-in screen. */
export function clearSignInBounces(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SIGN_IN_BOUNCE_KEY);
  } catch {
    /* See above. */
  }
}
