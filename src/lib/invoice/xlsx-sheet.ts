/**
 * Read the **cached values** of one sheet straight out of a workbook's XML.
 *
 * Every figure on the accounting sheets is a formula, and Excel stores what it last calculated
 * beside each one (`<f>G14</f><v>0</v>`). exceljs hands the result back for every figure except
 * a zero - a formula that calculated to 0 comes back with no result at all, indistinguishable
 * from one that was never calculated - so a claim of 0 could not be told from a figure that
 * could not be read. A figure that cannot be read must not be taken as 0 (rule 6), and a figure
 * that *is* 0 must not be refused. Reading the XML avoids both.
 *
 * Used by every sheet reader in `lib/invoice/` (rule 5: one way to open a workbook).
 */

/** A sheet that cannot be read says why, in the words the person at the keyboard needs. */
export class SheetReadError extends Error {}

export type CellValue = { kind: "number"; value: number } | { kind: "string"; value: string };

export interface SheetCells {
  /** The value in a cell such as `C2`; `null` when it is empty, an error value, or not a figure/text. */
  valueOf(ref: string): CellValue | null;
  /** The text in a cell with the `※` footnote mark removed and trimmed; `""` when it holds no text. */
  textOf(ref: string): string;
}

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
export function serialToYearMonth(serial: number): { year: number; month: number } | null {
  if (!Number.isFinite(serial) || serial < 36526 || serial > 73050) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Open `sheetName` and return its cells down to row `maxRow`.
 *
 * The workbook is loaded on demand: a file this size is the reason for a loading state, not a
 * bundle. Pass the same `file` to several calls to read several sheets.
 */
export async function readSheet(file: ArrayBuffer, sheetName: string, maxRow = 60): Promise<SheetCells> {
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new SheetReadError("Could not read this as an Excel file (choose an .xlsx or .xlsm).");
  }
  const read = async (path: string): Promise<string | null> => {
    const entry = zip.file(path);
    return entry ? entry.async("string") : null;
  };

  // The sheet's file is found by name through the workbook and its relationships.
  const workbookXml = await read("xl/workbook.xml");
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new SheetReadError("The Excel file is not in the expected format (workbook.xml not found).");
  }
  let relId: string | null = null;
  const sheetNames: string[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    if (name) sheetNames.push(name);
    if (name === sheetName) relId = attr(m[0], "r:id");
  }
  if (!relId) {
    // Most often the wrong file for the screen (the Patent & R&D workbook dropped on Expenses, or the reverse).
    const have = sheetNames.slice(0, 8).join(", ") + (sheetNames.length > 8 ? ", ..." : "");
    throw new SheetReadError(`Sheet "${sheetName}" not found. Is this the right file for this tab? The sheets in this file: ${have || "(none)"}.`);
  }

  let target: string | null = null;
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (attr(m[0], "Id") === relId) target = attr(m[0], "Target");
  }
  if (!target) throw new SheetReadError(`Could not locate the sheet "${sheetName}" in the file.`);
  const sheetXml = await read(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!sheetXml) throw new SheetReadError(`Could not read the contents of the sheet "${sheetName}".`);

  const cells = new Map<string, { t: string | null; v: string | null }>();
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], "r");
    const parts = ref ? /^([A-Z]+)(\d+)$/.exec(ref) : null;
    if (!ref || !parts || Number(parts[2]) > maxRow) continue;
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
  const textOf = (ref: string): string => {
    const v = valueOf(ref);
    return v && v.kind === "string" ? v.value.replace(/※/g, "").trim() : "";
  };
  return { valueOf, textOf };
}
