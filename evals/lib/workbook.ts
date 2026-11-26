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

/** A column letter to hide in a sheet, as Excel's own "Hide" does (`<col hidden="1">`). */
export type HiddenColumns = Record<string, string[]>;

export async function makeWorkbook(sheets: Record<string, Cells>, hidden: HiddenColumns = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, cells] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const [ref, value] of Object.entries(cells)) {
      ws.getCell(ref).value = value;
      if (value instanceof Date) ws.getCell(ref).numFmt = "yyyy/mm";
    }
    for (const col of hidden[name] ?? []) ws.getColumn(col).hidden = true;
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer).slice().buffer;
}

/** Made-up A/C codes and names for the detail tables. None of them is a real ledger line. */
const AC = [
  ["7000000001", "G/A sample fee", "管_見本手数料"],
  ["7000000002", "G/A sample travel", "管_見本旅費"],
  ["7000000003", "G/A sample unused", "管_見本未使用"],
] as const;

/** `total` in whole yen over `weights`, the remainder on the last part, so the parts add up exactly. */
export function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.trunc((total * w) / sum));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

export interface ClaimSheetOptions {
  /**
   * The A/C table under the claim list (page 2 of the expense invoices): one column per company, two
   * A/C rows that share each company's amount and one row of zeros. On by default, as every real
   * sheet has it. `false` leaves it out (the invoices are then one page, with a warning).
   */
  table?: boolean;
  /** A column after the companies, e.g. a hidden internal one. Its amounts are 0 unless given. */
  extraColumn?: { name: string; code: string; amounts?: number[] };
}

/**
 * The `請求_出向者立替費用` sheet: Claim month, then the Claim to table, its total, then the A/C table
 * (cost centres, company codes, `A/C Code` heading with each company's total, the A/C rows, `sum`).
 */
export function claimSheet(
  claim: { year: number; month: number },
  rows: Array<[string, number]>,
  total: number | null,
  options: ClaimSheetOptions = {}
): Cells {
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
  const namesRow = r + 2;
  cells[`B${namesRow}`] = "R3 code";
  if (options.table === false) return cells;

  const costRow = namesRow - 1;
  const headRow = namesRow + 1;
  cells[`B${headRow}`] = "A/C Code";
  cells[`C${headRow}`] = "A/C Name (EN)";
  cells[`D${headRow}`] = "A/C Name (JP)";
  const companies = rows.map(([label, amount], i) => ({ name: label.replace(/※/g, ""), code: `ZZ${String(i + 1).padStart(4, "0")}`, parts: [...split(amount, [3, 2]), 0] }));
  if (options.extraColumn) {
    const a = options.extraColumn.amounts ?? [0, 0, 0];
    companies.push({ name: options.extraColumn.name, code: options.extraColumn.code, parts: a });
  }
  companies.forEach((company, i) => {
    const col = colName(colIndex("E") + i);
    cells[`${col}${costRow}`] = company.code;
    cells[`${col}${namesRow}`] = company.name;
    cells[`${col}${headRow}`] = company.parts.reduce((a, b) => a + b, 0);
    AC.forEach((_, k) => (cells[`${col}${headRow + 1 + k}`] = company.parts[k]));
  });
  const sumCol = colName(colIndex("E") + companies.length);
  cells[`${sumCol}${namesRow}`] = "sum";
  AC.forEach(([code, en, jp], k) => {
    const row = headRow + 1 + k;
    cells[`B${row}`] = code;
    cells[`C${row}`] = en;
    cells[`D${row}`] = jp;
    cells[`${sumCol}${row}`] = companies.reduce((a, c) => a + c.parts[k], 0);
  });
  return cells;
}

/**
 * The `請求_立替研究` sheet (R&D reimbursement, page 1 the invoice and page 2 this table): heading,
 * Claim year/month, Claim to, Claim amount, then the A/C table and its Total.
 */
export function rdReimbursementSheet(
  claim: { year: number; month: number },
  claimTo: string,
  rows: Array<[string, string, string, number]>,
  claimAmount: number,
  tableTotal = rows.reduce((a, [, , , n]) => a + n, 0)
): Cells {
  const cells: Cells = {
    B1: `R&D sample supplies paid by EXAMPLE on behalf of ${claimTo}`,
    B2: "Claim year/month:",
    C2: month(claim.year, claim.month),
    B3: "Claim to:",
    C3: claimTo,
    B4: "Claim amount:",
    C4: claimAmount,
    D4: " (Details as below)",
    B6: "R3 code",
    E6: "Unit:JPY",
    B7: "A/C Code",
    C7: "A/C Name (EN)",
    D7: "A/C Name (JP)",
    E7: "Total",
  };
  rows.forEach(([code, en, jp, amount], i) => {
    cells[`B${10 + i}`] = code;
    cells[`C${10 + i}`] = en;
    cells[`D${10 + i}`] = jp;
    cells[`E${10 + i}`] = amount;
  });
  cells[`B${10 + rows.length}`] = "Total";
  cells[`E${10 + rows.length}`] = tableTotal;
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
 * with made-up figures and the tables every real sheet has under its claims:
 *
 * - `請求_研究`: R&D HOMT (block at C) and R&D (New Business) HOMT (block at R). Under each, the
 *   department table (two made-up departments, three A/C rows of which the middle one is 0 and marked
 *   `非表示` in the print filter, the Total row). With `rdFactor`, the Claim amount is `factor x` the
 *   table's total (`＝ 1.1 ×` and the base beside it), as on the real sheet; without, they are equal.
 * - `請求_特許`: Patent per entity and Patent (New Business) per entity, each with its Total and, as on
 *   the real sheet, `＝ 1.05 ×`, the allocated part (the claim / 1.05, rounded) and the ratio; then
 *   the A/C table of one made-up department whose total is the sum of the parts.
 */
export function patentSheets(claim: { year: number; month: number }, f: {
  rd: number;
  rdNb: number;
  patent: Array<[string, number]>;
  patentNb: Array<[string, number]>;
  /** The multiplier on the R&D sheet (1.1 on the real one); `null` or left out for none. */
  rdFactor?: number | null;
}): { rd: Cells; patent: Cells } {
  const m = month(claim.year, claim.month);
  const label = `Expense amount of ${claim.year}/${String(claim.month).padStart(2, "0")}`;
  const rd: Cells = {
    C1: "R&D supplies and outsourced work paid by EXAMPLE",
    C2: "Claim year/month:", D2: m, C3: "Claim to:", D3: "HOMT", C4: "Claim amount:", D4: f.rd,
    R1: "Research and Development Fees(New Business)",
    R2: "Claim year/month:", S2: m, R3: "Claim to:", S3: "HOMT", R4: "Claim amount:", S4: f.rdNb,
    Y9: "印刷用ﾌｨﾙﾀｰ",
  };
  // One department table per R&D block: code | EN | JP | dept 1 | dept 2 | Total.
  const rdTable = (codeCol: string, amount: number, nb: boolean) => {
    const c = colIndex(codeCol);
    const at = (offset: number, row: number) => `${colName(c + offset)}${row}`;
    const base = f.rdFactor ? Math.round(amount / f.rdFactor) : amount;
    if (f.rdFactor) {
      rd[at(2, 4)] = `＝  ${f.rdFactor}  ×`;
      rd[at(3, 4)] = base;
      rd[at(4, 4)] = " (Details as below)";
    }
    rd[at(0, 7)] = "S4/AC code(No.)";
    rd[at(1, 7)] = "AC code(Name-E)";
    rd[at(2, 7)] = "AC code(Name-J)";
    rd[at(3, 7)] = label;
    rd[at(5, 7)] = "Total";
    rd[at(3, 8)] = nb ? "Sample New Business" : "Sample Lab A";
    rd[at(4, 8)] = nb ? "" : "Sample Lab B";
    rd[at(3, 9)] = nb ? "ZZR0028" : "ZZR0020";
    rd[at(4, 9)] = nb ? "" : "ZZR0023";
    const [a1, a2, b1, b2] = split(base, [4, 2, 3, 1]);
    const rows: Array<[string, string, string, number, number]> = [
      ["6000000001", "Sample salary", "見本_給料", a1, a2],
      ["6000000002", "Sample unused", "見本_未使用", 0, 0],
      ["6000000003", "Sample fee", "見本_手数料", b1, b2],
    ];
    rows.forEach(([code, en, jp, x, y], i) => {
      const row = 10 + i;
      rd[at(0, row)] = code;
      rd[at(1, row)] = en;
      rd[at(2, row)] = jp;
      rd[at(3, row)] = x;
      rd[at(4, row)] = y;
      rd[at(5, row)] = x + y;
    });
    rd[at(0, 13)] = "Total";
    rd[at(3, 13)] = a1 + b1;
    rd[at(4, 13)] = a2 + b2;
    rd[at(5, 13)] = base;
  };
  rdTable("C", f.rd, false);
  rdTable("R", f.rdNb, true);
  ["印刷", "非表示", "印刷", "印刷"].forEach((v, i) => (rd[`Y${10 + i}`] = v));

  const patent: Cells = { B2: "Claim year/month:", C2: m, B5: "Claim amount:", I5: "Claim amount:" };
  const headRow = 6 + Math.max(f.patent.length, f.patentNb.length) + 4;
  // One block: the claim list (label | amount | ＝ 1.05 × | part | ratio) and its table.
  const block = (codeCol: string, list: Array<[string, number]>, dept: [string, string]) => {
    const c = colIndex(codeCol);
    const at = (offset: number, row: number) => `${colName(c + offset)}${row}`;
    const parts = list.map(([, amount]) => Math.round(amount / 1.05));
    const partSum = parts.reduce((a, b) => a + b, 0);
    let r = 6;
    list.forEach(([code, amount], i) => {
      patent[at(1, r)] = code;
      patent[at(2, r)] = amount;
      patent[at(3, r)] = "＝  1.05  ×";
      patent[at(4, r)] = parts[i];
      patent[at(5, r)] = partSum === 0 ? 0 : Math.round((parts[i] / partSum) * 1000) / 1000;
      r++;
    });
    patent[at(1, r)] = "Total";
    patent[at(2, r)] = list.reduce((a, [, n]) => a + n, 0);
    patent[at(4, r)] = partSum;
    patent[at(0, r + 2)] = "Allocation ratio:";
    patent[at(1, r + 2)] = "Based on sample shipping quantity";
    patent[at(0, headRow)] = "S4/AC code(No.)";
    patent[at(1, headRow)] = "AC code(Name-E)";
    patent[at(3, headRow)] = "AC code(Name-J)";
    patent[at(5, headRow)] = label;
    patent[at(5, headRow + 1)] = dept[0];
    patent[at(5, headRow + 2)] = dept[1];
    const [x, y] = split(partSum, [7, 3]);
    const rows: Array<[string, string, string, number]> = [
      ["6000000001", "Sample salary", "見本_給料", x],
      ["6000000002", "Sample unused", "見本_未使用", 0],
      ["6000000003", "Sample patent fees", "見本_特許", y],
    ];
    rows.forEach(([code, en, jp, n], i) => {
      const row = headRow + 3 + i;
      patent[at(0, row)] = code;
      patent[at(1, row)] = en;
      patent[at(3, row)] = jp;
      patent[at(5, row)] = n;
    });
    patent[at(0, headRow + 6)] = "Total";
    patent[at(5, headRow + 6)] = partSum;
  };
  block("B", f.patent, ["Sample IP team", "ZZG0014"]);
  block("I", f.patentNb, ["Sample New Business", "ZZG0012"]);
  patent[`O${headRow}`] = "Grand Total";
  patent[`P${headRow + 2}`] = "印刷用ﾌｨﾙﾀｰ";
  ["印刷", "非表示", "印刷", "印刷"].forEach((v, i) => (patent[`P${headRow + 3 + i}`] = v));
  return { rd, patent };
}
