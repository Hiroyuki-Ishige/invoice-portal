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

const colIndex = (letters: string): number => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (index: number): string => {
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** The same cells moved `cols` to the right and `rows` down - columns and rows inserted in front of the table. */
export function shift(cells: Cells, cols: number, rows: number): Cells {
  const out: Cells = {};
  for (const [ref, value] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    out[`${colName(colIndex(m[1]) + cols)}${Number(m[2]) + rows}`] = value;
  }
  return out;
}

/**
 * The two sheets of the Patent & R&D workbook as the readers expect them (`請求_研究` and `請求_特許`),
 * with made-up figures: R&D HOMT, R&D (New Business) HOMT, Patent per entity with its Total, Patent
 * (New Business) per entity with its Total.
 */
export function patentSheets(claim: { year: number; month: number }, f: {
  rd: number;
  rdNb: number;
  patent: Array<[string, number]>;
  patentNb: Array<[string, number]>;
}): { rd: Cells; patent: Cells } {
  const m = month(claim.year, claim.month);
  const rd: Cells = {
    C1: "R&D supplies and outsourced work paid by EXAMPLE",
    C2: "Claim year/month:", D2: m, C3: "Claim to:", D3: "HOMT", C4: "Claim amount:", D4: f.rd,
    R1: "Research and Development Fees(New Business)",
    R2: "Claim year/month:", S2: m, R3: "Claim to:", S3: "HOMT", R4: "Claim amount:", S4: f.rdNb,
  };
  const patent: Cells = { B2: "Claim year/month:", C2: m, B5: "Claim amount:", I5: "Claim amount:" };
  let r = 6;
  for (const [code, amount] of f.patent) { patent[`C${r}`] = code; patent[`D${r}`] = amount; r++; }
  patent[`C${r}`] = "Total";
  patent[`D${r}`] = f.patent.reduce((a, [, n]) => a + n, 0);
  r = 6;
  for (const [code, amount] of f.patentNb) { patent[`J${r}`] = code; patent[`K${r}`] = amount; r++; }
  patent[`J${r}`] = "Total";
  patent[`K${r}`] = f.patentNb.reduce((a, [, n]) => a + n, 0);
  return { rd, patent };
}
