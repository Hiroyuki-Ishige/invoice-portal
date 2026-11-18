/**
 * Invoice Cancel API
 *
 * POST: cancel an issued invoice. The number stays (never reused) and the record stays as
 * Cancelled. Admin, F&A-Admin and Invoice preparer only (`mayCancelInvoices`).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { DataverseError, queryDataverseAll, updateDataverseRecord, validateUUID } from "@/lib/providers/dataverse/client";
import { areaDeniedResponse, checkArea, checkMayCancelInvoices, deniedResponse } from "@/lib/auth/require-signed-in";
import {
  INVOICE_ENTITY_SET,
  INVOICE_FIELDS,
  INVOICE_LIMITS,
  STATUS_VALUES,
  statusFromValue,
} from "@/lib/invoice/invoice-record";
import { handleApiError } from "@/lib/utils/api-helpers";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    // The role table first (the screen), then who may cancel (the right).
    const area = await checkArea("invoices", "edit");
    if (!area.user) return areaDeniedResponse(area);
    const who = await checkMayCancelInvoices();
    if (!who.user) {
      return who.reason === "not_signed_in"
        ? deniedResponse("not_signed_in")
        : NextResponse.json(
            { error: "Only an Admin, F&A-Admin or Invoice preparer may cancel an invoice.", code: "ROLE_PERMISSION" },
            { status: 403 }
          );
    }
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const { id } = await params;
    if (!validateUUID(id)) return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });

    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });
    if (reason.length > INVOICE_LIMITS.cancelReason) {
      return NextResponse.json({ error: `The reason is limited to ${INVOICE_LIMITS.cancelReason} characters.` }, { status: 400 });
    }

    const rows = await queryDataverseAll<Record<string, unknown>>(token, INVOICE_ENTITY_SET, {
      filter: `${INVOICE_FIELDS.id} eq ${id}`,
      select: [INVOICE_FIELDS.id, INVOICE_FIELDS.status],
    });
    if (rows.length === 0) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (statusFromValue(rows[0][INVOICE_FIELDS.status]) !== "issued") {
      return NextResponse.json({ error: "Only an issued invoice can be cancelled." }, { status: 409 });
    }

    try {
      // Conditional on the version read: two people cancelling at once is one cancel.
      const etag = rows[0]["@odata.etag"];
      await updateDataverseRecord(
        token,
        INVOICE_ENTITY_SET,
        id,
        {
          [INVOICE_FIELDS.status]: STATUS_VALUES.cancelled,
          [INVOICE_FIELDS.cancelReason]: reason,
          [INVOICE_FIELDS.cancelledOn]: new Date().toISOString().slice(0, 10),
        },
        typeof etag === "string" ? etag : "*"
      );
    } catch (error) {
      if (error instanceof DataverseError && error.status === 412) {
        return NextResponse.json({ error: "The invoice was changed by somebody else. Reload and try again." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Invoice cancel API");
  }
}
