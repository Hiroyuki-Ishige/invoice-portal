/**
 * Admin Mail Notifications API
 *
 * PATCH: set who is mailed (To) and copied (Cc) when an invoice for this customer is issued.
 *
 * Its own route and its own area (`admin-notifications`), not the customer's PATCH: Admin and
 * F&A-Admin keep this list, and only Admin may change what a customer is. It writes these two
 * columns and nothing else.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { updateDataverseRecord, validateUUID } from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea } from "@/lib/auth/require-signed-in";
import { CUSTOMER_ENTITY_SET, notifyToDataverse, validateNotifyInput } from "@/lib/invoice/customer-record";
import { isNotifiableAddress } from "@/lib/notify/route-notification";
import { handleApiError } from "@/lib/utils/api-helpers";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const check = await checkArea("admin-notifications", "edit");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { id } = await params;
    if (!validateUUID(id)) return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });

    const parsed = validateNotifyInput(await request.json().catch(() => null), isNotifiableAddress);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    await updateDataverseRecord(token, CUSTOMER_ENTITY_SET, id, notifyToDataverse(parsed.value));
    return NextResponse.json({ success: true, to: parsed.value.to, cc: parsed.value.cc });
  } catch (error) {
    return handleApiError(error, "Admin Notifications API PATCH");
  }
}
