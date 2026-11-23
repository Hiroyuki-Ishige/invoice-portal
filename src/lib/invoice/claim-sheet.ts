import type { YearMonth } from "./dates";
import { SheetReadError, readSheet, serialToYearMonth } from "./xlsx-sheet";

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
}

/** A sheet that cannot be read says why, in the words the person at the keyboard needs. */
export { SheetReadError as ClaimSheetError };

/** Labels in column B that start the part of the sheet below the claim table - never an entity. */
const BELOW_TABLE_LABELS = new Set(["r3 code", "a/c code"]);
const isBelowTable = (label: string): boolean => BELOW_TABLE_LABELS.has(label.replace(/:$/, "").trim().toLowerCase());

/** The sheet is read this far down; the claim table is at the top of it. */
const SHEET_ROWS = 80;

/**
 * Read the claim table out of the workbook (cached values, see `xlsx-sheet.ts`).
 *
 * The table is found by its heading (`Claim to`, column B), not at fixed rows: a row added for a
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
  const { valueOf, textOf } = await readSheet(file, CLAIM_SHEET_NAME, SHEET_ROWS);
  const labelOf = (row: number): string => textOf(`B${row}`);
  const numberAt = (row: number): number | null => {
    const v = valueOf(`C${row}`);
    return v && v.kind === "number" ? v.value : null;
  };

  let monthRef = "";
  for (let r = 1; r <= 12; r++) {
    if (labelOf(r).replace(/:$/, "").trim().toLowerCase() === "claim month") {
      monthRef = `C${r}`;
      break;
    }
  }
  if (!monthRef) throw new SheetReadError('Could not find the "Claim month" label in column B.');
  const monthCell = valueOf(monthRef);
  const claimMonth = monthCell && monthCell.kind === "number" ? serialToYearMonth(monthCell.value) : null;
  if (!claimMonth) {
    throw new SheetReadError(`Could not read the Claim month in ${monthRef} as a date (e.g. 2026/10).`);
  }

  let headerRow = 0;
  for (let r = 1; r <= 40; r++) {
    if (labelOf(r) === "Claim to") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new SheetReadError('Could not find the "Claim to" heading in column B.');

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
    const amount = valueOf(`C${r}`);
    if (!amount || amount.kind !== "number") {
      throw new SheetReadError(
        `Could not read the amount for ${label} (C${r}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`
      );
    }
    const n = amount.value;
    if (!Number.isInteger(n)) {
      throw new SheetReadError(`The amount for ${label} (C${r}) is not a whole number (${n}). Round it to whole yen.`);
    }
    if (n < 0) throw new SheetReadError(`The amount for ${label} (C${r}) is negative (${n}).`);
    if (n > 0) lines.push({ claimTo: label, amount: n });
  }

  const warnings: string[] = [];
  if (totalRow) {
    // A company listed below the total would be left out of the invoices without a word.
    // Down to where the part below the table begins - not a fixed few rows, so a company far under a
    // stray subtotal is found too.
    for (let r = totalRow + 1; r <= SHEET_ROWS; r++) {
      const label = labelOf(r);
      if (!label) continue;
      if (isBelowTable(label)) break;
      throw new SheetReadError(
        `${label} (B${r}) is below C${totalRow}, a figure with no company name beside it (read as the total). Fill in the company name there, or move the row above it.`
      );
    }
  } else {
    warnings.push(
      `${CLAIM_SHEET_NAME}: no total was found under the Claim to table (after row ${endRow}), so the amounts are not cross-checked. Make sure every company is listed.`
    );
  }
  return { claimMonth, lines, sheetTotal, warnings };
}
