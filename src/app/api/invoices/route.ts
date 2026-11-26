/**
 * Invoices API
 *
 * GET:  saved invoices, newest first (optional `status`)
 * POST: issue invoices from the claim sheet - takes the next numbers, saves header and line
 *       for each, returns what was saved and what failed
 *
 * The saved data is the record; the PDF is rebuilt from it (`docs/invoice-design.md`).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  createDataverseRecord,
  deleteDataverseRecord,
  queryDataverseAll,
} from "@/lib/providers/dataverse/client";
import { getNavigationPropertyNames } from "@/lib/providers/dataverse/navigation-properties";
import { areaDeniedResponse, checkArea, deniedResponse } from "@/lib/auth/require-signed-in";
import { invoiceScopeOfCaller, scopeAllows, scopeFilter } from "@/lib/auth/invoice-scope";
import { CUSTOMER_ENTITY_SET, mapDataverseToCustomer } from "@/lib/invoice/customer-record";
import { fiscalYearOf } from "@/lib/invoice/dates";
import { formatInvoiceNumber } from "@/lib/invoice/invoice-number";
import {
  INVOICE_ENTITY_SET,
  INVOICE_FIELDS,
  LINE_ENTITY_SET,
  LINE_FIELDS,
  LINE_INVOICE_LOOKUP,
  LINE_LOGICAL_NAME,
  STATUS_VALUES,
  TITLE_VALUES,
  mapDataverseToInvoice,
  validateIssueRequest,
  type SavedInvoice,
} from "@/lib/invoice/invoice-record";
import { SequenceError, takeNumbers } from "@/lib/invoice/sequence";
import { handleApiError } from "@/lib/utils/api-helpers";

/** A list shows the newest this many and says so when there are more (rule 44). */
const LIST_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const check = await checkArea("invoices", "read");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const status = request.nextUrl.searchParams.get("status");
    const statusValue = status && status in STATUS_VALUES ? STATUS_VALUES[status as keyof typeof STATUS_VALUES] : null;

    // A User sees only the companies registered to them; Admin and F&A Admin see all (`invoice-scope.ts`).
    const scope = await invoiceScopeOfCaller();
    if (!scope) return deniedResponse("not_permitted");
    if (!scope.all && scope.codes.length === 0) return NextResponse.json({ invoices: [], truncated: false, limit: LIST_LIMIT });
    const conditions = [
      statusValue === null ? null : `${INVOICE_FIELDS.status} eq ${statusValue}`,
      scopeFilter(scope, INVOICE_FIELDS.customerCode),
    ].filter((c): c is string => c !== null);

    // One more than shown, to know whether the list was cut off.
    const records = await queryDataverseAll<Record<string, unknown>>(token, INVOICE_ENTITY_SET, {
      filter: conditions.length > 0 ? conditions.join(" and ") : undefined,
      orderby: `${INVOICE_FIELDS.fiscalYear} desc,${INVOICE_FIELDS.sequence} desc`,
      top: LIST_LIMIT + 1,
    });
    const invoices = records.slice(0, LIST_LIMIT).map(mapDataverseToInvoice).filter((i) => scopeAllows(scope, i.customerCode));
    return NextResponse.json({ invoices, truncated: records.length > LIST_LIMIT, limit: LIST_LIMIT });
  } catch (error) {
    return handleApiError(error, "Invoices API GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await checkArea("invoices", "edit");
    if (!check.user) return areaDeniedResponse(check);
    // Issuing is for those who see every company (Admin, F&A Admin). A User given Edit in Role Permissions
    // still sees only their own companies, so must not issue documents addressed to others.
    const scope = await invoiceScopeOfCaller();
    if (!scope) return deniedResponse("not_permitted");
    if (!scope.all) {
      return NextResponse.json({ error: "Only an Admin or F&A Admin may issue invoices.", code: "ROLE_PERMISSION" }, { status: 403 });
    }
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const parsed = validateIssueRequest(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const req = parsed.value;

    const customers = new Map(
      (await queryDataverseAll<Record<string, unknown>>(token, CUSTOMER_ENTITY_SET))
        .map(mapDataverseToCustomer)
        .map((customer) => [customer.code.toLowerCase(), customer] as const)
    );
    const unknown = req.items.filter((item) => !customers.has(item.claimTo.toLowerCase()));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `No customer is registered with the code ${[...new Set(unknown.map((i) => i.claimTo))].join(", ")}.` },
        { status: 400 }
      );
    }

    const [year, month] = req.invoiceDate.split("-").map(Number);
    const fiscalYear = fiscalYearOf({ year, month });

    let first: number;
    try {
      first = await takeNumbers(token, fiscalYear, req.items.length);
    } catch (error) {
      if (error instanceof SequenceError) {
        return NextResponse.json({ error: error.message, code: `SEQUENCE_${error.code.toUpperCase()}` }, { status: 409 });
      }
      throw error;
    }

    const lineNav = (await getNavigationPropertyNames(token, LINE_LOGICAL_NAME)).get(LINE_INVOICE_LOOKUP);
    if (!lineNav) {
      return NextResponse.json(
        { error: "The invoice tables are incomplete (the line has no link to its invoice). Run Admin > Setup first." },
        { status: 409 }
      );
    }

    const saved: SavedInvoice[] = [];
    /** Which request item each saved invoice came from - a company can appear twice, so the code cannot say. */
    const itemIndexes: number[] = [];
    const failed: Array<{ claimTo: string; index: number; error: string }> = [];

    // One at a time and in order, so the numbers are in the order of the sheet.
    for (const [index, item] of req.items.entries()) {
      const customer = customers.get(item.claimTo.toLowerCase())!;
      const sequence = first + index;
      let headerId: string | null = null;
      try {
        const header = await createDataverseRecord<Record<string, unknown>>(token, INVOICE_ENTITY_SET, {
          [INVOICE_FIELDS.number]: formatInvoiceNumber(fiscalYear, sequence),
          [INVOICE_FIELDS.fiscalYear]: fiscalYear,
          [INVOICE_FIELDS.sequence]: sequence,
          [INVOICE_FIELDS.title]: TITLE_VALUES[item.title],
          [INVOICE_FIELDS.status]: STATUS_VALUES.issued,
          [INVOICE_FIELDS.invoiceDate]: req.invoiceDate,
          [INVOICE_FIELDS.currency]: "JPY",
          [INVOICE_FIELDS.total]: item.amount,
          [INVOICE_FIELDS.monthLabel]: req.monthLabel,
          [INVOICE_FIELDS.customerCode]: customer.code,
          [INVOICE_FIELDS.customerName]: customer.name,
          [INVOICE_FIELDS.customerAddress]: customer.addressLines.join("\n"),
          [INVOICE_FIELDS.customerTradingPartnerId]: customer.tradingPartnerId,
          [INVOICE_FIELDS.paymentTerms]: customer.paymentTerms,
          // Only when there is a page 2: a one-page invoice must still save before the column is topped up.
          ...(item.statement ? { [INVOICE_FIELDS.statement]: JSON.stringify(item.statement) } : {}),
        });
        headerId = String(header[INVOICE_FIELDS.id]);

        await createDataverseRecord(token, LINE_ENTITY_SET, {
          [LINE_FIELDS.description]: item.description,
          [LINE_FIELDS.lineNo]: 1,
          [LINE_FIELDS.amount]: item.amount,
          [LINE_FIELDS.sourceRow]: item.claimTo,
          [`${lineNav}@odata.bind`]: `/${INVOICE_ENTITY_SET}(${headerId})`,
        });
        saved.push(mapDataverseToInvoice(header));
        itemIndexes.push(index);
      } catch (error) {
        console.error(`[Invoices API] Could not save ${item.claimTo}:`, error);
        // A header without its line is not an invoice: take it back if possible.
        if (headerId) await deleteDataverseRecord(token, INVOICE_ENTITY_SET, headerId).catch(() => undefined);
        const missingColumn = item.statement && String((error as { detail?: unknown })?.detail ?? error).includes(INVOICE_FIELDS.statement);
        failed.push({
          claimTo: item.claimTo,
          index,
          error: missingColumn
            ? "The invoice table has no column for the statement page yet. Run Admin > Setup > Invoice tables (Top up) first."
            : "It could not be saved.",
        });
      }
    }

    return NextResponse.json({ invoices: saved, itemIndexes, failed }, { status: failed.length === 0 ? 201 : 207 });
  } catch (error) {
    return handleApiError(error, "Invoices API POST");
  }
}
