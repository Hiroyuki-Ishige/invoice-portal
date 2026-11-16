/**
 * The ONE copyright line this app shows.
 *
 * Both the landing page and the dashboard render this, so the holder and the
 * release month cannot drift apart on two screens (rule 5: one list, one owner).
 * Change `RELEASE_MONTH` here and every screen follows.
 *
 * The year is taken from `RELEASE_MONTH`, never from `new Date()`: a date read
 * in the browser is read in the viewer's timezone, so on 31 December a reader
 * behind UTC and a reader ahead of it would see two different copyright years -
 * and the server-rendered HTML would disagree with the client's first paint.
 */

export const COPYRIGHT_HOLDER = "Hiroyuki Ishige";

/** MM/YYYY. The month this application was released. */
export const RELEASE_MONTH = "08/2026";

const RELEASE_YEAR = RELEASE_MONTH.split("/")[1];

export function CopyrightNotice({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      © {RELEASE_YEAR} {COPYRIGHT_HOLDER}
      <span className="mx-1.5 text-[#B0B5B5]/60">·</span>
      Released {RELEASE_MONTH}
    </p>
  );
}
