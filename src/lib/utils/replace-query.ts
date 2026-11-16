/**
 * **Rewrite this page's query string in place, without asking the server.**
 *
 * The screen filters (`?kind=`, `?snapshot=`) live in the URL so Back, a
 * bookmark and a shared link agree (rule 40) - but every screen that reads them
 * is a client component that fetches its own data. `router.replace()` does not
 * know that: it is a navigation, so it asks the server for an RSC payload first
 * (through the middleware, on a protected path) and only moves the URL - and
 * therefore `useSearchParams` and the control's own highlight - once that
 * answer is back. Reported 2026-09-24: in production All, CAPEX and the Budget
 * in picker "could not be pushed"; in development, where that round trip is
 * local, they could. Which part of that round trip failed was not pinned down
 * (a scripted click in production went through; one real click made no request
 * at all), so the fix removes the round trip rather than one suspect in it.
 *
 * `history.replaceState` is the documented alternative: Next patches it, so
 * `useSearchParams` follows at once (an `ACTION_RESTORE` - no fetch), and
 * there is no request that can be slow, redirected or dropped.
 */
export function replaceQuery(params: URLSearchParams): void {
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}
