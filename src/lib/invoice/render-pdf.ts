import { fiscalYearOf, formatInvoiceDate, type YearMonthDay } from "./dates";
import type { Customer } from "./customer-record";
import type { SavedInvoice } from "./invoice-record";
import type { DocumentTitle, TextRasterizer } from "./build-pdf";
import type { Statement } from "./statement-record";

/**
 * Draw text the PDF fonts cannot (Japanese A/C names) on a canvas, at 4x for print, with the
 * fonts the Mac and Windows machines here have. Only page 2 of a statement asks for it.
 */
const rasterizeText: TextRasterizer = (text, fontSize) => {
  const SCALE = 4;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const font = `${fontSize * SCALE}px "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "MS PGothic", "Noto Sans JP", sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 2;
  const height = Math.ceil(fontSize * SCALE * 1.25);
  canvas.width = width;
  canvas.height = height;
  ctx.font = font; // a resize resets the context
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 1, height * 0.8);
  return { png: canvas.toDataURL("image/png"), width: width / SCALE, height: height / SCALE };
};

/** The PDF of a saved invoice - the saved data is the record, the file is made from it. */
export async function renderPdf(invoice: SavedInvoice, description: string): Promise<Blob> {
  const [year, month, day] = invoice.invoiceDate.split("-").map(Number);
  const { buildInvoicePdf } = await import("@/lib/invoice/build-pdf");
  const logoPng = new Uint8Array(await (await fetch("/hoya-logo.png")).arrayBuffer());
  const bytes = await buildInvoicePdf({
    title: invoice.title,
    invoiceNumber: invoice.number,
    invoiceDate: formatInvoiceDate({ year, month, day }),
    customer: {
      name: invoice.customerName,
      addressLines: invoice.customerAddressLines,
      tradingPartnerId: invoice.customerTradingPartnerId,
    },
    paymentTerms: invoice.paymentTerms,
    description,
    monthLabel: invoice.monthLabel,
    amount: invoice.total,
    logoPng,
    statement: invoice.statement,
    rasterizeText,
  });
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * **A preview of an invoice that has not been issued** - the same document, with `XXX` where the number
 * will be. Nothing is saved and no number is taken: a number is assigned only when the invoice is
 * issued, and a cancelled one is never reused, so looking must not cost one.
 */
export async function renderDraftPdf(draft: {
  title: DocumentTitle;
  invoiceDate: YearMonthDay;
  monthLabel: string;
  customer: Customer;
  description: string;
  amount: number;
  statement?: Statement | null;
}): Promise<Blob> {
  const { buildInvoicePdf } = await import("@/lib/invoice/build-pdf");
  const logoPng = new Uint8Array(await (await fetch("/hoya-logo.png")).arrayBuffer());
  const bytes = await buildInvoicePdf({
    title: draft.title,
    invoiceNumber: `HYM1AC${fiscalYearOf(draft.invoiceDate)}-XXX`,
    invoiceDate: formatInvoiceDate(draft.invoiceDate),
    customer: {
      name: draft.customer.name,
      addressLines: draft.customer.addressLines,
      tradingPartnerId: draft.customer.tradingPartnerId,
    },
    paymentTerms: draft.customer.paymentTerms,
    description: draft.description,
    monthLabel: draft.monthLabel,
    amount: draft.amount,
    logoPng,
    statement: draft.statement,
    rasterizeText,
  });
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Show a PDF in a new tab. **The tab is opened first, inside the click**, or the browser's pop-up
 * blocker refuses it once the PDF has been made; it is closed again if making the PDF fails.
 */
export async function openPdfInTab(make: () => Promise<Blob>): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await make());
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
