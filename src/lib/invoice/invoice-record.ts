/**
 * The saved invoice as Dataverse stores it - header (`hi_invoice`), line (`hi_invoiceline`) and
 * the running number per fiscal year (`hi_invoicesequence`) - and as screens and routes pass it
 * around. Design: `docs/invoice-design.md`.
 *
 * One file for names, choices and mapping, so the Setup routes that build the tables, the routes
 * that write them and the screens that read them cannot describe three different tables
 * (rule 5). No Dataverse client import: screens read the types from here.
 */

import { STATEMENT_LIMITS, parseStoredStatement, validateStatement, type Statement } from "./statement-record";

export const INVOICE_ENTITY_SET = "hi_invoices";
export const INVOICE_LOGICAL_NAME = "hi_invoice";
export const LINE_ENTITY_SET = "hi_invoicelines";
export const LINE_LOGICAL_NAME = "hi_invoiceline";
export const SEQUENCE_ENTITY_SET = "hi_invoicesequences";
export const SEQUENCE_LOGICAL_NAME = "hi_invoicesequence";

/** The lookup from a line to its invoice: field name, and the relationship that creates it. */
export const LINE_INVOICE_LOOKUP = "hi_invoice";
export const LINE_INVOICE_RELATIONSHIP = "hi_invoice_invoiceline";

export const INVOICE_FIELDS = {
  id: "hi_invoiceid",
  /** The primary name: `HYM1AC2026-182`. Unique (alternate key). */
  number: "hi_invoicenumber",
  fiscalYear: "hi_fiscalyear",
  sequence: "hi_sequence",
  title: "hi_title",
  status: "hi_status",
  invoiceDate: "hi_invoicedate",
  currency: "hi_currency",
  total: "hi_total",
  /** `Oct-26` - the claim month the document prints. */
  monthLabel: "hi_monthlabel",
  /*
   * The customer is copied onto the invoice rather than looked up: an issued document must
   * keep the address it was issued with, whatever the master says next year.
   */
  customerCode: "hi_customercode",
  customerName: "hi_customername",
  customerAddress: "hi_customeraddress",
  customerTradingPartnerId: "hi_customertradingpartnerid",
  paymentTerms: "hi_paymentterms",
  cancelReason: "hi_cancelreason",
  cancelledOn: "hi_cancelledon",
  /** JSON: the statement printed as page 2 (`statement-record.ts`). Empty for a one-page invoice. Added 2026-11-26 - Top up. */
  statement: "hi_statement",
} as const;

export const INVOICE_LIMITS = {
  number: 50,
  currency: 10,
  monthLabel: 20,
  customerCode: 50,
  customerName: 200,
  customerAddress: 700,
  tradingPartnerId: 100,
  paymentTerms: 100,
  cancelReason: 1000,
  description: 200,
  statement: STATEMENT_LIMITS.json,
} as const;

export const LINE_FIELDS = {
  id: "hi_invoicelineid",
  /** The primary name: the description. */
  description: "hi_description",
  lineNo: "hi_lineno",
  amount: "hi_amount",
  /** The "Claim to" label of the Excel row this line came from. */
  sourceRow: "hi_sourcerow",
} as const;

export const SEQUENCE_FIELDS = {
  id: "hi_invoicesequenceid",
  /** The primary name: `FY2026`. */
  name: "hi_name",
  fiscalYear: "hi_fiscalyear",
  lastSequence: "hi_lastsequence",
} as const;

/** The running number has 3 digits (`-182`); a year does not go past this. */
export const MAX_SEQUENCE = 999;

/** `hi_title` choice values. */
export const TITLE_VALUES = { INVOICE: 1, "DEBIT NOTE": 2 } as const;
export type InvoiceTitle = keyof typeof TITLE_VALUES;

/**
 * The kinds of invoice the app issues from a monthly Excel file. A customer's default title is
 * set per kind (Admin > Customers), so a new kind is added here and nowhere else in the master.
 */
export const INVOICE_TYPES = {
  expense: { label: "Expenses" },
  "patent-rd": { label: "Patent & R&D" },
} as const;
export type InvoiceType = keyof typeof INVOICE_TYPES;
export const INVOICE_TYPE_KEYS = Object.keys(INVOICE_TYPES) as InvoiceType[];

/** `hi_status` choice values. A fresh invoice is issued directly; Draft is reserved. */
export const STATUS_VALUES = { draft: 1, issued: 2, cancelled: 3 } as const;
export type InvoiceStatus = keyof typeof STATUS_VALUES;
export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  cancelled: "Cancelled",
};

export function titleFromValue(value: unknown): InvoiceTitle {
  return value === TITLE_VALUES["DEBIT NOTE"] ? "DEBIT NOTE" : "INVOICE";
}

export function statusFromValue(value: unknown): InvoiceStatus {
  if (value === STATUS_VALUES.draft) return "draft";
  if (value === STATUS_VALUES.cancelled) return "cancelled";
  return "issued";
}

/** What a list row and a PDF rebuild need. */
export interface SavedInvoice {
  id: string;
  number: string;
  fiscalYear: number;
  sequence: number;
  title: InvoiceTitle;
  status: InvoiceStatus;
  /** `2026-10-31` */
  invoiceDate: string;
  currency: string;
  total: number;
  monthLabel: string;
  customerCode: string;
  customerName: string;
  customerAddressLines: string[];
  customerTradingPartnerId: string;
  paymentTerms: string;
  cancelReason: string;
  createdBy: string;
  createdOn: string;
  /**
   * When the record last changed. Only a cancellation changes an issued invoice (nothing else writes
   * it), so on a cancelled invoice this is when it was cancelled - to the minute, which
   * `hi_cancelledon` (a date) cannot say.
   */
  modifiedOn: string;
  /** Page 2, when the invoice has one. */
  statement: Statement | null;
}

export function mapDataverseToInvoice(record: Record<string, unknown>): SavedInvoice {
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  const num = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : 0);
  return {
    id: text(INVOICE_FIELDS.id),
    number: text(INVOICE_FIELDS.number),
    fiscalYear: num(INVOICE_FIELDS.fiscalYear),
    sequence: num(INVOICE_FIELDS.sequence),
    title: titleFromValue(record[INVOICE_FIELDS.title]),
    status: statusFromValue(record[INVOICE_FIELDS.status]),
    invoiceDate: text(INVOICE_FIELDS.invoiceDate).slice(0, 10),
    currency: text(INVOICE_FIELDS.currency) || "JPY",
    total: num(INVOICE_FIELDS.total),
    monthLabel: text(INVOICE_FIELDS.monthLabel),
    customerCode: text(INVOICE_FIELDS.customerCode),
    customerName: text(INVOICE_FIELDS.customerName),
    customerAddressLines: text(INVOICE_FIELDS.customerAddress)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    customerTradingPartnerId: text(INVOICE_FIELDS.customerTradingPartnerId),
    paymentTerms: text(INVOICE_FIELDS.paymentTerms),
    cancelReason: text(INVOICE_FIELDS.cancelReason),
    createdBy: text("_createdby_value@OData.Community.Display.V1.FormattedValue"),
    createdOn: text("createdon"),
    modifiedOn: text("modifiedon"),
    statement: parseStoredStatement(record[INVOICE_FIELDS.statement], num(INVOICE_FIELDS.total), text(INVOICE_FIELDS.customerCode)),
  };
}

/** One document to issue, as the screen posts it. */
export interface IssueRequestItem {
  /** Excel "Claim to" label - finds the customer. */
  claimTo: string;
  title: InvoiceTitle;
  /** What the invoice prints in its Description column. */
  description: string;
  /** Whole yen, greater than zero. */
  amount: number;
  /** Page 2, for an invoice that carries its breakdown (R&D reimbursement). */
  statement?: Statement;
}

export interface IssueRequest {
  /** `2026-10-31` */
  invoiceDate: string;
  /** `Oct-26` */
  monthLabel: string;
  items: IssueRequestItem[];
}

export type IssueValidation = { ok: true; value: IssueRequest } | { ok: false; error: string };

/** Max documents in one request - a month's claim sheet has a dozen rows. */
export const MAX_ISSUE_ITEMS = 50;

export function validateIssueRequest(body: unknown): IssueValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "The request body is not valid." };
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const invoiceDate = str(b.invoiceDate);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoiceDate);
  if (!m || Number.isNaN(Date.parse(invoiceDate))) return { ok: false, error: "The invoice date is not valid." };
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return { ok: false, error: "The invoice date is out of range." };

  const monthLabel = str(b.monthLabel);
  if (!monthLabel || monthLabel.length > INVOICE_LIMITS.monthLabel) return { ok: false, error: "The claim month is not valid." };

  if (!Array.isArray(b.items) || b.items.length === 0) return { ok: false, error: "Nothing to issue." };
  if (b.items.length > MAX_ISSUE_ITEMS) return { ok: false, error: `At most ${MAX_ISSUE_ITEMS} documents at a time.` };

  const items: IssueRequestItem[] = [];
  const seen = new Set<string>();
  for (const raw of b.items) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "A row is not valid." };
    const r = raw as Record<string, unknown>;
    const claimTo = str(r.claimTo);
    if (!claimTo) return { ok: false, error: "A row has no customer code." };
    const description = str(r.description);
    if (!description || description.length > INVOICE_LIMITS.description) {
      return { ok: false, error: `The description for ${claimTo} is not valid.` };
    }
    // One company may be charged for several things in a month (patent and its new-business part).
    const key = `${claimTo.toLowerCase()}\u0000${description.toLowerCase()}`;
    if (seen.has(key)) return { ok: false, error: `${claimTo} appears twice with the same description.` };
    seen.add(key);
    if (r.title !== "INVOICE" && r.title !== "DEBIT NOTE") return { ok: false, error: `Choose a title for ${claimTo}.` };
    const amount = r.amount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > 9_999_999_999) {
      return { ok: false, error: `The amount for ${claimTo} is not valid.` };
    }
    let statement: Statement | undefined;
    if (r.statement !== undefined && r.statement !== null) {
      const checked = validateStatement(r.statement, amount, claimTo);
      if (!checked.ok) return { ok: false, error: `${claimTo}: ${checked.error}` };
      statement = checked.value;
    }
    items.push({ claimTo, title: r.title, description, amount, ...(statement ? { statement } : {}) });
  }
  return { ok: true, value: { invoiceDate, monthLabel, items } };
}
