/**
 * **The app's name, "Invoice Portal".** One component for
 * every place on screen that shows the name - the header, the side menu, the
 * landing footer, the sign-in and access-denied screens, the tab - so those
 * cannot come to spell it two ways (rule 20).
 *
 * "Portal" is the same size and weight as "Invoice" - only its colour differs:
 * HOYA Blue `#0057BC` (6.8:1 on white); Cyan Blue `#00A3DE` in dark mode.
 */

/** Where the name must be plain text - the browser tab, a mail. */
export const APP_NAME = "Invoice Portal";
/** What the name stands for, where there is room to say it. */
export const APP_TAGLINE = "Create and manage invoices";

export function AppName({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      Invoice
      {/* A real space, not a margin: copied or read aloud, it is "Invoice Portal". */}
      <span className="text-[#0057BC] dark:text-[#00A3DE]">
        {" "}
        Portal
      </span>
    </span>
  );
}
