import { formatAmount } from "../utils/format";
import type { Statement } from "./statement-record";

/**
 * Text the built-in PDF fonts cannot draw (the Japanese A/C names) drawn as a picture instead:
 * a PNG data URL and its size in points at `fontSize`. The browser passes one made with a canvas
 * (`render-pdf.ts`) - embedding a Japanese font would add megabytes for a few words.
 */
export type TextRasterizer = (text: string, fontSize: number) => { png: string; width: number; height: number } | null;

export type DocumentTitle = "INVOICE" | "DEBIT NOTE";

export interface InvoicePdfInput {
  title: DocumentTitle;
  /** `HYM1AC2026-182` */
  invoiceNumber: string;
  /** `31-Oct-2026` */
  invoiceDate: string;
  customer: {
    name: string;
    /** One printed line each; up to three. */
    addressLines: string[];
    /** `HOGT(ex-A412)` */
    tradingPartnerId: string;
  };
  paymentTerms: string;
  /** `Reimbursement for the expense` */
  description: string;
  /** `Oct-26` */
  monthLabel: string;
  /** Whole yen. */
  amount: number;
  /** The company mark (PNG bytes). Left out, the header carries no logo. */
  logoPng?: Uint8Array;
  /** Page 2: the breakdown, for an invoice that carries one (R&D reimbursement). */
  statement?: Statement | null;
  /** Needed for page 2's Japanese names; without it they are left out. */
  rasterizeText?: TextRasterizer;
}

/**
 * The company's own block, which prints on every document.
 * Moves to the settings table when the app grows a place for it.
 */
export const ISSUER = {
  lines: [
    "HOYA CORPORATION MD Section Accounting",
    "3-3-1 Musashino, Akishima-shi, Tokyo 196-8510 Japan",
    "TEL# 81-42-546-2739    FAX# 81-42-546-2773",
    "Trading Partner ID: HYM1(ex-J11E)",
  ],
} as const;

// A4 as the original PDF has it, in points. Every coordinate below was read off that file
// (HYM1AC2026-182.pdf) in PDF space, origin bottom-left, so `y()` flips it for jsPDF.
const PAGE_W = 595.32;
const PAGE_H = 841.92;
const y = (pdfY: number) => PAGE_H - pdfY;

const TABLE_LEFT = 65.064;
const COL_DESC_END = 397.81;
const COL_MONTH_END = 454.48;
const TABLE_RIGHT = 543.7;

/**
 * Draw the document and return the PDF bytes.
 *
 * jsPDF is loaded on demand - it is the heaviest thing on this screen and only a click
 * needs it. Set in Helvetica: the original is in MS P Gothic, but nothing printed here is
 * Japanese, so no font has to be embedded and the file stays at a few KB.
 */
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: [PAGE_W, PAGE_H], compress: true });
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);

  const text = (value: string, x: number, pdfY: number, opts?: { align?: "left" | "center" | "right" }) =>
    doc.text(value, x, y(pdfY), opts);
  const rect = (x: number, pdfY: number, w: number, h: number) => doc.rect(x, y(pdfY + h), w, h, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11.04);

  // --- Header: logo, issuer, number and date -------------------------------------------
  if (input.logoPng) {
    doc.addImage(input.logoPng, "PNG", 63.493, y(756.24 + 27.84), 108.57, 27.84);
  }
  ISSUER.lines.forEach((line, i) => text(line, 66.024, 740.74 - 12.24 * i));
  text("NO. : ", 400.15, 740.74);
  text(input.invoiceNumber, 456.82, 740.74);
  text("DATE: ", 400.15, 728.5);
  text(input.invoiceDate, 456.82, 728.5);

  // --- Title, centred over the table and underlined ------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleWidth = doc.getTextWidth(input.title);
  const titleX = (TABLE_LEFT + TABLE_RIGHT) / 2 - titleWidth / 2;
  text(input.title, titleX, 624.7);
  rect(titleX, 622.18, titleWidth, 1.32);

  // --- To: -----------------------------------------------------------------------------
  doc.setFontSize(11.04);
  doc.setFont("helvetica", "normal");
  text("To:", 59.064, 587.14);
  doc.setFont("helvetica", "bold");
  text(input.customer.name, 66.024, 574.87);
  doc.setFont("helvetica", "normal");
  const address = input.customer.addressLines.slice(0, 3);
  address.forEach((line, i) => text(line, 66.024, 562.63 - 12.24 * i));
  text(`Trading Partner ID: ${input.customer.tradingPartnerId}`, 66.024, 562.63 - 12.24 * address.length);

  text("Payment Terms: ", 59.064, 513.67);
  text(input.paymentTerms, 66.024, 501.43);

  // --- The table: a heavy outer rule, hairlines inside --------------------------------
  rect(63.144, 240.65, 1.92, 222.38); // left
  rect(543.7, 240.65, 1.92, 220.46); // right
  rect(TABLE_LEFT, 461.11, 478.63, 1.92); // top
  rect(TABLE_LEFT, 448.75, 478.63, 0.96); // under the headings
  rect(397.75, 257.33, 0.96, 203.78); // column rules
  rect(454.42, 257.33, 0.96, 203.78);
  rect(TABLE_LEFT, 256.37, 478.63, 0.96); // the double rule above Total
  rect(TABLE_LEFT, 254.45, 478.63, 0.96);
  rect(397.75, 242.57, 0.96, 11.88); // Total row column rules
  rect(454.42, 242.57, 0.96, 11.88);
  rect(TABLE_LEFT, 240.65, 480.55, 1.92); // bottom

  const descCentre = (TABLE_LEFT + COL_DESC_END) / 2;
  const monthCentre = (COL_DESC_END + COL_MONTH_END) / 2;
  const amountCentre = (COL_MONTH_END + TABLE_RIGHT) / 2;
  const amountRight = 543.0;
  const yen = `¥${formatAmount(input.amount, 0)}`;

  doc.setFontSize(12);
  text("Description", descCentre, 451.27, { align: "center" });
  text("Month", monthCentre, 451.27, { align: "center" });
  text("Amount (JPY)", amountCentre, 451.27, { align: "center" });

  // A long description (the "(New Business)" ones) is set smaller rather than run into the Month column.
  const descMaxWidth = COL_DESC_END - 66.144 - 4;
  const descWidth = doc.getTextWidth(input.description);
  if (descWidth > descMaxWidth) doc.setFontSize(Math.max(8, (12 * descMaxWidth) / descWidth));
  text(input.description, 66.144, 438.43);
  doc.setFontSize(12);
  text(input.monthLabel, monthCentre, 438.43, { align: "center" });
  text(yen, amountRight, 438.43, { align: "right" });

  doc.setFont("helvetica", "bold");
  text("Total", monthCentre, 244.37, { align: "center" });
  text(yen, amountRight, 244.37, { align: "right" });

  // --- Footer --------------------------------------------------------------------------
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11.04);
  text(`This is computer generated ${input.title} no signature required.`, 66.024, 72.264);

  if (input.statement) drawStatementPage(doc, input.statement, input.rasterizeText);

  return new Uint8Array(doc.output("arraybuffer"));
}

/** Outside Latin-1, which the standard PDF fonts cover. */
const NEEDS_RASTER = /[^\u0000-ÿ]/;

/** The part of jsPDF page 2 uses - typed here, as the package's two type entry points do not agree. */
interface StatementDoc {
  addPage(format: number[], orientation: "landscape"): unknown;
  text(text: string, x: number, y: number, options?: { align?: "left" | "center" | "right" }): unknown;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): unknown;
  getTextWidth(text: string): number;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  rect(x: number, y: number, w: number, h: number, style?: string): unknown;
  setFont(name: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setLineWidth(width: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineDashPattern?(pattern: number[], phase: number): unknown;
}

type Align = "left" | "center" | "right";

/**
 * Write `value` at a baseline. With `maxWidth`, text that would not fit is set smaller (down to
 * 3.5pt), as Excel's shrink-to-fit does. Japanese goes through `rasterize` as a picture, scaled
 * down to the width the same way.
 */
function writer(doc: StatementDoc, rasterize?: TextRasterizer) {
  // The size in use, kept here: the jsPDF typings in use do not declare a getter for it.
  let size = 9;
  const put = (value: string, x: number, baseline: number, align: Align = "left", maxWidth?: number) => {
    if (!value) return;
    if (!NEEDS_RASTER.test(value)) {
      const width = doc.getTextWidth(value);
      const shrink = maxWidth && width > maxWidth ? Math.max(3.5, (size * maxWidth) / width) : size;
      doc.setFontSize(shrink);
      doc.text(value, x, baseline, { align });
      doc.setFontSize(size);
      return;
    }
    const image = rasterize?.(value, size);
    if (!image) return;
    const scale = maxWidth && image.width > maxWidth ? maxWidth / image.width : 1;
    const w = image.width * scale;
    const h = image.height * scale;
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    // The picture's box runs from the ascent to the descent; its baseline sits at 80% of its height.
    doc.addImage(image.png, "PNG", left, baseline - h * 0.8, w, h);
  };
  /** Set the font size for what follows. */
  put.size = (next: number) => {
    size = next;
    doc.setFontSize(next);
  };
  return put;
}

/** Page 2, landscape - the simple A/C table, or the department table when the statement has columns. */
function drawStatementPage(doc: StatementDoc, statement: Statement, rasterize?: TextRasterizer) {
  doc.addPage([PAGE_W, PAGE_H], "landscape");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  const put = writer(doc, rasterize);
  if (statement.layout === "companies") drawCompanyTable(doc, statement, put);
  else if (statement.layout === "department" || statement.layout === "allocation") drawDepartmentTable(doc, statement, put);
  else drawAccountTable(doc, statement, put);
}

const yenOf = (n: number) => `¥${formatAmount(n, 0)}`;

/**
 * One amount per A/C code (`Supplies,Repair,Outsource_2610.pdf`).
 * Measured off that file, in points from the top-left (jsPDF's own origin - no flip here).
 */
function drawAccountTable(doc: StatementDoc, statement: Statement, put: ReturnType<typeof writer>) {
  const SIZE = 9;
  const LEFT = 167.5;
  const COLS = [LEFT, 266.2, 493.5, 608.8, 680];
  const ROW_H = 11;
  put.size(SIZE);

  doc.setFont("helvetica", "bold");
  put(statement.heading, LEFT + 2, 50);
  doc.setLineWidth(0.6);
  doc.line(LEFT + 2, 51.5, LEFT + 2 + doc.getTextWidth(statement.heading), 51.5);

  doc.setFont("helvetica", "normal");
  put("Claim year/month:", LEFT + 2, 62);
  put(statement.claimMonth, COLS[1] + 2, 62);
  put("Claim to:", LEFT + 2, 72.5);
  put(statement.claimTo, COLS[1] + 2, 72.5);
  put("Claim amount:", LEFT + 2, 83);
  put(yenOf(statement.amount), (COLS[1] + COLS[2]) / 2, 83, "center");
  put("(Details as below)", COLS[2] + 4, 83);

  put("R3 code", LEFT + 2, 106);
  put("Unit:JPY", COLS[4] - 2, 106, "right");

  // Column headings on grey, in white.
  const headTop = 108.8;
  const headH = 31.2;
  doc.setFillColor(128, 128, 128);
  doc.rect(LEFT, headTop, COLS[4] - LEFT, headH, "F");
  doc.setTextColor(255, 255, 255);
  ["A/C Code", "A/C Name (EN)", "A/C Name (JP)", "Total"].forEach((h, i) => put(h, (COLS[i] + COLS[i + 1]) / 2, headTop + 8, "center"));
  doc.setTextColor(0, 0, 0);

  doc.setLineWidth(0.5);
  let top = headTop + headH;
  for (const row of statement.rows) {
    doc.rect(LEFT, top, COLS[4] - LEFT, ROW_H);
    for (const x of COLS.slice(1, 4)) doc.line(x, top, x, top + ROW_H);
    const base = top + 8.5;
    put(row.code, COLS[1] - 1.5, base, "right");
    put(row.nameEn, COLS[1] + 2, base, "left", COLS[2] - COLS[1] - 4);
    put(row.nameJp, COLS[2] + 2, base, "left", COLS[3] - COLS[2] - 4);
    put(formatAmount(row.total, 0), COLS[4] - 1.5, base, "right");
    top += ROW_H;
  }

  doc.setLineWidth(2);
  doc.rect(LEFT, top, COLS[4] - LEFT, ROW_H + 1);
  doc.setLineWidth(0.5);
  doc.line(COLS[3], top, COLS[3], top + ROW_H + 1);
  put("Total", LEFT + 2, top + 9);
  put(formatAmount(statement.total, 0), COLS[4] - 1.5, top + 9, "right");
}

/**
 * An amount per department per A/C code, and a Claim amount of `factor` x the total
 * (`R&D_2610.pdf`). As many department columns as the sheet has: the table takes the page's width
 * with ten of them, and stays narrow and centred with one or two.
 */
function drawDepartmentTable(doc: StatementDoc, statement: Statement, put: ReturnType<typeof writer>) {
  const SIZE = 6.5;
  // A single department needs no Total beside it (the patent sheet has none); R&D always has one.
  const withTotal = statement.layout === "department" || statement.columns.length > 1;
  const W = { code: 58, nameEn: 118, nameJp: 74, total: withTotal ? 58 : 0 };
  const fixed = W.code + W.nameEn + W.nameJp + W.total;
  const room = PAGE_H - 60 - fixed; // landscape: the page is PAGE_H wide
  // One department carries the span label ("Expense amount of 2026/10") alone, so it gets room for it.
  const deptW = Math.min(statement.columns.length === 1 ? 110 : 64, room / statement.columns.length);
  const width = fixed + deptW * statement.columns.length;
  const LEFT = (PAGE_H - width) / 2;
  const RIGHT = LEFT + width;
  // Column edges: code | EN | JP | departments... | Total
  const edges = [LEFT, LEFT + W.code, LEFT + W.code + W.nameEn, LEFT + W.code + W.nameEn + W.nameJp];
  statement.columns.forEach((_, i) => edges.push(edges[3] + deptW * (i + 1)));
  if (withTotal) edges.push(RIGHT);
  const deptEdge = (i: number) => edges[3 + i];
  const totalLeft = withTotal ? edges[edges.length - 2] : RIGHT;
  // Inner rules: every edge but the outer two.
  const inner = edges.slice(1, -1);

  const headTop = statement.layout === "allocation" ? drawAllocationHead(doc, statement, put, LEFT) : drawDepartmentHead(doc, statement, put, LEFT);
  put.size(SIZE);
  put("Unit:JPY", RIGHT - 1, headTop - 3, "right");

  // Three heading rows on grey: the A/C headings and Total span all three; the departments have
  // the span label, then the name, then the cost centre.
  const hRow = 9;
  doc.setFillColor(128, 128, 128);
  doc.rect(LEFT, headTop, width, hRow * 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.setDrawColor(255, 255, 255);
  ["S4/AC code(No.)", "AC code(Name-E)", "AC code(Name-J)"].forEach((h, i) =>
    put(h, (edges[i] + edges[i + 1]) / 2, headTop + 6.5, "center", edges[i + 1] - edges[i] - 2)
  );
  if (withTotal) put("Total", (totalLeft + RIGHT) / 2, headTop + 6.5, "center");
  put(statement.spanLabel, (deptEdge(0) + totalLeft) / 2, headTop + 6.5, "center", totalLeft - deptEdge(0) - 2);
  statement.columns.forEach((col, i) => {
    const mid = (deptEdge(i) + deptEdge(i + 1)) / 2;
    put(col.name, mid, headTop + hRow + 6.5, "center", deptW - 2);
    put(col.code, mid, headTop + hRow * 2 + 6.5, "center", deptW - 2);
  });
  // The A/C columns and Total are ruled the full height; between departments only under the span label.
  for (const x of edges.slice(1, 4)) doc.line(x, headTop, x, headTop + hRow * 3);
  if (withTotal) doc.line(totalLeft, headTop, totalLeft, headTop + hRow * 3);
  for (let i = 1; i < statement.columns.length; i++) doc.line(deptEdge(i), headTop + hRow, deptEdge(i), headTop + hRow * 3);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // The rows, as many as fit above the footnote.
  const bodyTop = headTop + hRow * 3;
  const rowH = Math.min(9, (PAGE_W - 40 - bodyTop - 30) / (statement.rows.length + 1));
  const baseOf = (top: number) => top + rowH * 0.74;
  doc.setLineWidth(0.4);
  let top = bodyTop;
  for (const row of statement.rows) {
    doc.rect(LEFT, top, width, rowH);
    for (const x of inner) doc.line(x, top, x, top + rowH);
    const base = baseOf(top);
    if (row.mark) put(row.mark, LEFT - 8, base);
    put(row.code, edges[1] - 1.5, base, "right");
    put(row.nameEn, edges[1] + 1.5, base, "left", W.nameEn - 3);
    put(row.nameJp, edges[2] + 1.5, base, "left", W.nameJp - 3);
    row.amounts.forEach((a, i) => put(formatAmount(a, 0), deptEdge(i + 1) - 1.5, base, "right", deptW - 3));
    if (withTotal) put(formatAmount(row.total, 0), RIGHT - 1.5, base, "right", W.total - 3);
    top += rowH;
  }

  // The Total row, in a heavy box.
  doc.setLineWidth(1.5);
  doc.rect(LEFT, top, width, rowH + 1);
  doc.setLineWidth(0.4);
  for (const x of inner.slice(2)) doc.line(x, top, x, top + rowH + 1);
  const base = baseOf(top) + 0.5;
  put("Total", LEFT + 1.5, base);
  statement.columnTotals.forEach((t, i) => put(formatAmount(t, 0), deptEdge(i + 1) - 1.5, base, "right", deptW - 3));
  if (withTotal) put(formatAmount(statement.total, 0), RIGHT - 1.5, base, "right", W.total - 3);

  if (statement.footnote) put(statement.footnote, LEFT, top + rowH + 16, "left", width);
}

/** The R&D heading block: one Claim amount line. Returns where the table's heading starts. */
function drawDepartmentHead(doc: StatementDoc, statement: Statement, put: ReturnType<typeof writer>, LEFT: number): number {
  put.size(8.5);
  doc.setFont("helvetica", "bold");
  put(statement.heading, LEFT, 46);
  doc.setLineWidth(0.6);
  doc.line(LEFT, 47.5, LEFT + doc.getTextWidth(statement.heading), 47.5);
  doc.setFont("helvetica", "normal");
  put.size(7.5);
  put("Claim year/month:", LEFT, 57);
  put(statement.claimMonth, LEFT + 78, 57);
  put("Claim to:", LEFT, 65.5);
  put(statement.claimTo, LEFT + 78, 65.5);
  put("Claim amount:", LEFT, 74);
  put(yenOf(statement.amount), LEFT + 190, 74, "right");
  const basis = statement.factor !== null ? `=  ${statement.factor}  ×  ${yenOf(statement.total)}   ` : "";
  put(`${basis}(Details as below)`, LEFT + 215, 74);

  return 95;
}

/**
 * The patent heading block: the claim list of the companies sharing the cost - amount, the
 * multiplier, the allocated part and its ratio - then the allocation basis. Returns where the
 * table's heading starts.
 */
function drawAllocationHead(doc: StatementDoc, statement: Statement, put: ReturnType<typeof writer>, LEFT: number): number {
  put.size(8.5);
  doc.setFont("helvetica", "bold");
  put(statement.heading, LEFT, 46);
  doc.setLineWidth(0.6);
  doc.line(LEFT, 47.5, LEFT + doc.getTextWidth(statement.heading), 47.5);
  doc.setFont("helvetica", "normal");
  put.size(7.5);
  const valueX = LEFT + 78;
  put("Claim year/month:", LEFT, 57);
  put(statement.claimMonth, valueX, 57);
  put("Claim to:", LEFT, 65.5);
  put(statement.summary.map((l) => l.label).join("/"), valueX, 65.5);
  put("Claim amount:", LEFT, 74);

  // company | amount | = 1.05 x | part | ratio  - a company with nothing this month shows its name alone.
  const cols = { amount: valueX + 112, times: valueX + 122, base: valueX + 222, ratio: valueX + 262 };
  let y = 74;
  for (const line of statement.summary) {
    put(line.label, valueX, y);
    if (line.amount !== 0 || (line.base ?? 0) !== 0) {
      put(yenOf(line.amount), cols.amount, y, "right");
      put(`=  ${statement.factor}  \u00d7`, cols.times, y);
      if (line.base !== null) put(yenOf(line.base), cols.base, y, "right");
      if (line.ratio !== null) put(`${(line.ratio * 100).toFixed(1)}%`, cols.ratio, y, "right");
    }
    y += 8.5;
  }
  doc.setFont("helvetica", "bold");
  put("Total", valueX, y);
  put(yenOf(statement.summary.reduce((a, l) => a + l.amount, 0)), cols.amount, y, "right");
  put(yenOf(statement.total), cols.base, y, "right");
  put("100.0%", cols.ratio, y, "right");
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.4);
  doc.line(valueX, y - 7, cols.ratio, y - 7);
  y += 8.5;
  put("(Details as below)", cols.base - 60, y);
  y += 10;
  if (statement.allocationBasis) {
    put("Allocation ratio:", LEFT, y);
    put(statement.allocationBasis, valueX, y);
  }
  return y + 14;
}

/**
 * The month's expenses for every company (`Expenses paid by HOYA_202610.pdf`): the claim list, then
 * an amount per company per A/C code - the same page behind each expense invoice of the month.
 */
function drawCompanyTable(doc: StatementDoc, statement: Statement, put: ReturnType<typeof writer>) {
  const LEFT = 42;
  const W = { code: 50.5, nameEn: 101.7, nameJp: 107.5 };
  const fixed = W.code + W.nameEn + W.nameJp;
  const n = statement.columns.length;
  const colW = Math.min(63, (PAGE_H - 2 * LEFT - fixed) / n);
  const right = LEFT + fixed + colW * n;
  const edges = [LEFT, LEFT + W.code, LEFT + W.code + W.nameEn, LEFT + fixed];
  statement.columns.forEach((_, i) => edges.push(edges[3] + colW * (i + 1)));
  const tint = () => doc.setFillColor(235, 235, 235);

  // Heading and claim month.
  put.size(9.5);
  doc.setFont("helvetica", "bold");
  put(statement.heading, LEFT, 77);
  doc.setLineWidth(0.6);
  doc.line(LEFT, 78.5, LEFT + doc.getTextWidth(statement.heading), 78.5);
  doc.setFont("helvetica", "normal");
  put.size(7.5);
  const listCols = [LEFT, LEFT + 50.6, LEFT + 152];
  doc.setLineWidth(0.5);
  doc.rect(listCols[0], 81, listCols[2] - listCols[0], 10);
  doc.line(listCols[1], 81, listCols[1], 91);
  put("Claim month", (listCols[0] + listCols[1]) / 2, 88.5, "center");
  put(statement.claimMonth, (listCols[1] + listCols[2]) / 2, 88.5, "center");

  // The claim list: every company of the month, 0 or not.
  const rowH = 10.5;
  let top = 101;
  tint();
  doc.rect(listCols[0], top, listCols[2] - listCols[0], rowH, "FD");
  doc.line(listCols[1], top, listCols[1], top + rowH);
  put("Claim to", (listCols[0] + listCols[1]) / 2, top + 7.5, "center");
  put("Claim amount (JPY)", (listCols[1] + listCols[2]) / 2, top + 7.5, "center");
  top += rowH;
  for (const line of statement.summary) {
    doc.rect(listCols[0], top, listCols[2] - listCols[0], rowH);
    doc.line(listCols[1], top, listCols[1], top + rowH);
    put(line.label, (listCols[0] + listCols[1]) / 2, top + 7.5, "center");
    put(formatAmount(line.amount, 0), listCols[2] - 2, top + 7.5, "right");
    if (line.note) put(line.note, listCols[2] + 3, top + 7.5);
    top += rowH;
  }
  doc.setTextColor(140, 140, 140);
  put(formatAmount(statement.total, 0), listCols[2] - 2, top + 7.5, "right");
  doc.setTextColor(0, 0, 0);

  // The A/C table: cost centres, company codes, then the heading row with each company's total.
  put.size(7);
  const tableTop = top + 16;
  put("(Unit : JPY)", right - 1, tableTop - 2, "right");
  const hRow = 9;
  const codeTop = tableTop;
  const nameTop = codeTop + hRow;
  const headTop = nameTop + hRow;
  statement.columns.forEach((col, i) => {
    const mid = (edges[3 + i] + edges[4 + i]) / 2;
    put(col.code, mid, codeTop + 7, "center", colW - 2);
    put(col.name, mid, nameTop + 7, "center", colW - 2);
  });
  put("R3 code", LEFT, nameTop + 7);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern?.([1.5, 1.5], 0);
  doc.line(edges[3], nameTop, right, nameTop);
  doc.setLineDashPattern?.([], 0);
  doc.rect(edges[3], nameTop, right - edges[3], hRow);
  tint();
  doc.rect(LEFT, headTop, right - LEFT, hRow, "FD");
  for (const x of edges.slice(1, -1)) doc.line(x, headTop, x, headTop + hRow);
  for (const x of edges.slice(4, -1)) doc.line(x, nameTop, x, nameTop + hRow);
  ["A/C Code", "A/C Name (EN)", "A/C Name (JP)"].forEach((h, i) => put(h, (edges[i] + edges[i + 1]) / 2, headTop + 7, "center"));
  statement.columnTotals.forEach((t, i) => put(`Total ${formatAmount(t, 0)}`, (edges[3 + i] + edges[4 + i]) / 2, headTop + 7, "center", colW - 2));

  let rowTop = headTop + hRow;
  for (const row of statement.rows) {
    doc.rect(LEFT, rowTop, right - LEFT, hRow);
    for (const x of edges.slice(1, -1)) doc.line(x, rowTop, x, rowTop + hRow);
    const base = rowTop + 7;
    put(row.code, LEFT + 1.5, base, "left", W.code - 3);
    put(row.nameEn, edges[1] + 1.5, base, "left", W.nameEn - 3);
    put(row.nameJp, edges[2] + 1.5, base, "left", W.nameJp - 3);
    row.amounts.forEach((a, i) => put(formatAmount(a, 0), edges[4 + i] - 1.5, base, "right", colW - 3));
    rowTop += hRow;
  }
}
