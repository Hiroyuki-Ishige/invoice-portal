/**
 * The mail that tells a site's accounting an invoice has been issued to it.
 *
 * One message per company, listing every invoice issued to it in the batch - HOGV is charged
 * for patent and for patent (New Business) in the same month and gets one mail, not two.
 * Wording and layout come from `mail-shell`, like every other mail this app sends.
 */

import { formatAmount } from "@/lib/utils/format";
import { formatInvoiceDate } from "@/lib/invoice/dates";
import { COOL_GREY, HOYA_BLUE, WARM_BLACK, escapeHtml, renderMailShell } from "./mail-shell";

export interface InvoiceNoticeLine {
  number: string;
  title: string;
  description: string;
  /** Whole yen. */
  amount: number;
}

export interface InvoiceNoticeInput {
  customerName: string;
  /** `2026-10-31` */
  invoiceDate: string;
  /** `Oct-26` */
  monthLabel: string;
  invoices: InvoiceNoticeLine[];
  /** Whether the PDFs travel with the message. */
  attached: boolean;
  /** Who is sending - the person who issued. */
  senderName: string;
}

/**
 * **The notice is still being tested** (2026-11-23): while this is true the subject starts with `[TEST]` and a
 * banner heads the message, so nobody at a site mistakes it for a real notice. Switch it off here, once, when
 * the mail goes live.
 */
export const NOTICE_TEST_MODE = true;

const TEST_BANNER_HTML = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px">
    <tr>
      <td style="padding:12px 16px;background:#fff8e6;border:2px solid #f59e0b;border-radius:8px;font-size:15px;font-weight:700;color:${WARM_BLACK}">
        TEST &mdash; this is a test message from Invoice Portal, not a real invoice notice. Please ignore it.
      </td>
    </tr>
  </table>`;

const TD = `padding:8px 10px;border-bottom:1px solid #e3e8ee;font-size:13px;color:${WARM_BLACK}`;

export function buildInvoiceNotice(input: InvoiceNoticeInput): { subject: string; html: string } {
  const [year, month, day] = input.invoiceDate.split("-").map(Number);
  const date = formatInvoiceDate({ year, month, day });
  const total = input.invoices.reduce((sum, line) => sum + line.amount, 0);
  const numbers = input.invoices.map((line) => line.number);

  const baseSubject =
    numbers.length <= 3
      ? `Invoice issued: ${numbers.join(", ")} (${input.monthLabel})`
      : `${numbers.length} invoices issued (${input.monthLabel})`;
  const subject = NOTICE_TEST_MODE ? `[TEST] ${baseSubject}` : baseSubject;

  const many = input.invoices.length > 1;
  const rows = input.invoices
    .map(
      (line) => `
        <tr>
          <td style="${TD};white-space:nowrap">${escapeHtml(line.number)}</td>
          <td style="${TD}">${escapeHtml(line.description)}</td>
          <td style="${TD};text-align:right;white-space:nowrap">&yen;${formatAmount(line.amount, 0)}</td>
        </tr>`
    )
    .join("");

  const appendixHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 8px;border-collapse:collapse">
      <tr>
        <td style="padding:8px 10px;border-bottom:2px solid ${HOYA_BLUE};font-size:12px;font-weight:700;color:${COOL_GREY}">NO.</td>
        <td style="padding:8px 10px;border-bottom:2px solid ${HOYA_BLUE};font-size:12px;font-weight:700;color:${COOL_GREY}">DESCRIPTION</td>
        <td style="padding:8px 10px;border-bottom:2px solid ${HOYA_BLUE};font-size:12px;font-weight:700;color:${COOL_GREY};text-align:right">AMOUNT (JPY)</td>
      </tr>${rows}
    </table>`;

  const html = renderMailShell({
    eyebrow: `${NOTICE_TEST_MODE ? "TEST - " : ""}${many ? "Invoices issued" : "Invoice issued"}`,
    bodyHtml: `${NOTICE_TEST_MODE ? TEST_BANNER_HTML : ""}
      <p style="margin:0 0 12px">Dear ${escapeHtml(input.customerName)} Accounting team,</p>
      <p style="margin:0">
        HOYA CORPORATION MD Section Accounting has issued ${many ? "the following invoices" : "the following invoice"}
        to ${escapeHtml(input.customerName)}${input.attached ? `. The PDF${many ? "s are" : " is"} attached.` : "."}
      </p>`,
    facts: [
      { label: "Invoice date", value: date },
      { label: "Claim month", value: input.monthLabel },
      { label: "Total", value: `¥${formatAmount(total, 0)}`, strong: true },
    ],
    appendixHtml,
    footnote: `Sent from Invoice Portal by ${input.senderName}. Replying to this message will reach the sender, not the app.`,
  });
  return { subject, html };
}
