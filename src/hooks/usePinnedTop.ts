"use client";

import { useCallback } from "react";

/** The custom property this writes, and the one a second sticky element reads. */
export const PINNED_CHROME_BOTTOM = "--pinned-chrome-bottom";

/**
 * **Publishes how far down the viewport the pinned chrome ends**, as a CSS
 * custom property, so a second sticky element can pin directly under it.
 *
 * Step 1's decision row pins below the stepper and stays reachable while the
 * route scrolls past it. `top` has to be a length, and the length is not a
 * constant: the stepper grows a "Locked" line under a step whose contents are
 * fixed, the ringi bar grows a Save button when there are unsaved changes, and
 * the app header is `h-14` on a phone and `h-16` from `md`. A literal
 * `top-[228px]` is right on one screen in one state - too small and content
 * peeks through the gap, too large and the row hides under the chrome.
 *
 * **Measured off the chrome itself, including its own offset.**
 * `getComputedStyle(node).top` is exactly what `top-14 md:top-16` compiled to,
 * so this follows a change to that class without anybody remembering to.
 *
 * **A CSS variable, not React state**, and not a style preference: state means
 * `setState` in an effect body, which this repo's lint rule refuses, and the
 * way round it (`useColumnOverflow`'s) is to ride the frame queue - which does
 * not run at all in a tab the browser is not painting. A property written
 * straight to the DOM needs no frame and no re-render.
 *
 * **A callback ref, not a `RefObject`**, and this one was a bug first: the
 * approval page returns a loading screen before it returns the form, so a ref
 * object is still `null` when an effect with `[ref]` deps runs, and the effect
 * never runs again once the real tree mounts - the property was simply never
 * written. A callback ref is called *when the node attaches*, whenever that is.
 * React 19 calls the function it returns on detach, which is the cleanup.
 */
export function usePinnedTop(): (node: HTMLElement | null) => (() => void) | void {
  return useCallback((node: HTMLElement | null) => {
    if (!node) return;

    const measure = () => {
      // A length, because the element is `sticky` with the class set. `auto`
      // parses to NaN, and NaN in a CSS length silently drops the whole
      // declaration - so the offset would fall back to nothing, not to wrong.
      const offset = parseFloat(getComputedStyle(node).top);
      const bottom = (Number.isFinite(offset) ? offset : 0) + node.offsetHeight;
      document.documentElement.style.setProperty(PINNED_CHROME_BOTTOM, `${bottom}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    /* The observer sees a height change but not the **offset**: crossing `md`
       swaps `top-14` for `top-16` without necessarily resizing the chrome. */
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      // The property's whole life is this page; a stale one left on `<html>`
      // would pin something on the next screen to a chrome that is not there.
      document.documentElement.style.removeProperty(PINNED_CHROME_BOTTOM);
    };
  }, []);
}
