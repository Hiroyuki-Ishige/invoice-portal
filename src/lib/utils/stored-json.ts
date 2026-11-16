/**
 * **A Memo column that holds JSON, read.** The column arrives as a string (or
 * as whatever a caller already parsed), and anything that will not parse is
 * `null` - "nothing there", never a 500 in front of somebody answering a route.
 * What comes out is `unknown` until a sanitiser says otherwise (rule 12).
 *
 * One reader for `scm-action` and the SCM sign-off audience, which each had a
 * copy until review (2026-10-19, rule 20).
 */
export function parseStoredJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
}
