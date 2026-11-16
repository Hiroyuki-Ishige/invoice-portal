/**
 * **A stored date as the `yyyy-MM-dd` an `<input type="date">` requires** -
 * the one reading, for the ringi screen and the GET behind it (rule 20; the two
 * were separate copies until 2026-10-21).
 *
 * A DateOnly column arrives as `yyyy-MM-dd`, sometimes with a time after it,
 * and keeps its first ten characters. Anything else is parsed, and what does
 * not parse - legacy free text such as "2026/01" - is `""`, so the picker
 * starts empty rather than the browser rendering it blank without a word.
 *
 * Import-free, so the browser and the server can both ask it (rule 19).
 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
