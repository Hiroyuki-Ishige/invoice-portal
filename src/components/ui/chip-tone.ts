/**
 * **A status is filled or outlined, never a second hue** (`.claude/rules/ui-design.md`,
 * rule 33) - the two weights, as classes, in one place.
 *
 * `FILLED_CHIP` when the condition holds, `OUTLINED_CHIP` when it does not.
 * Measured tokens: the HOYA Blue line at 30% and the Warm Black line at 40%
 * are the project's 3:1 borders.
 *
 * The Step 2 condition chips (`conditionChipClass`) and **both** of the
 * quotation reader's confidence chips read these. Those two printed one fact -
 * how sure the reader was - in green and amber on two screens until 2026-10-20;
 * a status with two looks is two statuses until somebody notices (rule 20).
 */
export const FILLED_CHIP =
  "bg-[#0057BC]/10 text-[#0057BC] border border-[#0057BC]/30 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] dark:border-[#00A3DE]/40";

export const OUTLINED_CHIP =
  "bg-white text-[#2D2A28] border border-[#2D2A28]/40 dark:bg-transparent dark:text-slate-300 dark:border-slate-500";

/** One of the two, by whether the condition holds. */
export const chipTone = (holds: boolean): string => (holds ? FILLED_CHIP : OUTLINED_CHIP);
