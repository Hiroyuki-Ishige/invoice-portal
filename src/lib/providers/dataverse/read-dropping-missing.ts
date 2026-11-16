/**
 * **One ringi read whose optional columns drop out one at a time** (rule 7) -
 * the ladder `findings-return` and `applicant-reopen-request` both climb, here
 * once since the 2026-10-23 review found the second copy.
 *
 * `required` columns are the read's reason to exist: one the table lacks is
 * answered as `missing`, for the caller to word (it knows what the column is
 * for). An `optional` one is dropped and the read retried; `asked` is what the
 * successful read finally requested, so "absent from the record" afterwards
 * means "could not ask" only where the caller checks `asked` (rule 6).
 *
 * Server only by what it is handed - a bearer token in `headers`.
 */

import { missingColumnFrom } from "./missing-column";

export type DroppingRead =
  | { ok: true; record: Record<string, unknown>; asked: string[]; response: Response }
  | { ok: false; status: number; detail: string; missing: string | null };

export async function readDroppingMissing(
  recordUrl: string,
  headers: Record<string, string>,
  required: readonly string[],
  optional: readonly string[],
  /** For the server log - which endpoint dropped a column. */
  label: string
): Promise<DroppingRead> {
  let asked = [...required, ...optional];
  for (;;) {
    const response = await fetch(`${recordUrl}?$select=${asked.join(",")}`, { headers });
    if (response.ok) {
      return { ok: true, record: (await response.json()) as Record<string, unknown>, asked, response };
    }
    const detail = response.status === 400 ? await response.text() : "";
    const missing = missingColumnFrom(detail);
    if (!missing || !optional.includes(missing) || !asked.includes(missing)) {
      return { ok: false, status: response.status, detail, missing };
    }
    console.warn(`[${label}] Table is missing "${missing}" - reading without it`);
    asked = asked.filter((column) => column !== missing);
  }
}
