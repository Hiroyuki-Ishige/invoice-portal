/**
 * Open a PDF **in the browser** and return its first page as printed lines, for
 * `customerFromPdfLines()`. The file never leaves the machine: nothing is uploaded.
 *
 * pdf.js is loaded on demand (only the "Add from invoice PDF" button needs it), and its
 * worker is started from the package through the bundler's `new URL(..., import.meta.url)`.
 */

import { groupIntoLines, type PdfTextItem } from "./customer-from-pdf";

export async function readPdfLines(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if ("str" in item) items.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
    }
    return groupIntoLines(items);
  } finally {
    await task.destroy();
  }
}
