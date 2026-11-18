import { formatInvoiceDate } from "./dates";
import type { SavedInvoice } from "./invoice-record";

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
