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

/** The workbook has no sheet of that name - a reader of an optional sheet catches this one alone. */
export class SheetNotFoundError extends SheetReadError {}

export type CellValue = { kind: "number"; value: number } | { kind: "string"; value: string };

export interface SheetCells {
  /** The name of the sheet actually read - not always the name asked for (see `readSheet`). */
  sheetName: string;
  /** The value in a cell such as `C2`; `null` when it is empty, an error value, or not a figure/text. */
  valueOf(ref: string): CellValue | null;
  /** The text in a cell with the `※` footnote mark removed and trimmed; `""` when it holds no text. */
  textOf(ref: string): string;
  /** Every cell down to `maxRow` whose text (as `textOf` gives it) passes `isMatch`, left to right, then top to bottom. */
  findText(isMatch: (text: string) => boolean, maxRow: number): CellPos[];
  /** Whether column `col` (1 = A) is hidden in Excel - what the sheet leaves out when it is printed. */
  isColumnHidden(col: number): boolean;
}

/** A cell by number: column 1 is A. */
export interface CellPos {
  col: number;
  row: number;
}

export const colIndex = (letters: string): number => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export function colName(index: number): string {
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const refOf = (col: number, row: number): string => `${colName(col)}${row}`;

/**
 * Where the `count` labels passing `isLabel` are - one per block, left to right.
 *
 * **The layout as built is tried first**: one label in each of `usualCols`, so a file nobody has
 * touched is read exactly as before. Failing that, the top `maxRow` rows are searched in every
 * column, which is what lets a column or a row inserted in front of a table move it (reported
 * 2026-11-26: "the cells and the sheet names move a little"). In that search, anything but exactly
 * `count` found is refused - a guess between two labels is a guess between two amounts. (On the usual
 * path the topmost label in each usual column is taken and extra ones elsewhere are not looked at,
 * which is what the fixed-cell reader did.)
 */
export function locateLabels(
  cells: SheetCells,
  isLabel: (text: string) => boolean,
  usualCols: string[],
  maxRow: number,
  what: string
): CellPos[] {
  const found = cells.findText(isLabel, maxRow);
  const usual = usualCols.map((c) => found.find((p) => p.col === colIndex(c)));
  if (usual.every((p) => p !== undefined)) return usual as CellPos[];
  if (found.length === usualCols.length) return found;
  if (found.length === 0) throw new SheetReadError(`Could not find ${what} in ${cells.sheetName}.`);
  throw new SheetReadError(
    `Expected ${usualCols.length === 1 ? "one" : usualCols.length} ${what} in ${cells.sheetName}, found ${found.length} (${found
      .map((p) => refOf(p.col, p.row))
      .join(", ")}). Remove the extra ones.`
  );
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
 * A sheet name with what people change by hand taken out, for comparing: full/half width (NFKC),
 * case, spaces, `_` and `-`, and a trailing copy or year mark - `(2)`, `FY2026`, `(FY2026)`.
 * `請求＿出向者立替費用（2）` and ` 請求-出向者立替費用 FY2026` both come out as `請求出向者立替費用`.
 */
export function normalizeSheetName(name: string): string {
  let s = name.normalize("NFKC").toLowerCase().trim();
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/\s*\((?:\d+|fy\s*\d{4})\)\s*$/, "").replace(/[\s_-]*fy\s*\d{4}\s*$/, "").trim();
  }
  return s.replace(/[\s_\-\u2010-\u2015\u2212]/g, "");
}

/**
 * Which of `names` is the sheet called `wanted`. **The exact name wins.** Without it, the one sheet
 * whose name is the same after `normalizeSheetName`; with two or more such sheets nothing is guessed -
 * the wrong copy would put the wrong amounts on an invoice.
 */
export function resolveSheetName(names: string[], wanted: string): string | null {
  if (names.includes(wanted)) return wanted;
  const key = normalizeSheetName(wanted);
  const near = names.filter((n) => normalizeSheetName(n) === key);
  if (near.length > 1) {
    throw new SheetReadError(
      `More than one sheet could be "${wanted}": ${near.map((n) => `"${n}"`).join(", ")}. Rename the one to read to "${wanted}", or remove the others.`
    );
  }
  return near[0] ?? null;
}

/** What the screen says when the sheet read was not the exact name: the person should know which one it was. */
export function sheetNameWarning(cells: SheetCells, wanted: string): string | null {
  return cells.sheetName === wanted ? null : `Read the sheet "${cells.sheetName}" as ${wanted} (the name is slightly different).`;
}

/**
 * Open `sheetName` and return its cells down to row `maxRow`. A sheet whose name differs only
 * slightly is read in its place (`resolveSheetName`); `sheetName` on the result says which one.
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
  const sheets: Array<{ name: string; relId: string | null }> = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    if (name) sheets.push({ name, relId: attr(m[0], "r:id") });
  }
  const sheetNames = sheets.map((x) => x.name);
  const actualName = resolveSheetName(sheetNames, sheetName);
  const relId = sheets.find((x) => x.name === actualName)?.relId ?? null;
  if (!relId) {
    // Most often the wrong file for the screen (the Patent & R&D workbook dropped on Expenses, or the reverse).
    const have = sheetNames.slice(0, 8).join(", ") + (sheetNames.length > 8 ? ", ..." : "");
    throw new SheetNotFoundError(`Sheet "${sheetName}" not found. Is this the right file for this tab? The sheets in this file: ${have || "(none)"}.`);
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
    // `<v xml:space="preserve">` is how Excel saves text with a leading or trailing space ("Other welfare ").
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
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
  const findText = (isMatch: (text: string) => boolean, limit: number): CellPos[] => {
    const out: CellPos[] = [];
    for (const ref of cells.keys()) {
      const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
      const pos = { col: colIndex(m[1]), row: Number(m[2]) };
      const text = textOf(ref);
      if (pos.row <= limit && text && isMatch(text)) out.push(pos);
    }
    return out.sort((a, b) => a.col - b.col || a.row - b.row);
  };
  const hiddenCols = new Set<number>();
  for (const m of sheetXml.matchAll(/<col\b[^>]*>/g)) {
    if (attr(m[0], "hidden") !== "1" && attr(m[0], "hidden") !== "true") continue;
    const min = Number(attr(m[0], "min"));
    const max = Math.min(Number(attr(m[0], "max")), 200);
    for (let c = min; c <= max; c++) hiddenCols.add(c);
  }
  const isColumnHidden = (col: number) => hiddenCols.has(col);
  return { sheetName: actualName ?? sheetName, valueOf, textOf, findText, isColumnHidden };
}
