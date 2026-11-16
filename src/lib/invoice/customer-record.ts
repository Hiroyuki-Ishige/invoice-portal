/**
 * The customer master - the companies an invoice is addressed to - as Dataverse stores it
 * (`hi_invoicecustomer`) and as the screens and routes pass it around.
 *
 * One file for the field names, the mapping and the validation, so the setup route that builds
 * the table, the routes that write it and the screens that edit it cannot describe three
 * different tables (rule 5). No imports from the Dataverse client: the admin screen reads the
 * limits from here and must not carry the client.
 */

export const CUSTOMER_ENTITY_SET = "hi_invoicecustomers";
export const CUSTOMER_LOGICAL_NAME = "hi_invoicecustomer";

export const CUSTOMER_FIELDS = {
  id: "hi_invoicecustomerid",
  /** The primary name: the label in the claim sheet's "Claim to" column (`HLAM`, `HOMS-J`...). */
  code: "hi_code",
  name: "hi_name",
  address1: "hi_addressline1",
  address2: "hi_addressline2",
  address3: "hi_addressline3",
  tradingPartnerId: "hi_tradingpartnerid",
  paymentTerms: "hi_paymentterms",
} as const;

/** Column limits - the table is built with these and the routes refuse what exceeds them. */
export const CUSTOMER_LIMITS = {
  code: 50,
  name: 200,
  addressLine: 200,
  tradingPartnerId: 100,
  paymentTerms: 100,
} as const;

/** The printed address has room for this many lines (the PDF's "To:" block). */
export const MAX_ADDRESS_LINES = 3;

export const DEFAULT_PAYMENT_TERMS = "Bank Transfer";

export interface CustomerInput {
  code: string;
  name: string;
  /** One printed line each, 1 to `MAX_ADDRESS_LINES`, none empty. */
  addressLines: string[];
  /** As printed after "Trading Partner ID:", e.g. `HOGT(ex-A412)`. */
  tradingPartnerId: string;
  paymentTerms: string;
}

export interface Customer extends CustomerInput {
  id: string;
}

export function mapDataverseToCustomer(record: Record<string, unknown>): Customer {
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  return {
    id: text(CUSTOMER_FIELDS.id),
    code: text(CUSTOMER_FIELDS.code),
    name: text(CUSTOMER_FIELDS.name),
    addressLines: [CUSTOMER_FIELDS.address1, CUSTOMER_FIELDS.address2, CUSTOMER_FIELDS.address3]
      .map(text)
      .filter((line) => line.trim() !== ""),
    tradingPartnerId: text(CUSTOMER_FIELDS.tradingPartnerId),
    paymentTerms: text(CUSTOMER_FIELDS.paymentTerms) || DEFAULT_PAYMENT_TERMS,
  };
}

/** Every address column is written - an emptied line must clear, not keep its old text. */
export function customerToDataverse(input: CustomerInput): Record<string, unknown> {
  return {
    [CUSTOMER_FIELDS.code]: input.code,
    [CUSTOMER_FIELDS.name]: input.name,
    [CUSTOMER_FIELDS.address1]: input.addressLines[0] ?? null,
    [CUSTOMER_FIELDS.address2]: input.addressLines[1] ?? null,
    [CUSTOMER_FIELDS.address3]: input.addressLines[2] ?? null,
    [CUSTOMER_FIELDS.tradingPartnerId]: input.tradingPartnerId,
    [CUSTOMER_FIELDS.paymentTerms]: input.paymentTerms,
  };
}

export type CustomerValidation = { ok: true; value: CustomerInput } | { ok: false; error: string };

/**
 * Check a request body (or a form) and return the cleaned customer.
 * Takes `unknown`: nothing about a body is known to be a string, an array or even an object.
 */
export function validateCustomerInput(body: unknown): CustomerValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "The request body is not valid." };
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const code = str(b.code);
  if (!code) return { ok: false, error: "Code is required." };
  if (code.length > CUSTOMER_LIMITS.code) return { ok: false, error: `Code is limited to ${CUSTOMER_LIMITS.code} characters.` };

  const name = str(b.name);
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > CUSTOMER_LIMITS.name) return { ok: false, error: `Name is limited to ${CUSTOMER_LIMITS.name} characters.` };

  const rawLines = Array.isArray(b.addressLines) ? b.addressLines : [];
  const addressLines = rawLines.map(str).filter((line) => line !== "");
  if (addressLines.length === 0) return { ok: false, error: "At least one address line is required." };
  if (addressLines.length > MAX_ADDRESS_LINES) {
    return { ok: false, error: `The address is limited to ${MAX_ADDRESS_LINES} lines.` };
  }
  if (addressLines.some((line) => line.length > CUSTOMER_LIMITS.addressLine)) {
    return { ok: false, error: `Each address line is limited to ${CUSTOMER_LIMITS.addressLine} characters.` };
  }

  const tradingPartnerId = str(b.tradingPartnerId);
  if (!tradingPartnerId) return { ok: false, error: "Trading Partner ID is required." };
  if (tradingPartnerId.length > CUSTOMER_LIMITS.tradingPartnerId) {
    return { ok: false, error: `Trading Partner ID is limited to ${CUSTOMER_LIMITS.tradingPartnerId} characters.` };
  }

  const paymentTerms = str(b.paymentTerms) || DEFAULT_PAYMENT_TERMS;
  if (paymentTerms.length > CUSTOMER_LIMITS.paymentTerms) {
    return { ok: false, error: `Payment terms are limited to ${CUSTOMER_LIMITS.paymentTerms} characters.` };
  }

  return { ok: true, value: { code, name, addressLines, tradingPartnerId, paymentTerms } };
}
