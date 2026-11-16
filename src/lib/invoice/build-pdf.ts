import { formatAmount } from "../utils/format";

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

  text(input.description, 66.144, 438.43);
  text(input.monthLabel, monthCentre, 438.43, { align: "center" });
  text(yen, amountRight, 438.43, { align: "right" });

  doc.setFont("helvetica", "bold");
  text("Total", monthCentre, 244.37, { align: "center" });
  text(yen, amountRight, 244.37, { align: "right" });

  // --- Footer --------------------------------------------------------------------------
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11.04);
  text(`This is computer generated ${input.title} no signature required.`, 66.024, 72.264);

  return new Uint8Array(doc.output("arraybuffer"));
}
