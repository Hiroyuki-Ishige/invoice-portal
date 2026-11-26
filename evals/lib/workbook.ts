/**
 * Make a made-up workbook with ExcelJS. The sheets carry the real sheet names and labels
 * (that is what the readers key on) and invented figures only.
 *
 * Figures are written as plain values, so the file holds them as cached values the way Excel does
 * after a recalculation - which is what `xlsx-sheet.ts` reads.
 */
import ExcelJS from "exceljs";

export type Cells = Record<string, string | number | Date>;

/** The first day of a claim month, which is how the sheets hold `2026/10`. */
export const month = (year: number, m: number): Date => new Date(Date.UTC(year, m - 1, 1));

export async function makeWorkbook(sheets: Record<string, Cells>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, cells] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const [ref, value] of Object.entries(cells)) {
      ws.getCell(ref).value = value;
      if (value instanceof Date) ws.getCell(ref).numFmt = "yyyy/mm";
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer).slice().buffer;
}

/** The `請求_出向者立替費用` sheet: Claim month, then the Claim to table, its total, then the part below. */
export function claimSheet(claim: { year: number; month: number }, rows: Array<[string, number]>, total: number | null): Cells {
  const cells: Cells = {
    B1: "Expenses paid by EXAMPLE on behalf of overseas group companies",
    B2: "Claim month",
    C2: month(claim.year, claim.month),
    B4: "Claim to",
    C4: "Claim amount (JPY)",
  };
  let r = 5;
  for (const [label, amount] of rows) {
    cells[`B${r}`] = label;
    cells[`C${r}`] = amount;
    r++;
  }
  if (total !== null) cells[`C${r}`] = total;
  cells[`B${r + 2}`] = "R3 code";
  return cells;
}
