import type { YearMonth } from "./dates";

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
export class ClaimSheetError extends Error {}

type CellValue = { kind: "number"; value: number } | { kind: "string"; value: string };

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

/** The text of one `<si>` - the runs of a rich-text string joined, the furigana left out. */
function sharedStringText(si: string): string {
  const withoutPhonetic = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const t of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += decodeXml(t[1]);
  return out;
}

/** Excel's day count (1900 system) as a year and month. Only dates from 2000 on make sense here. */
function serialToYearMonth(serial: number): YearMonth | null {
  if (!Number.isFinite(serial) || serial < 36526 || serial > 73050) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Read the claim table out of the workbook.
 *
 * **The cached values are read straight from the file's XML**, not through exceljs. Every
 * figure on this sheet is a formula, and Excel stores what it last calculated beside each one
 * (`<f>G14</f><v>0</v>`). exceljs hands the result back for every figure except a zero - a
 * formula that calculated to 0 comes back with no result at all, indistinguishable from a
 * formula that was never calculated - so HOGV2, HOMT and HOMS (all 0 this month) could not be
 * read. A figure that cannot be read must not be taken as 0 (rule 6), and a figure that *is* 0
 * must not be refused.
 *
 * The table is found by its heading (`Claim to`, column B) and read down to the first empty
 * label, rather than at fixed rows: a row added for a new entity must not be silently skipped.
 */
export async function parseClaimSheet(file: ArrayBuffer): Promise<ParsedClaim> {
  // Loaded on demand: a workbook of this size is the reason for a loading state, not a bundle.
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ClaimSheetError("Could not read this as an Excel file (choose an .xlsx or .xlsm).");
  }
  const read = async (path: string): Promise<string | null> => {
    const entry = zip.file(path);
    return entry ? entry.async("string") : null;
  };

  // The sheet's file is found by name through the workbook and its relationships.
  const workbookXml = await read("xl/workbook.xml");
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new ClaimSheetError("The Excel file is not in the expected format (workbook.xml not found).");
  }
  let relId: string | null = null;
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    if (attr(m[0], "name") === CLAIM_SHEET_NAME) relId = attr(m[0], "r:id");
  }
  if (!relId) throw new ClaimSheetError(`Sheet "${CLAIM_SHEET_NAME}" not found.`);

  let target: string | null = null;
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (attr(m[0], "Id") === relId) target = attr(m[0], "Target");
  }
  if (!target) throw new ClaimSheetError(`Could not locate the sheet "${CLAIM_SHEET_NAME}" in the file.`);
  const sheetXml = await read(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!sheetXml) throw new ClaimSheetError(`Could not read the contents of the sheet "${CLAIM_SHEET_NAME}".`);

  // Columns B and C are all that matters: labels and amounts, and C2 for the month.
  const cells = new Map<string, { t: string | null; v: string | null }>();
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], "r");
    if (!ref || !/^[BC]\d+$/.test(ref)) continue;
    const inner = m[2] ?? "";
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const inline = /<is>([\s\S]*?)<\/is>/.exec(inner);
    cells.set(ref, {
      t: attr(m[1], "t"),
      v: inline ? sharedStringText(inline[1]) : v ? decodeXml(v[1]) : null,
    });
  }

  // Shared strings are looked up only for the cells that point at one.
  const wanted = new Set<number>();
  for (const c of cells.values()) if (c.t === "s" && c.v !== null) wanted.add(Number(c.v));
  const strings = new Map<number, string>();
  if (wanted.size > 0) {
    const sst = await read("xl/sharedStrings.xml");
    if (sst) {
      let i = 0;
      for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
        if (wanted.has(i)) strings.set(i, sharedStringText(si[1] ?? ""));
        i++;
        if (strings.size === wanted.size) break;
      }
    }
  }

  const valueOf = (ref: string): CellValue | null => {
    const c = cells.get(ref);
    if (!c || c.v === null) return null;
    if (c.t === "s") return { kind: "string", value: strings.get(Number(c.v)) ?? "" };
    if (c.t === "str" || c.t === "inlineStr") return { kind: "string", value: c.v };
    if (c.t === "e") return null; // #REF! and friends: a refusal, not a figure
    const n = Number(c.v);
    return Number.isFinite(n) ? { kind: "number", value: n } : null;
  };
  const labelOf = (row: number): string => {
    const v = valueOf(`B${row}`);
    return v && v.kind === "string" ? v.value.replace(/※/g, "").trim() : "";
  };

  const monthCell = valueOf("C2");
  const claimMonth = monthCell && monthCell.kind === "number" ? serialToYearMonth(monthCell.value) : null;
  if (!claimMonth) {
    throw new ClaimSheetError("Could not read the Claim month in C2 as a date (e.g. 2026/10).");
  }

  let headerRow = 0;
  for (let r = 1; r <= 40; r++) {
    const v = valueOf(`B${r}`);
    if (v && v.kind === "string" && v.value.trim() === "Claim to") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new ClaimSheetError('Could not find the "Claim to" heading in column B.');

  const lines: ClaimLine[] = [];
  let r = headerRow + 1;
  for (; labelOf(r); r++) {
    const label = labelOf(r);
    const amount = valueOf(`C${r}`);
    if (!amount || amount.kind !== "number") {
      throw new ClaimSheetError(
        `Could not read the amount for ${label} (C${r}) as a number. Open the file in Excel, let it recalculate, save it, and upload it again.`
      );
    }
    const n = amount.value;
    if (!Number.isInteger(n)) {
      throw new ClaimSheetError(`The amount for ${label} (C${r}) is not a whole number (${n}). Round it to whole yen.`);
    }
    if (n < 0) throw new ClaimSheetError(`The amount for ${label} (C${r}) is negative (${n}).`);
    if (n > 0) lines.push({ claimTo: label, amount: n });
  }

  const total = valueOf(`C${r}`);
  return { claimMonth, lines, sheetTotal: total && total.kind === "number" ? total.value : null };
}
