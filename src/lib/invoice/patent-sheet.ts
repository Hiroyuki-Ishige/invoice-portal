import { formatAmount } from "../utils/format";
import type { YearMonth } from "./dates";
import { assertIssuable, claimFromBase, type Statement, type StatementColumn, type StatementRow, type StatementSummaryLine } from "./statement-record";
import {
  SheetReadError,
  colIndex,
  colName,
  locateLabels,
  readSheet,
  refOf,
  serialToYearMonth,
  sheetNameWarning,
  type CellPos,
  type SheetCells,
} from "./xlsx-sheet";

/** The two sheets the Intellectual Property team keeps in `特許・研究費用計算(FY….xlsm)`. */
export const PATENT_SHEET_NAME = "請求_特許";
export const RD_SHEET_NAME = "請求_研究";

/** What the four kinds of claim print on the invoice, as on the documents issued by hand. */
export const PATENT_RD_KINDS = {
  rd: { description: "Monthly fee for delegation of technology development", label: "R&D" },
  "rd-nb": { description: "Monthly fee for delegation of technology development (New Business)", label: "R&D (New Business)" },
  patent: { description: "Monthly fee for patent administration", label: "Patent" },
  "patent-nb": { description: "Monthly fee for patent administration (New Business)", label: "Patent (New Business)" },
} as const;

export type PatentRdKind = keyof typeof PATENT_RD_KINDS;

export interface PatentRdLine {
  kind: PatentRdKind;
  /** The "Claim to" label: `HOMT`, `HOGV`, `HOGV2`, `HLAO`... */
  claimTo: string;
  /** Whole yen, greater than zero. */
  amount: number;
  /** What the invoice prints in its Description column. */
  description: string;
  /** Page 2 - the R&D department table (`R&D_2610.pdf`). Only the two R&D kinds have one. */
  statement?: Statement;
}

/** A group's own total from the sheet, to check the lines against. */
export interface PatentRdCheck {
  kind: PatentRdKind;
  sheetTotal: number;
  sum: number;
}

export interface ParsedPatentRd {
  claimMonth: YearMonth;
  /** Only claims with something to charge - a 0 produces no invoice. In the order the documents are numbered. */
  lines: PatentRdLine[];
  checks: PatentRdCheck[];
  /** Things the file could not prove, said in words for the screen (e.g. no Total row to cross-check against). */
  warnings: string[];
}

/**
 * A whole-yen amount, **which may be negative**. A negative claim used to refuse the whole workbook,
 * so the other seven documents of the month could not be issued either (reported 2026-11-26: R&D
 * (New Business) for 2026/09 was -403,695). The caller turns a negative into a warning instead.
 */
function wholeYen(cells: SheetCells, ref: string, what: string): number {
  const v = cells.valueOf(ref);
  if (!v || v.kind !== "number") {
    throw new SheetReadError(
      `Could not read ${what} (${ref}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`
    );
  }
  if (!Number.isInteger(v.value)) throw new SheetReadError(`${what} (${ref}) is not a whole number (${v.value}). Round it to whole yen.`);
  return v.value;
}

/** What the screen says about a negative claim: no invoice is made from it, and it is not lost silently. */
function negativeWarning(sheet: string, ref: string, claimTo: string, kind: PatentRdKind, amount: number): string {
  return `${sheet}: the amount for ${claimTo} (${PATENT_RD_KINDS[kind].label}) in ${ref} is negative (${formatAmount(amount, 0)}). No invoice is made for it - settle it outside the portal.`;
}

/**
 * The cell of the claim month: to the right of a "Claim year/month:" label in the top of the sheet.
 *
 * It used to be one fixed cell (`C2` / `D2`), and a row inserted above it would have pointed at
 * whatever number landed there - and any number between 2000 and 2099 reads as a month. The label
 * moves with the row and the column. The R&D sheet has one per block; the one in `usualCol`, else the
 * leftmost, is read (both blocks are for the same month).
 */
function findClaimMonthRef(cells: SheetCells, usualCol: string): string {
  const found = cells.findText((t) => t.replace(/:$/, "").trim().toLowerCase() === "claim year/month", 20);
  const label = found.find((p) => p.col === colIndex(usualCol)) ?? found[0];
  if (!label) throw new SheetReadError(`Could not find "Claim year/month:" in ${cells.sheetName}.`);
  return refOf(label.col + 1, label.row);
}

function monthOf(cells: SheetCells, ref: string, sheet: string): YearMonth {
  const v = cells.valueOf(ref);
  const month = v && v.kind === "number" ? serialToYearMonth(v.value) : null;
  if (!month) throw new SheetReadError(`Could not read the Claim month in ${ref} of ${sheet} as a date (e.g. 2026/10).`);
  return month;
}

/** How far down `readSheet` was asked to read - the heading and the Total row must be inside it. */
const SHEET_ROWS = 60;
/** Both sheets list every A/C code the ledger has under their tables; the Total rows are near row 140. */
const LEDGER_ROWS = 220;

/**
 * **Patent sheet block**: a "Claim amount:" heading (found by `locateLabels`), then one row per
 * entity - the company name in the column right of the heading, the amount right of that - down to
 * the row labelled `Total`.
 * Found by the heading and the Total, not by row number: an entity added to the sheet must not be
 * skipped.
 *
 * **The Total row is looked for first, and every row up to it is read** - a blank row between two
 * entities used to end the block there, and the entities after it were dropped without a word (and
 * with no Total reached, with nothing to cross-check them against). A blank label above an amount
 * is refused rather than guessed at. If there is no Total row at all, the block is read as far as
 * the first blank label and `warning` says that it could not be cross-checked.
 */
function readEntityBlock(
  cells: SheetCells,
  sheet: string,
  heading: CellPos,
  kind: PatentRdKind
): { lines: PatentRdLine[]; check: PatentRdCheck | null; warnings: string[] } {
  // The company names are the column right of the heading, the amounts the one after.
  const cols = { label: colName(heading.col + 1), amount: colName(heading.col + 2) };
  const headingRow = heading.row;

  let totalRow = 0;
  // As far below the heading as the old fixed range reached (rows up to 40 with the heading near row 5),
  // so a block with no Total does not pick up the Total of some other table further down.
  for (let r = headingRow; r <= Math.min(SHEET_ROWS, headingRow + 35); r++) {
    if (cells.textOf(`${cols.label}${r}`) === "Total") {
      totalRow = r;
      break;
    }
  }

  const lines: PatentRdLine[] = [];
  const warnings: string[] = [];
  /** Every amount read, negatives included - what the sheet's own Total adds up. */
  let sum = 0;
  const addRow = (r: number) => {
    const claimTo = cells.textOf(`${cols.label}${r}`);
    const ref = `${cols.amount}${r}`;
    const amount = wholeYen(cells, ref, `the amount for ${claimTo}`);
    sum += amount;
    if (amount > 0) lines.push({ kind, claimTo, amount, description: PATENT_RD_KINDS[kind].description });
    if (amount < 0) warnings.push(negativeWarning(sheet, ref, claimTo, kind, amount));
  };

  if (totalRow) {
    for (let r = headingRow; r < totalRow; r++) {
      if (cells.textOf(`${cols.label}${r}`)) {
        addRow(r);
        continue;
      }
      const stray = cells.valueOf(`${cols.amount}${r}`);
      if (stray && stray.kind === "number" && stray.value !== 0) {
        throw new SheetReadError(`${sheet}: ${cols.amount}${r} has an amount (${stray.value}) but ${cols.label}${r} has no company name.`);
      }
    }
    const sheetTotal = cells.valueOf(`${cols.amount}${totalRow}`);
    if (sheetTotal && sheetTotal.kind === "number") {
      return { lines, check: { kind, sheetTotal: sheetTotal.value, sum }, warnings };
    }
    return {
      lines,
      check: null,
      warnings: [
        ...warnings,
        `${sheet}: the Total in ${cols.amount}${totalRow} could not be read as a number, so the ${PATENT_RD_KINDS[kind].label} rows are not cross-checked.`,
      ],
    };
  }

  for (let r = headingRow; r <= SHEET_ROWS && cells.textOf(`${cols.label}${r}`); r++) addRow(r);
  return {
    lines,
    check: null,
    warnings: [
      ...warnings,
      `${sheet}: no "Total" row was found in column ${cols.label}, so the ${PATENT_RD_KINDS[kind].label} rows are not cross-checked. Make sure every company is listed.`,
    ],
  };
}

/**
 * **R&D sheet block**: one entity and one amount - "Claim to:" (found by `locateLabels`) and the
 * "Claim amount:" under it in the same column, their values in the column to the right.
 */
function readSingleBlock(
  cells: SheetCells,
  sheet: string,
  claimToLabel: CellPos,
  kind: PatentRdKind
): { lines: PatentRdLine[]; warnings: string[] } {
  // In the same column as "Claim to:": the first one under it, else (as the old fixed search over
  // rows 1-12 took it) the last one above it - so a sheet that read before still reads.
  const sameCol = cells
    .findText((t) => t === "Claim amount:", Math.max(12, claimToLabel.row + 12))
    .filter((p) => p.col === claimToLabel.col);
  const amountLabel = sameCol.find((p) => p.row > claimToLabel.row) ?? sameCol.filter((p) => p.row < claimToLabel.row).pop();
  if (!amountLabel) {
    throw new SheetReadError(`${sheet}: no "Claim amount:" in the column of "Claim to:" in ${refOf(claimToLabel.col, claimToLabel.row)}.`);
  }
  const cols = { value: colName(claimToLabel.col + 1) };
  const toRow = claimToLabel.row;
  const amountRow = amountLabel.row;

  const claimTo = cells.textOf(`${cols.value}${toRow}`);
  if (!claimTo) throw new SheetReadError(`${sheet}: ${cols.value}${toRow} has no company to claim from.`);
  const ref = `${cols.value}${amountRow}`;
  const amount = wholeYen(cells, ref, `the amount for ${claimTo} (${PATENT_RD_KINDS[kind].label})`);
  if (amount < 0) return { lines: [], warnings: [negativeWarning(sheet, ref, claimTo, kind, amount)] };
  if (amount === 0) return { lines: [], warnings: [] };
  const statement = readRdStatement(cells, sheet, claimToLabel, { row: amountRow, col: claimToLabel.col }, claimTo, amount, kind);
  const line: PatentRdLine = { kind, claimTo, amount, description: PATENT_RD_KINDS[kind].description };
  if (!statement) {
    return {
      lines: [line],
      warnings: [`${sheet}: no "S4/AC code(No.)" table under the ${PATENT_RD_KINDS[kind].label} block, so its invoice has no second page.`],
    };
  }
  return { lines: [{ ...line, statement: assertIssuable(statement, amount, claimTo, `${sheet} (${PATENT_RD_KINDS[kind].label})`, (m) => new SheetReadError(m)) }], warnings: [] };
}

/** `＝  1.1  ×` -> 1.1 */
function factorOf(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(text.normalize("NFKC"));
  return m ? Number(m[1]) : null;
}

/**
 * **The department table under an R&D block** - page 2 of the invoice (`R&D_2610.pdf`).
 *
 * Found from the block's own "Claim to:" label: the heading is the line above "Claim year/month:",
 * the Claim amount line reads `¥87,302,162 ＝ 1.1 × ¥79,365,602`, and the table starts at
 * `S4/AC code(No.)` in the same column - A/C code, its English and Japanese names, one column per
 * department (name, then cost centre, under the "Expense amount of ..." span) and the `Total` column.
 * It ends at the row labelled `Total`.
 *
 * **Only the rows the sheet prints**: the `印刷用ﾌｨﾙﾀｰ` column says `印刷` or `非表示` for each A/C
 * code, the way the Excel's own print filter does - the ledger lists every code, most of them 0. A
 * hidden row with an amount in it is refused, not dropped: the table would no longer add up.
 */
function readRdStatement(
  cells: SheetCells,
  sheet: string,
  toLabel: CellPos,
  amountLabel: CellPos,
  claimTo: string,
  amount: number,
  kind: PatentRdKind
): Statement | null {
  const what = `${sheet} (${PATENT_RD_KINDS[kind].label})`;
  const text = (col: number, row: number) => cells.textOf(refOf(col, row));
  const num = (col: number, row: number): number | null => {
    const v = cells.valueOf(refOf(col, row));
    return v && v.kind === "number" ? v.value : null;
  };

  const monthLabel = cells
    .findText((t) => t.replace(/:$/, "").trim().toLowerCase() === "claim year/month", 20)
    .find((p) => p.col === toLabel.col);
  const heading = (monthLabel && text(toLabel.col, monthLabel.row - 1)) || PATENT_RD_KINDS[kind].label;
  const monthCell = monthLabel ? num(toLabel.col + 1, monthLabel.row) : null;
  const month = monthCell === null ? null : serialToYearMonth(monthCell);
  if (!month) throw new SheetReadError(`${what}: could not read the Claim year/month beside "Claim to:".`);

  // "＝ 1.1 ×" and the base after it, on the Claim amount line.
  const factor = factorOf(text(amountLabel.col + 2, amountLabel.row));
  const base = num(amountLabel.col + 3, amountLabel.row);

  const head = cells
    .findText((t) => t.toLowerCase().startsWith("s4/ac code"), LEDGER_ROWS)
    .find((p) => p.col === toLabel.col && p.row > amountLabel.row);
  // No table at all: the invoice is still issued, as page 1 alone (the caller says so). A table
  // that is there but does not add up is refused below.
  if (!head) return null;
  const codeCol = head.col;
  const totalHead = cells
    .findText((t) => t.toLowerCase() === "total", LEDGER_ROWS)
    .filter((p) => p.row === head.row && p.col > codeCol + 2)
    .sort((a, b) => a.col - b.col)[0];
  if (!totalHead) throw new SheetReadError(`${what}: no "Total" column heading in row ${head.row}.`);
  const firstDept = codeCol + 3;
  const columns: StatementColumn[] = [];
  for (let c = firstDept; c < totalHead.col; c++) columns.push({ name: text(c, head.row + 1), code: text(c, head.row + 2) });

  // The print filter: a column headed 印刷用ﾌｨﾙﾀｰ (any width of kana) somewhere above the table's rows.
  const filter = cells
    .findText((t) => t.normalize("NFKC").includes("印刷用フィルター"), head.row + 5)
    .sort((a, b) => a.row - b.row)[0];

  const rows: StatementRow[] = [];
  let totalRow = 0;
  for (let r = head.row + 1; r <= LEDGER_ROWS; r++) {
    const label = text(codeCol, r);
    if (label.toLowerCase() === "total") {
      totalRow = r;
      break;
    }
    const codeCell = cells.valueOf(refOf(codeCol, r));
    if (!codeCell || (codeCell.kind === "string" && !codeCell.value.trim())) continue;
    const code = codeCell.kind === "number" ? String(codeCell.value) : codeCell.value.trim();
    const amounts = columns.map((_, i) => num(firstDept + i, r) ?? 0);
    const rowTotal = num(totalHead.col, r);
    if (rowTotal === null || !Number.isInteger(rowTotal) || amounts.some((a) => !Number.isInteger(a))) {
      throw new SheetReadError(`${what}: the amounts for A/C ${code} (row ${r}) are not whole numbers of yen.`);
    }
    if (filter && text(filter.col, r) === "非表示") {
      if (rowTotal !== 0 || amounts.some((a) => a !== 0)) {
        throw new SheetReadError(`${what}: A/C ${code} (row ${r}) has amounts but its print filter says 非表示. Set it to 印刷.`);
      }
      continue;
    }
    rows.push({
      code,
      nameEn: text(codeCol + 1, r),
      nameJp: text(codeCol + 2, r),
      mark: text(codeCol - 1, r),
      amounts,
      total: rowTotal,
    });
  }
  if (!totalRow) throw new SheetReadError(`${what}: the table has no "Total" row.`);
  if (rows.length === 0) throw new SheetReadError(`${what}: no A/C rows to print.`);

  const columnTotals = columns.map((_, i) => num(firstDept + i, totalRow) ?? 0);
  const total = num(totalHead.col, totalRow);
  const rowSum = rows.reduce((a, row) => a + row.total, 0);
  columns.forEach((col, i) => {
    const s = rows.reduce((a, row) => a + row.amounts[i], 0);
    if (s !== columnTotals[i]) {
      throw new SheetReadError(`${what}: the ${col.name || col.code || `column ${i + 1}`} rows add up to ${formatAmount(s, 0)}, but its Total is ${formatAmount(columnTotals[i], 0)}.`);
    }
  });
  if (total !== rowSum) throw new SheetReadError(`${what}: the A/C rows add up to ¥${formatAmount(rowSum, 0)}, but the Total is ¥${formatAmount(total ?? 0, 0)}.`);
  if (base !== null && base !== total) {
    throw new SheetReadError(`${what}: the Claim amount line says ¥${formatAmount(base, 0)}, but the table's Total is ¥${formatAmount(total, 0)}.`);
  }
  const usedFactor = factor !== null && base !== null ? factor : null;
  if (claimFromBase(total, usedFactor) !== amount) {
    throw new SheetReadError(
      `${what}: the Claim amount ¥${formatAmount(amount, 0)} is not ${usedFactor ? `${usedFactor} x ` : ""}the table's Total ¥${formatAmount(total, 0)}.`
    );
  }

  // Read raw: `textOf` takes the ※ mark out, and here it is the point of the line.
  const raw = (row: number) => {
    const v = cells.valueOf(refOf(codeCol, row));
    return v && v.kind === "string" ? v.value.trim() : "";
  };
  const footnote = Array.from({ length: 6 }, (_, i) => raw(totalRow + 1 + i)).find((t) => t.startsWith("※")) ?? "";
  return {
    layout: "department",
    heading,
    claimMonth: `${month.year}/${String(month.month).padStart(2, "0")}`,
    claimTo,
    amount,
    factor: usedFactor,
    spanLabel: text(firstDept, head.row),
    columns,
    rows,
    columnTotals,
    total,
    footnote,
    summary: [],
    allocationBasis: "",
  };
}

/**
 * **The page behind the patent invoices** - one per block of `請求_特許` (Patent, Patent (New
 * Business)), the same page for every company of the block.
 *
 * From the block's "Claim amount:" heading: the heading line and the claim month above it, the claim
 * list beside and under it (`company | amount | ＝ 1.05 × | allocated part | ratio`, down to `Total`),
 * the "Allocation ratio:" line, and the table under `S4/AC code(No.)` - A/C code, its names, and the
 * department column(s) under "Expense amount of ..." (name, then cost centre). Only the rows the
 * print filter (`印刷用ﾌｨﾙﾀｰ`) says `印刷`, as on the R&D sheet. `null` when there is no table.
 */
function readPatentStatement(cells: SheetCells, sheet: string, heading: CellPos, kind: PatentRdKind, month: YearMonth): Statement | null {
  const what = `${sheet} (${PATENT_RD_KINDS[kind].label})`;
  const text = (col: number, row: number) => cells.textOf(refOf(col, row));
  const raw = (col: number, row: number) => {
    const v = cells.valueOf(refOf(col, row));
    return v && v.kind === "string" ? v.value.trim() : "";
  };
  const num = (col: number, row: number): number | null => {
    const v = cells.valueOf(refOf(col, row));
    return v && v.kind === "number" ? v.value : null;
  };
  const labelCol = heading.col + 1;

  // The month is the sheet's (read once, for both blocks); the heading is the line above this block's own label.
  const monthLabel = cells
    .findText((t) => t.replace(/:$/, "").trim().toLowerCase() === "claim year/month", 20)
    .find((p) => p.col === heading.col);
  const title = (monthLabel && text(heading.col, monthLabel.row - 1)) || `${PATENT_RD_KINDS[kind].label} Fees`;

  // The claim list, down to its Total row.
  const summary: StatementSummaryLine[] = [];
  let factor: number | null = null;
  let listEnd = 0;
  for (let r = heading.row; r <= heading.row + 30; r++) {
    const label = raw(labelCol, r);
    if (label === "Total") {
      listEnd = r;
      break;
    }
    if (!label) continue;
    factor ??= factorOf(text(labelCol + 2, r));
    const amount = num(labelCol + 1, r) ?? 0;
    const base = num(labelCol + 3, r);
    if (!Number.isInteger(amount) || (base !== null && !Number.isInteger(base))) {
      throw new SheetReadError(`${what}: the amounts for ${label} (row ${r}) are not whole yen.`);
    }
    summary.push({ label, amount, note: "", base, ratio: num(labelCol + 4, r) });
  }
  if (!listEnd || summary.length === 0) return null;

  const basisLabel = cells
    .findText((t) => t.replace(/:$/, "").trim().toLowerCase() === "allocation ratio", heading.row + 40)
    .find((p) => p.col === heading.col);
  const allocationBasis = basisLabel ? text(heading.col + 1, basisLabel.row) : "";

  const head = cells
    .findText((t) => t.toLowerCase().startsWith("s4/ac code"), LEDGER_ROWS)
    .find((p) => p.col === heading.col && p.row > listEnd);
  if (!head) return null;
  const codeCol = head.col;
  // The block ends where the next block's table, or the Grand Total, starts.
  const limit =
    cells
      .findText((t) => t.toLowerCase().startsWith("s4/ac code") || t.toLowerCase() === "grand total", LEDGER_ROWS)
      .filter((p) => p.row === head.row && p.col > codeCol)
      .map((p) => p.col)
      .sort((a, b) => a - b)[0] ?? codeCol + 12;
  const inBlock = (t: (s: string) => boolean) =>
    cells.findText(t, LEDGER_ROWS).find((p) => p.row === head.row && p.col > codeCol && p.col < limit);
  const jpHead = inBlock((t) => t.toLowerCase().startsWith("ac code(name-j)"));
  const span = inBlock((t) => t.toLowerCase().startsWith("expense amount"));
  if (!span) throw new SheetReadError(`${what}: no "Expense amount of ..." heading in row ${head.row}.`);
  const deptCols: number[] = [];
  for (let c = span.col; c < limit; c++) {
    if (c > span.col && !text(c, head.row + 1) && !text(c, head.row + 2)) break;
    deptCols.push(c);
  }
  const columns: StatementColumn[] = deptCols.map((c) => ({ name: text(c, head.row + 1), code: text(c, head.row + 2) }));

  const filter = cells.findText((t) => t.normalize("NFKC").includes("印刷用フィルター"), head.row + 5)[0];
  const rows: StatementRow[] = [];
  let totalRow = 0;
  for (let r = head.row + 1; r <= LEDGER_ROWS; r++) {
    if (text(codeCol, r).toLowerCase() === "total") {
      totalRow = r;
      break;
    }
    const codeCell = cells.valueOf(refOf(codeCol, r));
    if (!codeCell || (codeCell.kind === "string" && !codeCell.value.trim())) continue;
    const code = codeCell.kind === "number" ? String(codeCell.value) : codeCell.value.trim();
    const amounts = deptCols.map((c) => num(c, r) ?? 0);
    if (amounts.some((a) => !Number.isInteger(a))) throw new SheetReadError(`${what}: the amounts for A/C ${code} (row ${r}) are not whole yen.`);
    if (filter && text(filter.col, r) === "非表示") {
      if (amounts.some((a) => a !== 0)) {
        throw new SheetReadError(`${what}: A/C ${code} (row ${r}) has amounts but its print filter says 非表示. Set it to 印刷.`);
      }
      continue;
    }
    rows.push({
      code,
      nameEn: text(codeCol + 1, r),
      nameJp: jpHead ? text(jpHead.col, r) : "",
      mark: "",
      amounts,
      total: amounts.reduce((a, b) => a + b, 0),
    });
  }
  if (!totalRow) throw new SheetReadError(`${what}: the A/C table has no "Total" row.`);
  if (rows.length === 0) return null;

  const columnTotals = deptCols.map((c) => num(c, totalRow) ?? 0);
  columns.forEach((col, i) => {
    const s = rows.reduce((a, row) => a + row.amounts[i], 0);
    if (s !== columnTotals[i]) {
      throw new SheetReadError(`${what}: the ${col.name || `column ${i + 1}`} rows add up to ${formatAmount(s, 0)}, but its Total is ${formatAmount(columnTotals[i], 0)}.`);
    }
  });
  const total = columnTotals.reduce((a, b) => a + b, 0);
  const parts = summary.reduce((a, l) => a + (l.base ?? 0), 0);
  if (parts !== total) {
    throw new SheetReadError(`${what}: the allocated parts add up to ¥${formatAmount(parts, 0)}, but the A/C table's Total is ¥${formatAmount(total, 0)}.`);
  }
  if (factor === null) throw new SheetReadError(`${what}: could not read the multiplier ("＝ 1.05 ×") on the claim list.`);
  const off = summary.find((l) => Math.abs(l.amount - (l.base ?? 0) * factor!) > 1);
  if (off) throw new SheetReadError(`${what}: the claim for ${off.label} (¥${formatAmount(off.amount, 0)}) is not ${factor} x ¥${formatAmount(off.base ?? 0, 0)}.`);

  return {
    layout: "allocation",
    heading: title,
    claimMonth: `${month.year}/${String(month.month).padStart(2, "0")}`,
    claimTo: "",
    amount: 0,
    factor,
    spanLabel: text(span.col, head.row),
    columns,
    rows,
    columnTotals,
    total,
    footnote: "",
    summary,
    allocationBasis,
  };
}

/** A block's page as one invoice's page 2. */
const withPage = (lines: PatentRdLine[], page: Statement | null): PatentRdLine[] =>
  page
    ? lines.map((l) => ({
        ...l,
        statement: assertIssuable({ ...page, claimTo: l.claimTo, amount: l.amount }, l.amount, l.claimTo, `${PATENT_SHEET_NAME} (${PATENT_RD_KINDS[l.kind].label})`, (m) => new SheetReadError(m)),
      }))
    : lines;

/**
 * Read both claim sheets of the Patent & R&D workbook (cached values, see `xlsx-sheet.ts`).
 *
 * Eight documents come out of a typical month, in this order: R&D and R&D (New Business) for
 * the one company, then Patent for each entity, then Patent (New Business) for each. The two
 * sheets must name the same claim month, or one of them was not updated.
 */
export async function parsePatentRdWorkbook(file: ArrayBuffer): Promise<ParsedPatentRd> {
  const rd = await readSheet(file, RD_SHEET_NAME, LEDGER_ROWS);
  const patent = await readSheet(file, PATENT_SHEET_NAME, LEDGER_ROWS);

  const rdMonth = monthOf(rd, findClaimMonthRef(rd, "C"), RD_SHEET_NAME);
  const patentMonth = monthOf(patent, findClaimMonthRef(patent, "B"), PATENT_SHEET_NAME);
  if (rdMonth.year !== patentMonth.year || rdMonth.month !== patentMonth.month) {
    throw new SheetReadError(
      `The two sheets are for different months (${RD_SHEET_NAME}: ${rdMonth.year}/${rdMonth.month}, ${PATENT_SHEET_NAME}: ${patentMonth.year}/${patentMonth.month}). Update the Claim year/month in both.`
    );
  }

  // Two blocks on each sheet, told apart by position: the left one is the main claim, the right one New Business.
  const [patentHeading, patentNbHeading] = locateLabels(patent, (t) => t === "Claim amount:", ["B", "I"], 40, '"Claim amount:" headings');
  // R&D (New Business) stops being claimed separately from 2026/11 (the accounting team, 2026-11-26), so its
  // block may be deleted from the sheet: a single "Claim to:" is the R&D block alone. Two or more are
  // read by position as before, and anything that cannot be told apart is still refused.
  const rdToLabels = rd.findText((t) => t === "Claim to:", 20);
  const [rdTo, rdNbTo]: [CellPos, CellPos | null] =
    rdToLabels.length === 1
      ? [rdToLabels[0], null]
      : (locateLabels(rd, (t) => t === "Claim to:", ["C", "R"], 20, '"Claim to:" labels') as [CellPos, CellPos]);
  const patentMain = readEntityBlock(patent, PATENT_SHEET_NAME, patentHeading, "patent");
  const patentNb = readEntityBlock(patent, PATENT_SHEET_NAME, patentNbHeading, "patent-nb");
  const patentPage = readPatentStatement(patent, PATENT_SHEET_NAME, patentHeading, "patent", patentMonth);
  const patentNbPage = readPatentStatement(patent, PATENT_SHEET_NAME, patentNbHeading, "patent-nb", patentMonth);
  const noPage = (page: Statement | null, kind: PatentRdKind) =>
    page ? [] : [`${PATENT_SHEET_NAME}: no A/C table under the ${PATENT_RD_KINDS[kind].label} block, so its invoices have no second page.`];
  const rdMain = readSingleBlock(rd, RD_SHEET_NAME, rdTo, "rd");
  const rdNb = rdNbTo
    ? readSingleBlock(rd, RD_SHEET_NAME, rdNbTo, "rd-nb")
    : {
        lines: [],
        warnings: [`${RD_SHEET_NAME}: there is no R&D (New Business) block (only one "Claim to:"), so no R&D (New Business) invoice is made.`],
      };

  return {
    claimMonth: patentMonth,
    lines: [...rdMain.lines, ...rdNb.lines, ...withPage(patentMain.lines, patentPage), ...withPage(patentNb.lines, patentNbPage)],
    checks: [patentMain.check, patentNb.check].filter((c): c is PatentRdCheck => c !== null),
    warnings: [
      ...[sheetNameWarning(rd, RD_SHEET_NAME), sheetNameWarning(patent, PATENT_SHEET_NAME)].filter((w): w is string => w !== null),
      ...rdMain.warnings, ...rdNb.warnings, ...patentMain.warnings, ...patentNb.warnings,
      ...(patentMain.lines.length > 0 ? noPage(patentPage, "patent") : []),
      ...(patentNb.lines.length > 0 ? noPage(patentNbPage, "patent-nb") : []),
    ],
  };
}
