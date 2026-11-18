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
}

/** A sheet that cannot be read says why, in the words the person at the keyboard needs. */
export { SheetReadError as ClaimSheetError };

/**
 * Read the claim table out of the workbook (cached values, see `xlsx-sheet.ts`).
 *
 * The table is found by its heading (`Claim to`, column B) and read down to the first empty
 * label, rather than at fixed rows: a row added for a new entity must not be silently skipped.
 */
export async function parseClaimSheet(file: ArrayBuffer): Promise<ParsedClaim> {
  const { valueOf, textOf } = await readSheet(file, CLAIM_SHEET_NAME, 80);
  const labelOf = (row: number): string => textOf(`B${row}`);

  const monthCell = valueOf("C2");
  const claimMonth = monthCell && monthCell.kind === "number" ? serialToYearMonth(monthCell.value) : null;
  if (!claimMonth) {
    throw new SheetReadError("Could not read the Claim month in C2 as a date (e.g. 2026/10).");
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
  let r = headerRow + 1;
  for (; labelOf(r); r++) {
    const label = labelOf(r);
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

  const total = valueOf(`C${r}`);
  return { claimMonth, lines, sheetTotal: total && total.kind === "number" ? total.value : null };
}
