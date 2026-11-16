/**
 * Customers API (read)
 *
 * GET: every customer, by code. Asked by the invoice screen to address a document and by
 * Admin > Customers to list them, so the gate is the lighter of the two: whoever may open
 * Invoices may read the master. Writing is `/api/admin/customers`.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { queryDataverseAll } from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea } from "@/lib/auth/require-signed-in";
import { CUSTOMER_ENTITY_SET, CUSTOMER_FIELDS, mapDataverseToCustomer } from "@/lib/invoice/customer-record";
import { handleApiError } from "@/lib/utils/api-helpers";

export async function GET() {
  try {
    const check = await checkArea("invoices", "read");
    if (!check.user) return areaDeniedResponse(check);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;
    const records = await queryDataverseAll<Record<string, unknown>>(token, CUSTOMER_ENTITY_SET, {
      orderby: `${CUSTOMER_FIELDS.code} asc`,
    });
    const customers = records.map(mapDataverseToCustomer);
    return NextResponse.json({ customers, count: customers.length });
  } catch (error) {
    return handleApiError(error, "Customers API GET");
  }
}
