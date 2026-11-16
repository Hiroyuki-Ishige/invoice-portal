/**
 * **The amber outline: a button that withdraws answers** - Reopen, Withdraw my
 * answer, Ask to reopen Step 1 (rule 33: amber is kept for a reopen or a
 * withdrawal, outlined so it never reads as the way forward).
 *
 * Colour, weight and states only; each caller adds its own padding and gap, so
 * a bar button and a panel button can differ in size and never in meaning. The
 * buttons written before 2026-10-23 still carry their own copies - the debt is
 * converted as each is touched (ui-design.md).
 */
export const AMBER_OUTLINE_BUTTON =
  "flex items-center rounded-lg text-sm font-medium border border-amber-500/70 text-amber-700 dark:border-amber-400/70 dark:text-amber-300 hover:bg-amber-500/10 transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed";
