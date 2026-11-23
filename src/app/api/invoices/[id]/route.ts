/**
 * Invoice Detail API
 *
 * GET: one saved invoice with its lines - what the PDF is rebuilt from
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { queryDataverseAll, validateUUID } from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea, deniedResponse } from "@/lib/auth/require-signed-in";
import { invoiceScopeOfCaller, scopeAllows } from "@/lib/auth/invoice-scope";
import {
  INVOICE_ENTITY_SET,
  INVOICE_FIELDS,
  LINE_ENTITY_SET,
  LINE_FIELDS,
  LINE_INVOICE_LOOKUP,
  mapDataverseToInvoice,
} from "@/lib/invoice/invoice-record";
import { handleApiError } from "@/lib/utils/api-helpers";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const check = await checkArea("invoices", "read");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { id } = await params;
    if (!validateUUID(id)) return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });

    const headers = await queryDataverseAll<Record<string, unknown>>(token, INVOICE_ENTITY_SET, {
      filter: `${INVOICE_FIELDS.id} eq ${id}`,
    });
    if (headers.length === 0) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    // A User may open only the invoices of the companies registered to them - and is told "not found"
    // for the rest, the same as for an id that does not exist.
    const scope = await invoiceScopeOfCaller();
    if (!scope) return deniedResponse("not_permitted");
    if (!scopeAllows(scope, mapDataverseToInvoice(headers[0]).customerCode)) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const lines = await queryDataverseAll<Record<string, unknown>>(token, LINE_ENTITY_SET, {
      filter: `_${LINE_INVOICE_LOOKUP}_value eq ${id}`,
      orderby: `${LINE_FIELDS.lineNo} asc`,
    });
    return NextResponse.json({
      invoice: mapDataverseToInvoice(headers[0]),
      lines: lines.map((line) => ({
        description: String(line[LINE_FIELDS.description] ?? ""),
        amount: Number(line[LINE_FIELDS.amount] ?? 0),
      })),
    });
  } catch (error) {
    return handleApiError(error, "Invoice API GET");
  }
}
