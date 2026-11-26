/**
 * **A customer read off an issued invoice PDF** - the "Add from invoice PDF" button on
 * Admin > Customers. The documents this app prints (and the Excel-made ones before it) all
 * have the same "To:" block:
 *
 *   To:
 *    HOYA MEMORY DISK SINGAPORE                      <- name
 *    10 Tampines Industrial Crescent, Singapore ...  <- address, 1 to 3 lines
 *    Trading Partner ID: HOMS(ex-CG11)               <- "Traing" in the older files
 *   Payment Terms:
 *    Bank Transfer
 *
 * The result only **fills the form**: the person checks it and presses Save, so nothing here
 * is written anywhere. Pure functions - the PDF itself is opened in the browser by
 * `readPdfLines()` (`customer-from-pdf-browser.ts`), and these can be checked in Node.
 */

import { CUSTOMER_LIMITS, DEFAULT_PAYMENT_TERMS, MAX_ADDRESS_LINES, parseDefaultTitles, type CustomerInput } from "./customer-record";
import type { InvoiceTitle, InvoiceType } from "./invoice-record";

/** One piece of text as pdf.js gives it: the string and where it starts (PDF space, origin bottom-left). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

/** Items closer than this vertically are on one printed line (the documents use 9-12pt type). */
const SAME_LINE_TOLERANCE = 2;

/**
 * Put the items back into printed lines, top to bottom and left to right. Pieces of one line
 * are joined with a space; a line that is only spaces is dropped.
 */
export function groupIntoLines(items: PdfTextItem[]): string[] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; parts: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= SAME_LINE_TOLERANCE);
    if (row) row.parts.push(item);
    else rows.push({ y: item.y, parts: [item] });
  }
  return rows.map((r) =>
    r.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export interface CustomerFromPdf {
  /** The form's starting values. `code` is only a guess - see `codeIsGuess`. */
  customer: CustomerInput;
  /** Always true: the code ties a customer to the Excel "Claim to" label, which the PDF does not print. */
  codeIsGuess: true;
  /** `HYM1AC2025-094`, when the document has one - to say which file the form came from. */
  invoiceNumber: string | null;
  /** The kind of invoice the document is, from its description - the one default title it tells us. */
  invoiceType: InvoiceType | null;
  /** Things the person should look at before saving. */
  warnings: string[];
}

export type CustomerFromPdfResult = { ok: true; value: CustomerFromPdf } | { ok: false; error: string };

const TRADING_PARTNER = /^Tra(?:d)?ing\s+Partner\s+ID\s*:\s*(.*)$/i;
const PAYMENT_TERMS = /^Payment\s+Terms\s*:\s*(.*)$/i;
const TO = /^To\s*:\s*(.*)$/i;
const TITLE = /^(INVOICE|DEBIT\s+NOTE)$/i;
const NUMBER = /\bNO\.?\s*:\s*([A-Z0-9][A-Z0-9-]*)/i;

/** The kind of invoice a description belongs to - the wording `build-pdf` and `patent-sheet` print. */
function invoiceTypeOf(lines: string[]): InvoiceType | null {
  if (lines.some((l) => /reimbursement/i.test(l))) return "expense";
  if (lines.some((l) => /patent administration|delegation of technology development/i.test(l))) return "patent-rd";
  return null;
}

/** `HOMS(ex-CG11)` -> `HOMS`. A starting point for the code, nothing more. */
function codeGuess(tradingPartnerId: string): string {
  return tradingPartnerId.split("(")[0].trim().slice(0, CUSTOMER_LIMITS.code);
}

/** Read the "To:" block (and the title) out of a document's lines. */
export function customerFromPdfLines(lines: string[]): CustomerFromPdfResult {
  const toIndex = lines.findIndex((l) => TO.test(l));
  if (toIndex < 0) return { ok: false, error: 'No "To:" block was found. Is this an invoice or debit note issued by this office?' };

  const warnings: string[] = [];
  // The name is on the "To:" line itself when the PDF put them together, else the next line.
  const sameLine = TO.exec(lines[toIndex])![1].trim();
  let cursor = toIndex + 1;
  const name = sameLine || (lines[cursor++] ?? "").trim();
  if (!name || TRADING_PARTNER.test(name) || PAYMENT_TERMS.test(name)) {
    return { ok: false, error: 'The company name after "To:" could not be read.' };
  }

  const address: string[] = [];
  let tradingPartnerId = "";
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    const partner = TRADING_PARTNER.exec(line);
    if (partner) {
      tradingPartnerId = partner[1].trim();
      cursor++;
      break;
    }
    if (PAYMENT_TERMS.test(line)) break;
    address.push(line);
  }
  if (!tradingPartnerId) warnings.push("No Trading Partner ID was found under the address. Enter it by hand.");
  if (address.length === 0) warnings.push("No address was found under the name. Enter it by hand.");
  if (address.length > MAX_ADDRESS_LINES) {
    warnings.push(`The address has ${address.length} lines; only ${MAX_ADDRESS_LINES} fit on an invoice. The rest were joined to the last line - check it.`);
    address.splice(MAX_ADDRESS_LINES - 1, address.length, address.slice(MAX_ADDRESS_LINES - 1).join(" "));
  }

  // Payment terms: on the same line after the colon, or the line below it.
  let paymentTerms = "";
  const termsIndex = lines.findIndex((l, i) => i >= toIndex && PAYMENT_TERMS.test(l));
  if (termsIndex >= 0) {
    paymentTerms = PAYMENT_TERMS.exec(lines[termsIndex])![1].trim() || (lines[termsIndex + 1] ?? "").trim();
    // The table header ("Description Month Amount") is not a payment term.
    if (/^Description\b/i.test(paymentTerms)) paymentTerms = "";
  }

  const titleLine = lines.find((l) => TITLE.test(l));
  const title: InvoiceTitle | null = titleLine ? (/debit/i.test(titleLine) ? "DEBIT NOTE" : "INVOICE") : null;
  const invoiceType = invoiceTypeOf(lines.slice(toIndex));
  const defaultTitles = parseDefaultTitles(null);
  if (title && invoiceType) defaultTitles[invoiceType] = title;
  else if (title) warnings.push(`The document is a ${title}, but what kind of invoice it is could not be told. Set the default titles by hand.`);

  const numberMatch = lines.map((l) => NUMBER.exec(l)).find(Boolean);

  return {
    ok: true,
    value: {
      customer: {
        code: codeGuess(tradingPartnerId),
        name: name.slice(0, CUSTOMER_LIMITS.name),
        addressLines: address.map((l) => l.slice(0, CUSTOMER_LIMITS.addressLine)),
        tradingPartnerId: tradingPartnerId.slice(0, CUSTOMER_LIMITS.tradingPartnerId),
        paymentTerms: (paymentTerms || DEFAULT_PAYMENT_TERMS).slice(0, CUSTOMER_LIMITS.paymentTerms),
        defaultTitles,
      },
      codeIsGuess: true,
      invoiceNumber: numberMatch ? numberMatch[1] : null,
      invoiceType,
      warnings,
    },
  };
}
