import { fiscalYearOf, type YearMonth } from "./dates";

/** `HYM1AC2026-182`: the prefix, the fiscal year (starts 1 April), a running number of 3 digits. */
export const INVOICE_NUMBER_PREFIX = "HYM1AC";

export function formatInvoiceNumber(fiscalYear: number, sequence: number): string {
  return `${INVOICE_NUMBER_PREFIX}${fiscalYear}-${String(sequence).padStart(3, "0")}`;
}

/** The number of an invoice dated in `date`, given the running number. */
export function invoiceNumberFor(date: YearMonth, sequence: number): string {
  return formatInvoiceNumber(fiscalYearOf(date), sequence);
}

/**
 * Read a number back. `null` for anything that is not ours - a hand-typed number must not
 * be taken for a sequence value, or the next one is computed from garbage.
 */
export function parseInvoiceNumber(value: string): { fiscalYear: number; sequence: number } | null {
  const match = new RegExp(`^${INVOICE_NUMBER_PREFIX}(\\d{4})-(\\d+)$`).exec(value.trim());
  if (!match) return null;
  return { fiscalYear: Number(match[1]), sequence: Number(match[2]) };
}
