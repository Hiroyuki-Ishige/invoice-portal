import { formatAmount } from "../utils/format";
import type { YearMonth } from "./dates";
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
  for (let r = headingRow; r <= SHEET_ROWS; r++) {
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
  const amountLabel = cells
    .findText((t) => t === "Claim amount:", claimToLabel.row + 5)
    .find((p) => p.col === claimToLabel.col && p.row > claimToLabel.row);
  if (!amountLabel) {
    throw new SheetReadError(`${sheet}: no "Claim amount:" under "Claim to:" in ${refOf(claimToLabel.col, claimToLabel.row)}.`);
  }
  const cols = { value: colName(claimToLabel.col + 1) };
  const toRow = claimToLabel.row;
  const amountRow = amountLabel.row;

  const claimTo = cells.textOf(`${cols.value}${toRow}`);
  if (!claimTo) throw new SheetReadError(`${sheet}: ${cols.value}${toRow} has no company to claim from.`);
  const ref = `${cols.value}${amountRow}`;
  const amount = wholeYen(cells, ref, `the amount for ${claimTo} (${PATENT_RD_KINDS[kind].label})`);
  if (amount < 0) return { lines: [], warnings: [negativeWarning(sheet, ref, claimTo, kind, amount)] };
  return { lines: amount > 0 ? [{ kind, claimTo, amount, description: PATENT_RD_KINDS[kind].description }] : [], warnings: [] };
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

  const rdMonth = monthOf(rd, findClaimMonthRef(rd, "C"), RD_SHEET_NAME);
  const patentMonth = monthOf(patent, findClaimMonthRef(patent, "B"), PATENT_SHEET_NAME);
  if (rdMonth.year !== patentMonth.year || rdMonth.month !== patentMonth.month) {
    throw new SheetReadError(
      `The two sheets are for different months (${RD_SHEET_NAME}: ${rdMonth.year}/${rdMonth.month}, ${PATENT_SHEET_NAME}: ${patentMonth.year}/${patentMonth.month}). Update the Claim year/month in both.`
    );
  }

  // Two blocks on each sheet, told apart by position: the left one is the main claim, the right one New Business.
  const [patentHeading, patentNbHeading] = locateLabels(patent, (t) => t === "Claim amount:", ["B", "I"], 40, '"Claim amount:" headings');
  const [rdTo, rdNbTo] = locateLabels(rd, (t) => t === "Claim to:", ["C", "R"], 20, '"Claim to:" labels');
  const patentMain = readEntityBlock(patent, PATENT_SHEET_NAME, patentHeading, "patent");
  const patentNb = readEntityBlock(patent, PATENT_SHEET_NAME, patentNbHeading, "patent-nb");
  const rdMain = readSingleBlock(rd, RD_SHEET_NAME, rdTo, "rd");
  const rdNb = readSingleBlock(rd, RD_SHEET_NAME, rdNbTo, "rd-nb");

  return {
    claimMonth: patentMonth,
    lines: [...rdMain.lines, ...rdNb.lines, ...patentMain.lines, ...patentNb.lines],
    checks: [patentMain.check, patentNb.check].filter((c): c is PatentRdCheck => c !== null),
    warnings: [
      ...[sheetNameWarning(rd, RD_SHEET_NAME), sheetNameWarning(patent, PATENT_SHEET_NAME)].filter((w): w is string => w !== null),
      ...rdMain.warnings, ...rdNb.warnings, ...patentMain.warnings, ...patentNb.warnings],
  };
}
