"use client";

/**
 * **What "this screen is fetching" looks like, everywhere.**
 *
 * Three shapes, one hue, no card. They grew up on Summary > By Theme over
 * 2026-09-12/13 and were asked for on every screen the next day; the spellings
 * that were scattered across a dozen pages - a spinning `RefreshCw`, a
 * `Loader2`, a grey box, a `bg-white/80` overlay with no blur - are now this
 * (rule 20). A state with a dozen looks is a dozen states to a reader.
 *
 * **Which to reach for:**
 *
 * | | |
 * | --- | --- |
 * | `BusyRing` | the glyph. Beside a word in a toolbar, or inside one of the two below |
 * | `LoadingBlock` | the **first** load: there are no figures yet, so it sits in the empty panel, table cell or page |
 * | `LoadingVeil` | a **re**-load: there are figures, and they are stale rather than wrong, so the whole screen frosts over them |
 *
 * The veil is not for the first load and the block is not for a reload. That
 * distinction is the whole design: blurring an empty screen says nothing, and
 * throwing a reader back to an empty screen to re-fetch what they are already
 * reading loses their place.
 *
 * **One screen breaks it on purpose, and it is the only one.** The Schedule
 * grid (`capex/schedules`) is a fixed-height page whose body scrolls inside
 * itself, so it has no empty table row to print a block into - behind the veil
 * there is a toolbar and a blank grid either way. It shows the veil for both.
 * A rule stated here as absolute while a caller quietly breaks it is a rule the
 * next reader will trust and then be surprised by, so it is written down.
 */

import { useCallback } from "react";

/** The keys that scroll a page. Swallowed while the veil is up. */
const SCROLLING_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/** What a screen says while it fetches, unless it has something better. */
export const LOADING_TEXT = "Loading data...";

/**
 * **The busy ring** - the one shape this app uses for "fetching".
 *
 * It replaced a spinning `RefreshCw`, which is the *refresh* glyph: two arrows
 * chasing each other, the icon on the button beside it, and a picture of an
 * action rather than of waiting. A ring with a gap says only "something is
 * running", which is all there is to say.
 *
 * A border and a transparent top edge, not an SVG - the same four classes every
 * busy button in this app already wears. The track is the brand blue at 20%, so
 * the gap reads as motion rather than as a missing quarter of a circle.
 */
export function BusyRing({ size = 40 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="-95 -65 190 135"
      width={size}
      height={Math.round((size * 135) / 190)}
      className="inline-block shrink-0 text-[#0057BC] dark:text-[#00A3DE]"
    >
      {BUSY_DIAMONDS.map(([x, y], i) => {
        // Each diamond's step is to the next place round the ring (the last wraps to the first).
        const [nx, ny] = BUSY_DIAMONDS[(i + 1) % BUSY_DIAMONDS.length];
        return (
          <g
            key={i}
            className={`busy-diamond busy-hop-${i}`}
            style={{ "--dx": `${nx - x}px`, "--dy": `${ny - y}px` } as React.CSSProperties}
          >
            <g transform={`translate(${x} ${y}) rotate(45)`}>
              <rect x={-16} y={-16} width={32} height={32} rx={7} fill="currentColor" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The seven places, in ring order: top-left, top-right, right, bottom-right,
 * bottom-left, left, centre. A diamond's turn comes in the reverse of this order
 * (see `busyHop0-6` in `globals.css`), so each steps into a place already vacated.
 */
const BUSY_DIAMONDS: ReadonlyArray<readonly [number, number]> = [
  [-35, -38],
  [35, -38],
  [69, -2],
  [28, 39],
  [-27, 41],
  [-69, -1],
  [0, -3],
];

/**
 * The ring and a sentence, centred, with nothing round them.
 *
 * For the **first** load, where there is nothing yet to be stale: an empty
 * table's body row, an empty panel, a Suspense fallback. `row` lays them side
 * by side for a short space (a table cell, a toolbar); the default stacks them.
 */
export function LoadingBlock({
  text = LOADING_TEXT,
  size = 20,
  row = true,
  className = "",
}: {
  text?: string;
  size?: number;
  row?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex ${row ? "flex-row items-center gap-3" : "flex-col items-center gap-3.5"} justify-center text-slate-500 dark:text-slate-400 ${className}`}
    >
      <BusyRing size={size} />
      <span className="text-[13px] font-medium tracking-wide">{text}</span>
    </div>
  );
}

/**
 * **A frosted veil over the whole screen** (`.loading-veil` in `globals.css`).
 *
 * For a **re**-load, and only when there are figures to keep. The same
 * translucency the rest of this app is built on, and the honest picture of what
 * is underneath: figures that are stale, not wrong. Blurring them says "these
 * are being replaced" without hiding the shape of the page or throwing the
 * reader back to an empty screen.
 *
 * **It takes the clicks** (2026-09-13, asked for). A veil you can click through
 * is a screen that accepts a second question while it is still answering the
 * first - and with the page blurred you would be aiming at a control you cannot
 * read. `aria-busy` says the same thing to a screen reader.
 *
 * **The pointer stays the ordinary arrow** (2026-09-13, asked for the same day
 * the veil was). It wore `cursor-wait` to say the same thing a third time, and
 * a spinning cursor on top of a spinning ring on top of a frosted page is the
 * screen shouting. The ring is the thing that says "busy"; the pointer is the
 * reader's, not the app's.
 *
 * **Scrolling and the keyboard are the two ways past a click guard**, and for a
 * while the comment here named both while the code blocked only the first:
 * focus left on the table behind the veil still took arrow keys, Space and Page
 * Down. `tabIndex={-1}` plus the focus on mount is what makes the key handler
 * reachable at all - without it the events never leave the element that had
 * focus when the veil appeared.
 *
 * **No card.** A white box with a border and a shadow, floating on a frosted
 * veil, is two separations doing one job - and the second one is what made this
 * read as a dialog rather than as a state.
 */
export function LoadingVeil({ text = LOADING_TEXT }: { text?: string }) {
  /* A callback ref rather than an inline arrow: an inline one is a new function
     every render, so React detaches and re-attaches it, and the re-attach
     re-focuses - which steals focus back from anything the reader moved to
     while the veil was up. */
  const takeFocus = useCallback((el: HTMLDivElement | null) => {
    el?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="loading-veil fixed inset-0 z-50 flex items-center justify-center bg-white/55 dark:bg-slate-950/55"
      role="status"
      aria-live="polite"
      aria-busy="true"
      tabIndex={-1}
      ref={takeFocus}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (SCROLLING_KEYS.has(e.key)) e.preventDefault();
      }}
    >
      <div className="flex flex-col items-center gap-3.5">
        <BusyRing />
        <span className="text-[13px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
          {text}
        </span>
      </div>
    </div>
  );
}
