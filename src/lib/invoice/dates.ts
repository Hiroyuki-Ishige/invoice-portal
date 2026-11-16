/**
 * Dates as the debit note prints them: `31-Oct-2026`, and the month `Oct-26`.
 *
 * English month names are a table here and not `toLocaleDateString()`: the PDF goes to
 * overseas companies, and the reader's browser locale must not decide what it says
 * (the same rule `formatAmount` follows for numbers).
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface YearMonth {
  year: number;
  /** 1-12 */
  month: number;
}

export interface YearMonthDay extends YearMonth {
  day: number;
}

export function lastDayOfMonth({ year, month }: YearMonth): YearMonthDay {
  // Day 0 of the next month is the last day of this one; UTC so no time zone moves it.
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day };
}

/** `31-Oct-2026` */
export function formatInvoiceDate({ year, month, day }: YearMonthDay): string {
  return `${String(day).padStart(2, "0")}-${MONTHS[month - 1]}-${year}`;
}

/** `Oct-26` */
export function formatMonthLabel({ year, month }: YearMonth): string {
  return `${MONTHS[month - 1]}-${String(year % 100).padStart(2, "0")}`;
}

/**
 * The fiscal year a date falls in. **It starts on 1 April** and is named for the calendar
 * year it starts in: 31-Oct-2026 is FY2026, and 15-Feb-2027 is still FY2026.
 */
export function fiscalYearOf({ year, month }: YearMonth): number {
  return month >= 4 ? year : year - 1;
}
