/**
 * **The statement page** - the second page of an invoice that carries its own breakdown:
 *
 * - R&D reimbursement (sheet `請求_立替研究`): one amount per A/C code (`Supplies,Repair,Outsource_2610`).
 * - R&D and R&D (New Business) (sheet `請求_研究`): an amount per department per A/C code, and a
 *   Claim amount of 1.1 x the expense (`R&D_2610`, its two pages).
 * - Expenses (sheet `請求_出向者立替費用`): the month's claim list and an amount per company per A/C
 *   code (`Expenses paid by HOYA_202610`) - the same page behind every expense invoice of the month.
 * - Patent and Patent (New Business) (sheet `請求_特許`): the claim list of the companies sharing the
 *   cost (1.05 x each one's allocated part, with its ratio), then the A/C table of the IP team.
 *
 * Saved on the invoice header as JSON (`hi_statement`), because the app keeps no PDF files: the
 * document is drawn again from what was saved, and page 2 must come back with page 1. One file
 * for the shape and the checks, read by the sheet readers, the issue route and the PDF.
 */

import { formatAmount } from "../utils/format";

const yen = (n: number) => `¥${formatAmount(n, 0)}`;

/** A department column of the table (`Akishima Common` / `HYM11R0020`). */
export interface StatementColumn {
  name: string;
  /** The cost centre under the name; empty when the sheet has none. */
  code: string;
}

/** One A/C-code row. */
export interface StatementRow {
  /** `7650000000` - kept as text, it is a code and not a figure (`600020X005` has a letter in it). */
  code: string;
  /** `R/E supplies` */
  nameEn: string;
  /** `研_消耗具品費` - from the Excel, printed as it is there. */
  nameJp: string;
  /** The mark printed left of the row (`*`, pointing at the footnote); empty for none. */
  mark: string;
  /** One per column of `columns`; empty when the statement has no department columns. */
  amounts: number[];
  /** The row's Total. A row of 0 is printed when the sheet prints it. */
  total: number;
}

/** One line of the claim list at the top of the expenses page: `HOMS※ 0 ※HOMS & HUSA`. */
export interface StatementSummaryLine {
  /** As the sheet prints it, footnote mark and all: `HOMS※`. */
  label: string;
  amount: number;
  /** The note beside it; empty for none. */
  note: string;
  /** `allocation` only: the allocated part the amount is `factor` x of; `null` for a company with nothing this month. */
  base: number | null;
  /** `allocation` only: the company's share, `0.393` for 39.3%. */
  ratio: number | null;
}

/**
 * How page 2 is laid out:
 * - `account`: one amount per A/C code (R&D reimbursement).
 * - `department`: an amount per department, the Claim amount `factor` x the total (R&D).
 * - `companies`: the claim list, then an amount per company (expenses). The table covers every
 *   company of the month, so its total is not this invoice's amount - the claim list's line for
 *   this company is.
 * - `allocation`: the claim list of the companies sharing one cost (`factor` x each one's part of
 *   the table's total, by `ratio`), then the A/C table (patent). This invoice is its company's line.
 */
export type StatementLayout = "account" | "department" | "companies" | "allocation";

export interface Statement {
  layout: StatementLayout;
  /** The underlined heading: `Research and Development Fees`. */
  heading: string;
  /** `2026/10`, as the sheet prints "Claim year/month". */
  claimMonth: string;
  /** `HOMT` */
  claimTo: string;
  /** The Claim amount - the invoice amount. */
  amount: number;
  /** When the Claim amount is a multiple of the table's total (`= 1.1 x ¥79,365,602`); `null` when they are equal. */
  factor: number | null;
  /** The label over the department columns: `Expense amount of 2026/10`. Empty when there are none. */
  spanLabel: string;
  columns: StatementColumn[];
  rows: StatementRow[];
  /** One per column - the Total row. */
  columnTotals: number[];
  /** The sum of the row totals: the Claim amount, or the base `factor` multiplies. */
  total: number;
  /** The `※...` line under the table; empty for none. */
  footnote: string;
  /** `companies` and `allocation`: the claim list, in the sheet's order. */
  summary: StatementSummaryLine[];
  /** `allocation` only: what the ratios are based on (`Based on shipping quantity of 2026/3Q Budget`). */
  allocationBasis: string;
}

export const STATEMENT_LIMITS = {
  /** The stored JSON. The R&D table (23 rows x 10 departments) comes to about 6,000 characters. */
  json: 20000,
  rows: 60,
  columns: 16,
  text: 300,
  code: 20,
  name: 100,
} as const;

export type StatementValidation = { ok: true; value: Statement } | { ok: false; error: string };

const isYen = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= 99_999_999_999;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** A claim-list label without its footnote mark: `HOMS※` -> `HOMS`. */
export const summaryCode = (label: string) => label.replace(/※/g, "").trim().toLowerCase();

/** The Claim amount from the table's total - `factor x total`, to the yen. */
export function claimFromBase(total: number, factor: number | null): number {
  return factor === null ? total : Math.round(total * factor);
}

/**
 * Check a statement posted with an invoice (or read back from Dataverse). `amount` and `claimTo`
 * are the invoice's own: a page 2 that does not add up to page 1, or names another company, is refused.
 * Amounts in a row may be negative (a transfer); the totals must still add up.
 */
export function validateStatement(raw: unknown, amount: number, claimTo: string): StatementValidation {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "The statement is not valid." };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number = STATEMENT_LIMITS.text) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const heading = str(r.heading);
  if (!heading) return { ok: false, error: "The statement has no heading." };
  const claimMonth = str(r.claimMonth);
  if (!/^\d{4}\/\d{2}$/.test(claimMonth)) return { ok: false, error: "The statement's claim month is not valid." };
  const layout: StatementLayout =
    r.layout === "companies" || r.layout === "department" || r.layout === "account" || r.layout === "allocation"
      ? r.layout
      : Array.isArray(r.columns) && r.columns.length > 0
        ? "department"
        : "account";
  const code = str(r.claimTo, 50);
  if (code.toLowerCase() !== claimTo.trim().toLowerCase()) {
    return { ok: false, error: `The statement is for ${code || "no company"}, not ${claimTo}.` };
  }
  if (r.amount !== amount) return { ok: false, error: "The statement's Claim amount is not the invoice amount." };
  const factor = r.factor === null || r.factor === undefined ? null : r.factor;
  if (factor !== null && (typeof factor !== "number" || !(factor > 0 && factor < 10))) {
    return { ok: false, error: "The statement's multiplier is not valid." };
  }

  const rawColumns = Array.isArray(r.columns) ? r.columns : [];
  if (rawColumns.length > STATEMENT_LIMITS.columns) return { ok: false, error: "The statement has too many columns." };
  const columns: StatementColumn[] = rawColumns.map((c) => {
    const col = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
    return { name: str(col.name, STATEMENT_LIMITS.name), code: str(col.code, STATEMENT_LIMITS.code) };
  });

  if (!Array.isArray(r.rows) || r.rows.length === 0 || r.rows.length > STATEMENT_LIMITS.rows) {
    return { ok: false, error: `The statement must have 1 to ${STATEMENT_LIMITS.rows} rows.` };
  }
  const rows: StatementRow[] = [];
  for (const item of r.rows) {
    if (typeof item !== "object" || item === null) return { ok: false, error: "A statement row is not valid." };
    const row = item as Record<string, unknown>;
    const rowCode = str(row.code, STATEMENT_LIMITS.code);
    if (!rowCode) return { ok: false, error: "A statement row has no A/C code." };
    const amounts = Array.isArray(row.amounts) ? row.amounts : [];
    if (amounts.length !== columns.length || !amounts.every(isYen)) {
      return { ok: false, error: `The amounts for A/C ${rowCode} are not whole yen, one per column.` };
    }
    if (!isYen(row.total)) return { ok: false, error: `The total for A/C ${rowCode} is not whole yen.` };
    if (columns.length > 0 && sum(amounts) !== row.total) return { ok: false, error: `The amounts for A/C ${rowCode} do not add up to its total.` };
    rows.push({
      code: rowCode,
      nameEn: str(row.nameEn, STATEMENT_LIMITS.name),
      nameJp: str(row.nameJp, STATEMENT_LIMITS.name),
      mark: str(row.mark, 3),
      amounts: amounts as number[],
      total: row.total,
    });
  }

  const columnTotals = Array.isArray(r.columnTotals) ? r.columnTotals : [];
  if (columnTotals.length !== columns.length || !columnTotals.every(isYen)) return { ok: false, error: "The statement's column totals are not valid." };
  if (columns.some((_, i) => sum(rows.map((row) => row.amounts[i])) !== columnTotals[i])) {
    return { ok: false, error: "A column of the statement does not add up to its total." };
  }
  const total = sum(rows.map((row) => row.total));
  if (r.total !== total) return { ok: false, error: "The statement rows do not add up to its total." };

  const listed = layout === "companies" || layout === "allocation";
  const rawSummary = listed && Array.isArray(r.summary) ? r.summary : [];
  if (rawSummary.length > STATEMENT_LIMITS.columns) return { ok: false, error: "The statement's claim list is too long." };
  const summary: StatementSummaryLine[] = [];
  for (const item of rawSummary) {
    const line = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (!isYen(line.amount)) return { ok: false, error: "A line of the statement's claim list is not whole yen." };
    const base = layout === "allocation" && isYen(line.base) ? line.base : null;
    const ratio = layout === "allocation" && typeof line.ratio === "number" && line.ratio >= 0 && line.ratio <= 1 ? line.ratio : null;
    summary.push({ label: str(line.label, STATEMENT_LIMITS.code), amount: line.amount, note: str(line.note, STATEMENT_LIMITS.name), base, ratio });
  }
  const codes = summary.map((l) => summaryCode(l.label));
  if (new Set(codes).size !== codes.length) return { ok: false, error: "The statement's claim list names a company twice." };
  const own = summary.find((l) => summaryCode(l.label) === claimTo.trim().toLowerCase());
  if (layout === "companies") {
    // The whole month on one page: the list adds up to the table, and this company's line is this invoice.
    if (sum(summary.map((l) => l.amount)) !== total) return { ok: false, error: "The statement's claim list does not add up to its table." };
  } else if (layout === "allocation") {
    // The parts add up to the table; each claim is factor x its part, to the yen (Excel rounds the
    // unrounded share, so a claim can be 1 yen off the rounded part times the factor).
    if (factor === null) return { ok: false, error: "The statement has no multiplier for its allocation." };
    if (sum(summary.map((l) => l.base ?? 0)) !== total) return { ok: false, error: "The allocated parts do not add up to the statement's table." };
    const off = summary.find((l) => Math.abs(l.amount - (l.base ?? 0) * factor) > 1);
    if (off) return { ok: false, error: `${off.label}: ${yen(off.amount)} is not ${factor} x ${yen(off.base ?? 0)}.` };
  } else if (claimFromBase(total, factor) !== amount) {
    return { ok: false, error: `The statement total (${yen(total)}${factor ? ` x ${factor}` : ""}) is not the invoice amount (${yen(amount)}).` };
  }
  if (listed) {
    if (!own) return { ok: false, error: `${claimTo} is not on the statement's claim list.` };
    if (own.amount !== amount) return { ok: false, error: `The statement claims ${yen(own.amount)} from ${claimTo}, not the invoice amount (${yen(amount)}).` };
  }

  const value: Statement = {
    layout,
    heading,
    claimMonth,
    claimTo: code,
    amount,
    factor,
    spanLabel: str(r.spanLabel),
    columns,
    rows,
    columnTotals: columnTotals as number[],
    total,
    footnote: str(r.footnote),
    summary,
    allocationBasis: layout === "allocation" ? str(r.allocationBasis) : "",
  };
  if (JSON.stringify(value).length > STATEMENT_LIMITS.json) return { ok: false, error: "The statement is too long to save." };
  return { ok: true, value };
}

/** The stored column as a statement; anything unreadable is no statement (the invoice still prints its page 1). */
export function parseStoredStatement(text: unknown, amount: number, claimTo: string): Statement | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  try {
    const checked = validateStatement(JSON.parse(text), amount, claimTo);
    return checked.ok ? checked.value : null;
  } catch {
    return null;
  }
}

/**
 * For the sheet readers: the page they built, checked by the same rule the issue route applies, so a
 * sheet that would be refused at Issue is refused at upload instead (with the sheet named).
 */
export function assertIssuable(statement: Statement, amount: number, claimTo: string, where: string, fail: (message: string) => Error): Statement {
  const checked = validateStatement(statement, amount, claimTo);
  if (!checked.ok) throw fail(`${where}: ${checked.error}`);
  return checked.value;
}
