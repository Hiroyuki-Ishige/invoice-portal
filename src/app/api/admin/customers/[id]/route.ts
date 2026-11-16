/**
 * Admin Customer Detail API
 *
 * PATCH:  change a customer
 * DELETE: remove a customer
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  deleteDataverseRecord,
  queryDataverseAll,
  sanitizeODataString,
  updateDataverseRecord,
  validateUUID,
} from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea } from "@/lib/auth/require-signed-in";
import {
  CUSTOMER_ENTITY_SET,
  CUSTOMER_FIELDS,
  customerToDataverse,
  validateCustomerInput,
} from "@/lib/invoice/customer-record";
import { handleApiError } from "@/lib/utils/api-helpers";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const check = await checkArea("admin-customers", "edit");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { id } = await params;
    if (!validateUUID(id)) return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });

    const parsed = validateCustomerInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Renaming a code onto another customer's would make the claim sheet ambiguous.
    const clash = await queryDataverseAll<Record<string, unknown>>(token, CUSTOMER_ENTITY_SET, {
      filter: `${CUSTOMER_FIELDS.code} eq '${sanitizeODataString(parsed.value.code)}' and ${CUSTOMER_FIELDS.id} ne ${id}`,
    });
    if (clash.length > 0) {
      return NextResponse.json({ error: `A customer with the code ${parsed.value.code} already exists.` }, { status: 409 });
    }

    await updateDataverseRecord(token, CUSTOMER_ENTITY_SET, id, customerToDataverse(parsed.value));
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Admin Customers API PATCH");
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const check = await checkArea("admin-customers", "edit");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { id } = await params;
    if (!validateUUID(id)) return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });

    await deleteDataverseRecord(token, CUSTOMER_ENTITY_SET, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Admin Customers API DELETE");
  }
}
