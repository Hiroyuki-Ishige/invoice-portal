/**
 * Admin Customers API
 *
 * POST: register a customer (Admin > Customers)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { createDataverseRecord, queryDataverseAll, sanitizeODataString } from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea } from "@/lib/auth/require-signed-in";
import {
  CUSTOMER_ENTITY_SET,
  CUSTOMER_FIELDS,
  customerToDataverse,
  mapDataverseToCustomer,
  validateCustomerInput,
} from "@/lib/invoice/customer-record";
import { handleApiError } from "@/lib/utils/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const check = await checkArea("admin-customers", "edit");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const parsed = validateCustomerInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // The code is how the claim sheet's "Claim to" finds a customer, so it must be unique.
    // Dataverse compares strings without regard to case, which is what is wanted here.
    const existing = await queryDataverseAll<Record<string, unknown>>(token, CUSTOMER_ENTITY_SET, {
      filter: `${CUSTOMER_FIELDS.code} eq '${sanitizeODataString(parsed.value.code)}'`,
    });
    if (existing.length > 0) {
      return NextResponse.json({ error: `A customer with the code ${parsed.value.code} already exists.` }, { status: 409 });
    }

    const created = await createDataverseRecord<Record<string, unknown>>(
      token,
      CUSTOMER_ENTITY_SET,
      customerToDataverse(parsed.value)
    );
    return NextResponse.json({ customer: mapDataverseToCustomer(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Admin Customers API POST");
  }
}
