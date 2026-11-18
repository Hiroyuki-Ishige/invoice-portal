/**
 * Admin Invoice Numbers API (Admin > Setup)
 *
 * GET: the last number used, per fiscal year
 * PUT: `{ fiscalYear, last }` - set it. Used once to say where the hand-numbered invoices
 *      stopped (e.g. FY2026 is at 182 -> the next is 183). It never goes backwards.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { areaDeniedResponse, checkArea } from "@/lib/auth/require-signed-in";
import { MAX_SEQUENCE } from "@/lib/invoice/invoice-record";
import { SequenceError, listSequences, setLastSequence } from "@/lib/invoice/sequence";
import { handleApiError } from "@/lib/utils/api-helpers";

export async function GET() {
  try {
    const check = await checkArea("admin-setup", "read");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;
    return NextResponse.json({ sequences: await listSequences(token), max: MAX_SEQUENCE });
  } catch (error) {
    return handleApiError(error, "Invoice sequence API GET");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const check = await checkArea("admin-setup", "edit");
    if (!check.user) return areaDeniedResponse(check);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const body = (await request.json().catch(() => null)) as { fiscalYear?: unknown; last?: unknown } | null;
    const fiscalYear = body?.fiscalYear;
    const last = body?.last;
    if (typeof fiscalYear !== "number" || !Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      return NextResponse.json({ error: "The fiscal year is not valid." }, { status: 400 });
    }
    if (typeof last !== "number" || !Number.isInteger(last) || last < 0 || last > MAX_SEQUENCE) {
      return NextResponse.json({ error: `The number must be between 0 and ${MAX_SEQUENCE}.` }, { status: 400 });
    }

    try {
      await setLastSequence(token, fiscalYear, last);
    } catch (error) {
      if (error instanceof SequenceError) return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Invoice sequence API PUT");
  }
}
