/**
 * **Which column Dataverse is saying it does not have.**
 *
 * Rule 7 turns on this question - drop the column, retry, report a warning - and
 * the answer is a *string match on an error message*, which is exactly the kind
 * of thing that gets written slightly differently in each place that needs it.
 * It was: ten call sites, and two wordings between them.
 *
 * **Dataverse says it three ways, depending on what you were doing:**
 *
 * | Where | What comes back |
 * | --- | --- |
 * | `$select=hi_x` on a read | `Could not find a property named 'hi_x'` |
 * | `hi_x` in a PATCH/POST body | `Invalid property 'hi_x' was found in entity '...'` |
 * | the same, from the OData layer underneath | `The property 'hi_x' does not exist on type '...'` |
 *
 * Missing one of them is not a crash - it is a **worse message**, which is the
 * bug that bought this: the AI check's store path matched only the read wording,
 * so a column Admin > Setup had not created yet produced "this could not be
 * kept" instead of "an administrator needs to add it", and the reader was told
 * something had gone wrong rather than what to go and do (rule 10).
 *
 * Takes the whole response text - or an `Error`, or anything `String()` can
 * render - because the callers hold different things and none of them should be
 * parsing before they ask.
 */
export function missingColumnFrom(detail: unknown): string | null {
  const match =
    /Could not find a property named '([^']+)'|Invalid property '([^']+)'|The property '([^']+)' does not exist on type/.exec(
      String(detail ?? "")
    );
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** Whether Dataverse is saying it does not have **this** column. */
export function saysColumnMissing(detail: unknown, column: string): boolean {
  return missingColumnFrom(detail) === column;
}
