/**
 * **Which column was too long, and how long it may be** - read from the body.
 *
 * The 400 twin of `privilege-error.ts`. A value longer than its column is
 * refused with the whole save, and the status line says only "400 (Bad
 * Request)", so the person who typed it was told "Dataverse rejected the
 * request (400)" and nothing else - reported 2026-10-26 from HOGV creating an
 * item, where the Items form has no length check on any field and the
 * Objective column holds 300 characters in the solution export.
 *
 * **The limit comes from Dataverse's own sentence, never from a constant
 * here.** The export is env1's; what env3-PAYG holds was not asked, and a limit
 * written down from the wrong environment refuses saves Dataverse would take
 * (rule 25). The body states the live number:
 *
 * `A validation error occurred.  The length of the 'hi_objectiveoutcome'
 * attribute of the 'hi_capexitem' entity exceeded the maximum allowed length
 * of '300'.`
 *
 * Pure and dependency-free, so a throwaway script can drive it.
 */

export interface OverlongColumn {
  /** The column's logical name, e.g. `hi_objectiveoutcome`. */
  column: string;
  /** The table's logical name, `""` when the sentence did not carry one. */
  table: string;
  /** The column's maximum length in characters. */
  maxLength: number;
}

/** Pulls the overlong column out of a Dataverse error body, or `null` when it named none. */
export function overlongColumnOf(detail: unknown): OverlongColumn | null {
  const text = String(detail ?? "");
  const match =
    /length of the '([A-Za-z0-9_]+)' attribute(?: of the '([A-Za-z0-9_]+)' entity)? exceeded the maximum allowed length of '?(\d+)'?/i.exec(
      text
    );
  if (!match) return null;
  const maxLength = Number(match[3]);
  if (!Number.isFinite(maxLength)) return null;
  return { column: match[1], table: match[2] ?? "", maxLength };
}

/**
 * **One sentence naming the field and its limit**, or `null` when Dataverse
 * named nothing - the caller's generic 400 is then the honest answer (rule 6).
 *
 * `labels` maps a logical name to what the form calls it. A `Map`, never an
 * object: the name comes from a response body (rule 4).
 */
export function lengthAdvice(
  detail: unknown,
  labels?: ReadonlyMap<string, string>
): string | null {
  const overlong = overlongColumnOf(detail);
  if (!overlong) return null;
  const field = labels?.get(overlong.column) ?? `"${overlong.column}"`;
  return (
    `${field} is too long: Dataverse holds at most ${overlong.maxLength} characters there. ` +
    "Shorten it and save again - nothing was saved."
  );
}
