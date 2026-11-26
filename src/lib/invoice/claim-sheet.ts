import { formatAmount } from "../utils/format";
import type { YearMonth } from "./dates";
import { STATEMENT_LIMITS, assertIssuable, type Statement, type StatementColumn, type StatementRow, type StatementSummaryLine } from "./statement-record";
import { SheetReadError, locateLabels, readSheet, refOf, serialToYearMonth, sheetNameWarning, type CellPos, type SheetCells } from "./xlsx-sheet";

/** The sheet the accounting team keeps in `立替研究・出向者立替費用計算(FY….xlsm)`. */
export const CLAIM_SHEET_NAME = "請求_出向者立替費用";

export interface ClaimLine {
  /** The "Claim to" label with the `※` footnote mark removed: `HLAM`, `HOGV`, `HOMS-J`... */
  claimTo: string;
  /** Whole yen, greater than zero. */
  amount: number;
}

export interface ParsedClaim {
  claimMonth: YearMonth;
  /** Only the entities with something to claim - a row of 0 produces no invoice. */
  lines: ClaimLine[];
  /** The total the sheet itself prints under the table, when it has one. */
  sheetTotal: number | null;
  /** Things the file could not prove, said in words for the screen (e.g. no total to cross-check against). */
  warnings: string[];
  /**
   * Page 2 of every expense invoice of the month (`Expenses paid by HOYA_202610.pdf`) - one page for
   * all the companies, made into each invoice's own by `statementFor`. `null` when the sheet has no
   * A/C table under the claim list (the invoices are then one page, and `warnings` says so).
   */
  statement: Statement | null;
}

/** The month's expenses page as one company's page 2: the same page, with its claim and amount. */
export function statementFor(statement: Statement, line: ClaimLine): Statement {
  return { ...statement, claimTo: line.claimTo, amount: line.amount };
}

/** A sheet that cannot be read says why, in the words the person at the keyboard needs. */
export { SheetReadError as ClaimSheetError };

/** Labels in the company-name column that start the part of the sheet below the claim table - never an entity. */
const BELOW_TABLE_LABELS = new Set(["r3 code", "a/c code"]);
const isBelowTable = (label: string): boolean => BELOW_TABLE_LABELS.has(label.replace(/:$/, "").trim().toLowerCase());

/** The sheet is read this far down; the claim table is at the top of it. */
const SHEET_ROWS = 80;

/**
 * Read the claim table out of the workbook (cached values, see `xlsx-sheet.ts`).
 *
 * The table is found by its heading (`Claim to`, usually column B), not at fixed rows: a row added for a
 * new entity must not be silently skipped. The claim month is found the same way, by its
 * `Claim month` label - it was the fixed cell `C2`, and a row inserted above it would have pointed
 * at whatever number landed there (any number from 2000 to 2099 reads as a month).
 *
 * **Reading goes on past a blank row** - it used to stop at the first empty label, so an empty row
 * between two entities dropped every entity after it, quietly. The table ends at the **unlabelled
 * figure** under it (the sheet's own total) or, failing that, where the part of the sheet below the
 * table begins. A labelled row *below* the total is refused rather than ignored, and so is an
 * amount with no company name beside it. With no total to be found the table is still read, and
 * `warnings` says it could not be cross-checked.
 */
export async function parseClaimSheet(file: ArrayBuffer): Promise<ParsedClaim> {
  const cells = await readSheet(file, CLAIM_SHEET_NAME, SHEET_ROWS);
  const { valueOf, textOf } = cells;

  // Found by their labels, which may have moved with an inserted row or column; the figure is the
  // cell to the right of its label, and the amounts are the column to the right of the company names.
  const [monthLabel] = locateLabels(
    cells,
    (t) => t.replace(/:$/, "").trim().toLowerCase() === "claim month",
    ["B"],
    20,
    'the "Claim month" label'
  );
  const monthRef = refOf(monthLabel.col + 1, monthLabel.row);
  const monthCell = valueOf(monthRef);
  const claimMonth = monthCell && monthCell.kind === "number" ? serialToYearMonth(monthCell.value) : null;
  if (!claimMonth) {
    throw new SheetReadError(`Could not read the Claim month in ${monthRef} as a date (e.g. 2026/10).`);
  }

  const [heading] = locateLabels(cells, (t) => t === "Claim to", ["B"], 40, 'the "Claim to" heading');
  const headerRow = heading.row;
  const labelRef = (row: number): string => refOf(heading.col, row);
  const amountRef = (row: number): string => refOf(heading.col + 1, row);
  const labelOf = (row: number): string => textOf(labelRef(row));
  const numberAt = (row: number): number | null => {
    const v = valueOf(amountRef(row));
    return v && v.kind === "number" ? v.value : null;
  };

  const lines: ClaimLine[] = [];
  let sheetTotal: number | null = null;
  let totalRow = 0;
  let endRow = headerRow;
  for (let r = headerRow + 1; r <= Math.min(headerRow + 40, SHEET_ROWS); r++) {
    const label = labelOf(r);
    if (!label) {
      const figure = numberAt(r);
      if (figure !== null) {
        // An unlabelled figure under the table is the sheet's own total.
        sheetTotal = figure;
        totalRow = r;
        break;
      }
      continue; // an empty row - the table may go on below it
    }
    if (isBelowTable(label)) break;
    endRow = r;
    const amount = valueOf(amountRef(r));
    if (!amount || amount.kind !== "number") {
      throw new SheetReadError(
        `Could not read the amount for ${label} (${amountRef(r)}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`
      );
    }
    const n = amount.value;
    if (!Number.isInteger(n)) {
      throw new SheetReadError(`The amount for ${label} (${amountRef(r)}) is not a whole number (${n}). Round it to whole yen.`);
    }
    if (n < 0) throw new SheetReadError(`The amount for ${label} (${amountRef(r)}) is negative (${n}).`);
    if (n > 0) lines.push({ claimTo: label, amount: n });
  }

  const warnings: string[] = [];
  const renamed = sheetNameWarning(cells, CLAIM_SHEET_NAME);
  if (renamed) warnings.push(renamed);
  if (totalRow) {
    // A company listed below the total would be left out of the invoices without a word.
    // Down to where the part below the table begins - not a fixed few rows, so a company far under a
    // stray subtotal is found too.
    for (let r = totalRow + 1; r <= SHEET_ROWS; r++) {
      const label = labelOf(r);
      if (!label) continue;
      if (isBelowTable(label)) break;
      throw new SheetReadError(
        `${label} (${labelRef(r)}) is below ${amountRef(totalRow)}, a figure with no company name beside it (read as the total). Fill in the company name there, or move the row above it.`
      );
    }
  } else {
    warnings.push(
      `${CLAIM_SHEET_NAME}: no total was found under the Claim to table (after row ${endRow}), so the amounts are not cross-checked. Make sure every company is listed.`
    );
  }
  const statement = readExpenseStatement(cells, {
    heading: textOf(refOf(monthLabel.col, monthLabel.row - 1)) || "Expenses paid by HOYA MD on behalf of overseas group companies",
    claimMonth,
    claimTo: heading,
    endRow,
    sheetTotal,
  });
  if (!statement) warnings.push(`${CLAIM_SHEET_NAME}: no "A/C Code" table under the claim list, so the invoices have no second page.`);
  else for (const line of lines) assertIssuable(statementFor(statement, line), line.amount, line.claimTo, CLAIM_SHEET_NAME, (m) => new SheetReadError(m));
  return { claimMonth, lines, sheetTotal, warnings, statement };
}

/**
 * **The A/C table under the claim list** - page 2 of the expense invoices.
 *
 * Under the "Claim to" list: a heading row `A/C Code | A/C Name (EN) | A/C Name (JP) | <company totals>`,
 * the company codes in the row above it and the cost centres above that, one column per company, up
 * to the `sum` column. Printed **as the Excel prints it**: only the A/C rows with an amount (the
 * sheet's filter on its `sum` column), and without a column Excel hides (`ITC from HMSJ`) - unless
 * that column holds an amount, which is then shown rather than lost.
 */
function readExpenseStatement(
  cells: SheetCells,
  at: { heading: string; claimMonth: YearMonth; claimTo: CellPos; endRow: number; sheetTotal: number | null }
): Statement | null {
  const { valueOf, textOf } = cells;
  const where = CLAIM_SHEET_NAME;
  const raw = (col: number, row: number) => {
    const v = valueOf(refOf(col, row));
    return v && v.kind === "string" ? v.value.trim() : "";
  };
  const num = (col: number, row: number): number | null => {
    const v = valueOf(refOf(col, row));
    return v && v.kind === "number" ? v.value : null;
  };

  // The claim list as printed: every company, 0 or not, with its ※ mark and the note beside it.
  const summary: StatementSummaryLine[] = [];
  for (let r = at.claimTo.row + 1; r <= at.endRow; r++) {
    const label = raw(at.claimTo.col, r);
    const amount = num(at.claimTo.col + 1, r);
    if (!label || amount === null) continue;
    summary.push({ label, amount, note: raw(at.claimTo.col + 2, r), base: null, ratio: null });
  }

  const head = cells.findText((t) => t.toLowerCase() === "a/c code", SHEET_ROWS).find((p) => p.col === at.claimTo.col && p.row > at.endRow);
  if (!head) return null;
  const codeCol = head.col;
  const namesRow = head.row - 1;
  const costRow = head.row - 2;

  // Company columns: from the one after A/C Name (JP) up to the "sum" column.
  const companyCols: number[] = [];
  for (let c = codeCol + 3; c < codeCol + 3 + STATEMENT_LIMITS.columns; c++) {
    const name = textOf(refOf(c, namesRow));
    if (!name || name.toLowerCase() === "sum") break;
    companyCols.push(c);
  }
  if (companyCols.length === 0) throw new SheetReadError(`${where}: no company names in row ${namesRow} over the A/C table.`);

  type Raw = { code: string; nameEn: string; nameJp: string; amounts: number[] };
  const all: Raw[] = [];
  for (let r = head.row + 1; r <= SHEET_ROWS; r++) {
    const code = raw(codeCol, r) || (num(codeCol, r) !== null ? String(num(codeCol, r)) : "");
    if (!code) continue;
    const amounts = companyCols.map((c) => num(c, r) ?? 0);
    if (amounts.some((a) => !Number.isInteger(a))) throw new SheetReadError(`${where}: the amounts for A/C ${code} (row ${r}) are not whole yen.`);
    all.push({ code, nameEn: textOf(refOf(codeCol + 1, r)), nameJp: textOf(refOf(codeCol + 2, r)), amounts });
  }

  // Each company's column must add up to the total in the heading row.
  const heads = companyCols.map((c) => num(c, head.row));
  companyCols.forEach((c, i) => {
    const s = all.reduce((a, row) => a + row.amounts[i], 0);
    if (heads[i] !== null && heads[i] !== s) {
      throw new SheetReadError(`${where}: the ${textOf(refOf(c, namesRow))} column adds up to ${formatAmount(s, 0)}, but its total (${refOf(c, head.row)}) is ${formatAmount(heads[i], 0)}.`);
    }
  });

  // A column Excel hides is left out when it is empty, as the printout leaves it out.
  const keep = companyCols.map((c, i) => !cells.isColumnHidden(c) || all.some((row) => row.amounts[i] !== 0));
  const columns: StatementColumn[] = companyCols
    .map((c) => ({ name: textOf(refOf(c, namesRow)), code: textOf(refOf(c, costRow)) }))
    .filter((_, i) => keep[i]);
  const rows: StatementRow[] = all
    .filter((row) => row.amounts.some((a) => a !== 0))
    .map((row) => {
      const amounts = row.amounts.filter((_, i) => keep[i]);
      return { code: row.code, nameEn: row.nameEn, nameJp: row.nameJp, mark: "", amounts, total: amounts.reduce((a, b) => a + b, 0) };
    });
  const columnTotals = columns.map((_, i) => rows.reduce((a, row) => a + row.amounts[i], 0));
  const total = columnTotals.reduce((a, b) => a + b, 0);

  const listed = summary.reduce((a, l) => a + l.amount, 0);
  if (listed !== total) {
    throw new SheetReadError(`${where}: the claim list adds up to ¥${formatAmount(listed, 0)}, but the A/C table to ¥${formatAmount(total, 0)}.`);
  }
  if (rows.length === 0) return null;

  return {
    layout: "companies",
    heading: at.heading,
    claimMonth: `${at.claimMonth.year}/${String(at.claimMonth.month).padStart(2, "0")}`,
    claimTo: "",
    amount: 0,
    factor: null,
    spanLabel: "",
    columns,
    rows,
    columnTotals,
    total,
    footnote: "",
    summary,
    allocationBasis: "",
  };
}
