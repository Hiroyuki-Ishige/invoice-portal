import { formatAmount } from "../utils/format";
import type { YearMonth } from "./dates";
import { assertIssuable, type Statement, type StatementRow } from "./statement-record";
import { SheetNotFoundError, SheetReadError, locateLabels, readSheet, refOf, serialToYearMonth, sheetNameWarning } from "./xlsx-sheet";

/**
 * **R&D reimbursement** - sheet `請求_立替研究` of the same workbook as the expenses
 * (`立替研究・出向者立替費用計算(FY….xlsm)`): the R&D supplies, repairs and outsourced work HOYA MD paid
 * for one site (HOMT). It makes **one invoice with a second page**: page 1 the usual invoice for the
 * Claim amount, page 2 the sheet's A/C-code table (HYM1AC2026-185 with `Supplies,Repair,Outsource_2610`).
 */
export const RD_SHEET_NAME = "請求_立替研究";

/** What page 1 prints in its Description column - as on HYM1AC2026-185. */
export const RD_DESCRIPTION = "Monthly fee for delegation of technology development(reimbursement)";

export interface ParsedRdReimbursement {
  claimMonth: YearMonth;
  claimTo: string;
  /** Whole yen, greater than zero - the invoice amount. */
  amount: number;
  statement: Statement;
  warnings: string[];
}

const SHEET_ROWS = 60;
const label = (wanted: string) => (t: string) => t.replace(/:$/, "").trim().toLowerCase() === wanted;

/**
 * Read the sheet, or `null` when the workbook has no such sheet (an older file - the expenses are
 * still issued) or its Claim amount is 0 (nothing to claim this month).
 *
 * Found by its labels, like the other readers: `Claim year/month:`, `Claim to:`, `Claim amount:` in
 * column B with the value beside them, and the table under its `A/C Code` heading, the amounts in
 * the column headed `Total`. The table ends at its own `Total` row. The rows must add up to that
 * total and the total must be the Claim amount, or nothing is issued - page 2 would contradict page 1.
 */
export async function parseRdReimbursementSheet(file: ArrayBuffer): Promise<ParsedRdReimbursement | null> {
  let cells;
  try {
    cells = await readSheet(file, RD_SHEET_NAME, SHEET_ROWS);
  } catch (error) {
    if (error instanceof SheetNotFoundError) return null;
    throw error;
  }
  const { valueOf, textOf } = cells;
  const where = cells.sheetName;
  const warnings: string[] = [];
  const renamed = sheetNameWarning(cells, RD_SHEET_NAME);
  if (renamed) warnings.push(renamed);

  const [monthLabel] = locateLabels(cells, label("claim year/month"), ["B"], 20, 'the "Claim year/month" label');
  const monthRef = refOf(monthLabel.col + 1, monthLabel.row);
  const monthCell = valueOf(monthRef);
  const claimMonth = monthCell && monthCell.kind === "number" ? serialToYearMonth(monthCell.value) : null;
  if (!claimMonth) throw new SheetReadError(`${where}: could not read the Claim year/month in ${monthRef} as a date (e.g. 2026/10).`);

  const [toLabel] = locateLabels(cells, label("claim to"), ["B"], 20, 'the "Claim to" label');
  const claimTo = textOf(refOf(toLabel.col + 1, toLabel.row));
  if (!claimTo) throw new SheetReadError(`${where}: there is no company code beside "Claim to" (${refOf(toLabel.col + 1, toLabel.row)}).`);

  const [amountLabel] = locateLabels(cells, label("claim amount"), ["B"], 20, 'the "Claim amount" label');
  const amountRef = refOf(amountLabel.col + 1, amountLabel.row);
  const amountCell = valueOf(amountRef);
  if (!amountCell || amountCell.kind !== "number") {
    throw new SheetReadError(`${where}: could not read the Claim amount (${amountRef}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`);
  }
  const amount = amountCell.value;
  if (!Number.isInteger(amount)) throw new SheetReadError(`${where}: the Claim amount (${amountRef}) is not a whole number (${amount}).`);
  if (amount < 0) throw new SheetReadError(`${where}: the Claim amount (${amountRef}) is negative. It cannot be invoiced.`);
  if (amount === 0) return null;

  // The heading is the line above "Claim year/month"; a sheet without one gets the usual wording.
  const heading =
    textOf(refOf(monthLabel.col, monthLabel.row - 1)) ||
    `R&D supplies, repair&maintenance, outsourced processing expenses paid by HOYA MD on behalf of ${claimTo}`;

  // The table: "A/C Code" heads the code column; the name columns follow it; "Total" heads the amounts.
  const [codeHead] = locateLabels(cells, (t) => t.toLowerCase() === "a/c code", ["B"], 40, 'the "A/C Code" heading');
  const totalHeads = cells.findText((t) => t.toLowerCase() === "total", SHEET_ROWS).filter((p) => p.row === codeHead.row);
  if (totalHeads.length !== 1) throw new SheetReadError(`${where}: could not find the "Total" column heading in row ${codeHead.row}.`);
  const amountCol = totalHeads[0].col;

  const rows: StatementRow[] = [];
  let sheetTotal: number | null = null;
  for (let r = codeHead.row + 1; r <= SHEET_ROWS; r++) {
    const codeCell = valueOf(refOf(codeHead.col, r));
    if (codeCell?.kind === "string" && codeCell.value.trim().toLowerCase() === "total") {
      const t = valueOf(refOf(amountCol, r));
      sheetTotal = t && t.kind === "number" ? t.value : null;
      break;
    }
    if (!codeCell) continue; // the blank rows under the two-row heading
    const code = codeCell.kind === "number" ? String(codeCell.value) : codeCell.value.trim();
    const figure = valueOf(refOf(amountCol, r));
    if (!figure || figure.kind !== "number" || !Number.isInteger(figure.value) || figure.value < 0) {
      throw new SheetReadError(`${where}: the amount for A/C ${code} (${refOf(amountCol, r)}) is not a whole number of yen, 0 or more.`);
    }
    rows.push({
      code,
      nameEn: textOf(refOf(codeHead.col + 1, r)),
      nameJp: textOf(refOf(codeHead.col + 2, r)),
      mark: "",
      amounts: [],
      total: figure.value,
    });
  }
  if (rows.length === 0) throw new SheetReadError(`${where}: no A/C rows were found under "A/C Code".`);
  if (sheetTotal === null) throw new SheetReadError(`${where}: the table has no "Total" row with a figure.`);

  const sum = rows.reduce((a, row) => a + row.total, 0);
  if (sum !== sheetTotal) {
    throw new SheetReadError(`${where}: the A/C rows add up to ¥${formatAmount(sum, 0)}, but the table's Total is ¥${formatAmount(sheetTotal, 0)}.`);
  }
  if (sheetTotal !== amount) {
    throw new SheetReadError(`${where}: the table's Total (¥${formatAmount(sheetTotal, 0)}) is not the Claim amount (¥${formatAmount(amount, 0)}).`);
  }

  return {
    claimMonth,
    claimTo,
    amount,
    statement: assertIssuable({
      layout: "account",
      heading,
      claimMonth: `${claimMonth.year}/${String(claimMonth.month).padStart(2, "0")}`,
      claimTo,
      amount,
      factor: null,
      spanLabel: "",
      columns: [],
      rows,
      columnTotals: [],
      total: sum,
      footnote: "",
      summary: [],
      allocationBasis: "",
    }, amount, claimTo, where, (m) => new SheetReadError(m)),
    warnings,
  };
}
