"use client";

/**
 * Whether a CSS media query currently matches.
 *
 * For the case `hidden lg:block` / `lg:hidden` cannot cover: two layouts that
 * are not just the same nodes rearranged, but two *mountings* of the same
 * stateful children. CSS hides the loser; it does not stop React building it.
 * Budget Allotment paid that twice per row - two `BudgetNamePicker`s, each with
 * its own state, listeners and memo over a few hundred budget lines - for one
 * that anybody could see.
 *
 * Use it only when the duplicate is expensive. A plain responsive class is
 * cheaper, works before hydration, and cannot get the breakpoint wrong.
 *
 * `useSyncExternalStore` rather than `useEffect` + `useState`, so the value is
 * read during render and never lands a frame late. The server snapshot is
 * `false` - mobile-first, matching the rest of the app - which means a caller
 * that renders on the server shows the narrow layout for one frame. Callers
 * here do not: the approval page returns a spinner until its data arrives, long
 * after hydration.
 */

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false),
    () => false
  );
}

/** The `lg` breakpoint, so callers do not each write the pixel value. */
export const LG_BREAKPOINT_QUERY = "(min-width: 1024px)";
