/**
 * Display formatting shared by the client and the server.
 *
 * Deliberately its own module rather than part of `api-helpers`: that one
 * imports `NextResponse`, so a client component that wanted a number formatted
 * would drag server code into the bundle to get it.
 */

/**
 * A money amount, with thousands separators.
 *
 * **Every amount this app displays goes through here.** A figure printed raw -
 * `40500` next to `2,760,000` - is not merely untidy: the two are read at
 * different speeds, and a reader comparing them has to count digits. These
 * numbers are approved by people scanning a page.
 *
 * The locale is pinned to `en-US` rather than the viewer's. A German browser
 * renders `40.500`, which an English reader takes for forty and a half - and the
 * same ringi has to mean the same thing to everyone who opens it, including in a
 * PDF that gets mailed around.
 *
 * Not for rates. An FX rate of `0.0066666667` is a ratio, not an amount, and
 * rounding it to two places would change what it converts to.
 */
export function formatAmount(value: unknown, maximumFractionDigits = 2): string {
  const amount = Number(value);
  // "-" and not "0": a value that could not be read is not the same as nothing.
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { maximumFractionDigits });
}

/**
 * The same amount, but **empty when there is nothing there**, and whole.
 *
 * What every budget grid in this app wants. A table of quarters is mostly
 * zeroes, and a screen full of `0` reads as "measured, and it came to nothing"
 * rather than "no budget in that quarter" - so the cells are left blank, and
 * the eye follows the figures that exist. Rounded to whole KUSD for the same
 * reason: nobody plans capital to the cent, and a column of `9,050` beside
 * `2,250.4` stops lining up.
 *
 * ### Why this exists rather than each table writing three lines
 *
 * It had been written seven times - `dashboard`, `capex/schedules`,
 * `schedules/[id]`, `summary/by-theme` and three `for-iir` components - each as
 * a local `formatAmount` **shadowing the shared one by name**, and every one of
 * them called a bare `toLocaleString()` with no locale. That is the exact bug
 * CLAUDE.md records fixing in `/reports/capex-pdf` on 2026-08-09, with the
 * worked example: a German browser renders `91,611` as `91.611`, and an English
 * reader takes that for ninety-one point six. Seven copies is seven chances to
 * miss it, and shadowing the shared name is why nobody noticed there were two.
 */
export function formatAmountOrBlank(value: number | undefined | null): string {
  if (value === undefined || value === null || value === 0) return "";
  return formatAmount(Math.round(value), 0);
}

/**
 * A difference as a reader says it: `+1,200`, `-350`, `0` - and blank for
 * `null`, nothing to compare against (`roundedDelta`). The "vs Budget in"
 * lines on IIR Deck and Meeting in MD (rule 20).
 */
export function formatDelta(delta: number | null): string {
  if (delta === null) return "";
  return delta > 0 ? `+${formatAmount(delta)}` : formatAmount(delta);
}

/**
 * **The Final Total, printed to the cent.**
 *
 * `formatAmount()` drops trailing zeroes, which is right for a budget grid and
 * wrong for the one figure a ringi is approved for: `18,400` and `18,400.00`
 * are the same number, and only the second reads as a settled amount beside
 * `40,500.50`. Two decimals, always.
 *
 * Its own function because that line was written out by hand in two places on
 * the approval page - byte-identical `toLocaleString` calls on the figure the
 * whole page exists to get right, which is precisely the shape the money rule
 * was written to catch. The locale is pinned here for the same reason it is
 * pinned above.
 */
export function formatAmountWithCents(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * `1st`, `2nd`, `3rd`, `11th` - the ordinal of a negotiation round.
 *
 * Here rather than in the two files that print it: the approval page labels
 * each round and the notification names the one it reports on, and a rule with
 * two implementations is a rule with two behaviours the day somebody fixes an
 * edge case in one of them. `11`-`13` take `th`, which is the edge case.
 */
export function ordinalLabel(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * **An amount as somebody is typing it**, grouped but still editable.
 *
 * `formatAmount()` is for a figure that has been decided; this is for the box it
 * is being decided in. The two cannot be the same function: `formatAmount(1)`
 * is `"1"`, so a person part-way through typing `1.05` would have their decimal
 * point taken away between the `.` and the `0`.
 *
 * **Grouped by regex, not by `toLocaleString`.** Not for locale reasons this
 * time - the manual grouping has no locale to get wrong at all - but for
 * precision: `Number("12345678901234567890").toLocaleString()` is not the
 * number that was typed, and an amount field must show back the digits it was
 * given.
 *
 * What it keeps and what it drops:
 *
 *   `"100000"`   -> `"100,000"`
 *   `"1,00,0"`   -> `"1,000"`     the commas are re-derived, never trusted
 *   `"1234.5"`   -> `"1,234.5"`   decimals pass through as typed
 *   `"1234."`    -> `"1,234."`    mid-typing, so the point survives
 *   `".5"`       -> `".5"`        no invented leading zero
 *   `"007"`      -> `"7"`
 *   `"12a3"`     -> `"123"`       anything that is not a digit or a point goes
 *   `""`         -> `""`
 *
 * **The reader of this value must strip the commas** - `Number("1,000")` is
 * `NaN`. `matchesColumnFilters` does; so does anything else that should.
 */
export function formatAmountInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  const point = cleaned.indexOf(".");
  // A second point is a typo, not a second decimal place.
  const whole = (point === -1 ? cleaned : cleaned.slice(0, point)).replace(/^0+(?=\d)/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (point === -1) return grouped;
  return `${grouped}.${cleaned.slice(point + 1).replace(/\./g, "")}`;
}

/** The digits back out of what `formatAmountInput` shows. `Number("1,000")` is `NaN`. */
export function unformatAmountInput(value: string): string {
  return String(value ?? "").replace(/,/g, "");
}

/**
 * **A date in this app's own order, in local time** - `2026-09-15 14:03`, or
 * with `/` or no separator at all - never a locale's (`toLocaleString()` puts
 * the month first in en-US and the day first elsewhere). `""` for a date that
 * will not read.
 *
 * Four screens each padded their own (review, 2026-10-20; rule 20): the
 * explanation dialog (`-`), the route stamps (`/`), and two file names
 * (`yyyymmdd`, no time).
 */
export function localStamp(value: string | number | Date, separator = "-", withTime = true): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(separator);
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}
