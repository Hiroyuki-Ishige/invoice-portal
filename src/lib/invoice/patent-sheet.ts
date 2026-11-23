import type { YearMonth } from "./dates";
import { SheetReadError, readSheet, serialToYearMonth, type SheetCells } from "./xlsx-sheet";

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

function wholeYen(cells: SheetCells, ref: string, what: string): number {
  const v = cells.valueOf(ref);
  if (!v || v.kind !== "number") {
    throw new SheetReadError(
      `Could not read ${what} (${ref}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`
    );
  }
  if (!Number.isInteger(v.value)) throw new SheetReadError(`${what} (${ref}) is not a whole number (${v.value}). Round it to whole yen.`);
  if (v.value < 0) throw new SheetReadError(`${what} (${ref}) is negative (${v.value}).`);
  return v.value;
}

/**
 * The row of a "Claim year/month:" label, searched for in the top of the sheet.
 *
 * It used to be one fixed cell (`C2` / `D2`), and a row inserted above it would have pointed at
 * whatever number landed there - and any number between 2000 and 2099 reads as a month. The label
 * moves with the row; only its column is assumed.
 */
function findClaimMonthRef(cells: SheetCells, sheet: string, cols: { label: string; value: string }): string {
  for (let r = 1; r <= 12; r++) {
    const label = cells.textOf(`${cols.label}${r}`).replace(/:$/, "").trim().toLowerCase();
    if (label === "claim year/month") return `${cols.value}${r}`;
  }
  throw new SheetReadError(`Could not find "Claim year/month:" in column ${cols.label} of ${sheet}.`);
}

function monthOf(cells: SheetCells, ref: string, sheet: string): YearMonth {
  const v = cells.valueOf(ref);
  const month = v && v.kind === "number" ? serialToYearMonth(v.value) : null;
  if (!month) throw new SheetReadError(`Could not read the Claim month in ${ref} of ${sheet} as a date (e.g. 2026/10).`);
  return month;
}

/** How far down `readSheet` was asked to read - the heading and the Total row must be inside it. */
const SHEET_ROWS = 40;

/**
 * **Patent sheet block**: a "Claim amount:" heading in `headingCol`, then one row per entity -
 * the label in `labelCol`, the amount beside it - down to the row labelled `Total`.
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
  cols: { heading: string; label: string; amount: string },
  kind: PatentRdKind
): { lines: PatentRdLine[]; check: PatentRdCheck | null; warning: string | null } {
  let headingRow = 0;
  for (let r = 1; r <= 30; r++) {
    if (cells.textOf(`${cols.heading}${r}`) === "Claim amount:") {
      headingRow = r;
      break;
    }
  }
  if (!headingRow) throw new SheetReadError(`Could not find "Claim amount:" in column ${cols.heading} of ${sheet}.`);

  let totalRow = 0;
  for (let r = headingRow; r <= SHEET_ROWS; r++) {
    if (cells.textOf(`${cols.label}${r}`) === "Total") {
      totalRow = r;
      break;
    }
  }

  const lines: PatentRdLine[] = [];
  const addRow = (r: number) => {
    const claimTo = cells.textOf(`${cols.label}${r}`);
    const amount = wholeYen(cells, `${cols.amount}${r}`, `the amount for ${claimTo}`);
    if (amount > 0) lines.push({ kind, claimTo, amount, description: PATENT_RD_KINDS[kind].description });
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
      return { lines, check: { kind, sheetTotal: sheetTotal.value, sum: lines.reduce((a, l) => a + l.amount, 0) }, warning: null };
    }
    return {
      lines,
      check: null,
      warning: `${sheet}: the Total in ${cols.amount}${totalRow} could not be read as a number, so the ${PATENT_RD_KINDS[kind].label} rows are not cross-checked.`,
    };
  }

  for (let r = headingRow; r <= SHEET_ROWS && cells.textOf(`${cols.label}${r}`); r++) addRow(r);
  return {
    lines,
    check: null,
    warning: `${sheet}: no "Total" row was found in column ${cols.label}, so the ${PATENT_RD_KINDS[kind].label} rows are not cross-checked. Make sure every company is listed.`,
  };
}

/**
 * **R&D sheet block**: one entity and one amount - "Claim to:" and "Claim amount:" in
 * `labelCol`, their values in `valueCol`.
 */
function readSingleBlock(
  cells: SheetCells,
  sheet: string,
  cols: { label: string; value: string },
  kind: PatentRdKind
): PatentRdLine[] {
  let toRow = 0;
  let amountRow = 0;
  for (let r = 1; r <= 12; r++) {
    const text = cells.textOf(`${cols.label}${r}`);
    if (text === "Claim to:") toRow = r;
    if (text === "Claim amount:") amountRow = r;
  }
  if (!toRow || !amountRow) throw new SheetReadError(`Could not find "Claim to:" and "Claim amount:" in column ${cols.label} of ${sheet}.`);

  const claimTo = cells.textOf(`${cols.value}${toRow}`);
  if (!claimTo) throw new SheetReadError(`${sheet}: ${cols.value}${toRow} has no company to claim from.`);
  const amount = wholeYen(cells, `${cols.value}${amountRow}`, `the amount for ${claimTo} (${PATENT_RD_KINDS[kind].label})`);
  return amount > 0 ? [{ kind, claimTo, amount, description: PATENT_RD_KINDS[kind].description }] : [];
}

/**
 * Read both claim sheets of the Patent & R&D workbook (cached values, see `xlsx-sheet.ts`).
 *
 * Eight documents come out of a typical month, in this order: R&D and R&D (New Business) for
 * the one company, then Patent for each entity, then Patent (New Business) for each. The two
 * sheets must name the same claim month, or one of them was not updated.
 */
export async function parsePatentRdWorkbook(file: ArrayBuffer): Promise<ParsedPatentRd> {
  const rd = await readSheet(file, RD_SHEET_NAME, SHEET_ROWS);
  const patent = await readSheet(file, PATENT_SHEET_NAME, SHEET_ROWS);

  const rdMonth = monthOf(rd, findClaimMonthRef(rd, RD_SHEET_NAME, { label: "C", value: "D" }), RD_SHEET_NAME);
  const patentMonth = monthOf(patent, findClaimMonthRef(patent, PATENT_SHEET_NAME, { label: "B", value: "C" }), PATENT_SHEET_NAME);
  if (rdMonth.year !== patentMonth.year || rdMonth.month !== patentMonth.month) {
    throw new SheetReadError(
      `The two sheets are for different months (${RD_SHEET_NAME}: ${rdMonth.year}/${rdMonth.month}, ${PATENT_SHEET_NAME}: ${patentMonth.year}/${patentMonth.month}). Update the Claim year/month in both.`
    );
  }

  const patentMain = readEntityBlock(patent, PATENT_SHEET_NAME, { heading: "B", label: "C", amount: "D" }, "patent");
  const patentNb = readEntityBlock(patent, PATENT_SHEET_NAME, { heading: "I", label: "J", amount: "K" }, "patent-nb");

  return {
    claimMonth: patentMonth,
    lines: [
      ...readSingleBlock(rd, RD_SHEET_NAME, { label: "C", value: "D" }, "rd"),
      ...readSingleBlock(rd, RD_SHEET_NAME, { label: "R", value: "S" }, "rd-nb"),
      ...patentMain.lines,
      ...patentNb.lines,
    ],
    checks: [patentMain.check, patentNb.check].filter((c): c is PatentRdCheck => c !== null),
    warnings: [patentMain.warning, patentNb.warning].filter((w): w is string => w !== null),
  };
}
