/**
 * **The role permission table** (Admin > Role Permissions; the table itself is
 * `lib/auth/permissions`, its storage `lib/settings/role-permissions`).
 *
 * GET: any signed-in caller - the menu and every screen read it to decide
 * what to offer. It says what each role may do, which is no secret from the
 * people it applies to.
 *
 * PUT: Admin only - the Role Permissions row is fixed to Admin for every role,
 * so `checkArea` answers that; `checkAdmin` is asked as well, because a table
 * that grants itself must not be the only thing guarding its own save.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { areaDeniedResponse, checkAdmin, checkArea, deniedResponse, requireSignedIn } from "@/lib/auth/require-signed-in";
import { parsePermissions } from "@/lib/auth/permissions";
import { ROLE_PERMISSIONS_KEY, clearRolePermissionsCache, rolePermissions } from "@/lib/settings/role-permissions";
import { APPSETTING_ENTITY_SET } from "@/lib/settings/budget-period";
import { createDataverseRecord, queryDataverseRawAll, updateDataverseRecord } from "@/lib/providers/dataverse/client";
import { handleApiError } from "@/lib/utils/api-helpers";

export async function GET() {
  try {
    const user = await requireSignedIn();
    if (!user) return deniedResponse("not_signed_in");
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
    if (!token) return deniedResponse("not_signed_in");

    const { table, stored, readable } = await rolePermissions(token);
    /* `readable: false` - the table could not be read, and what comes back is
       the defaults standing in. The admin screen must not save over it. */
    return NextResponse.json({ table, isDefault: !stored, readable });
  } catch (error) {
    return handleApiError(error, "Role Permissions API");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const roleGate = await checkArea("admin-role-permissions", "edit");
    if (!roleGate.user) return areaDeniedResponse(roleGate);
    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;
    const body = (await request.json().catch(() => null)) as { table?: unknown } | null;
    if (!body || !body.table || typeof body.table !== "object") {
      return NextResponse.json({ error: "A permission table is required." }, { status: 400 });
    }
    // Rebuilt cell by cell from the known roles and screens, the fixed cells
    // put back - what the request says is not what gets stored (rule 36).
    const table = parsePermissions(body.table);

    /* Never save over a table this server could not read: what the screen
       showed was the defaults standing in, not the table (review, 2026-09-28). */
    const current = await rolePermissions(token);
    if (!current.readable) {
      return NextResponse.json(
        { error: "The saved table could not be read, so it was not overwritten. Try again in a moment.", code: "TABLE_UNREADABLE" },
        { status: 503 }
      );
    }

    // Upsert by key: one row per setting, or "the" table becomes ambiguous.
    const existing = await queryDataverseRawAll<Record<string, unknown>>(
      token,
      `${APPSETTING_ENTITY_SET}?$select=hi_appsettingid&$filter=hi_settingkey eq '${ROLE_PERMISSIONS_KEY}'`
    );
    const value = { hi_settingvalue: JSON.stringify(table), hi_updatedby: admin.user.email };
    const existingId = existing[0]?.hi_appsettingid;
    if (typeof existingId === "string") {
      await updateDataverseRecord(token, APPSETTING_ENTITY_SET, existingId, value);
    } else {
      await createDataverseRecord(token, APPSETTING_ENTITY_SET, { hi_settingkey: ROLE_PERMISSIONS_KEY, ...value });
    }

    // Every route asks this table on every write; a change must not wait out
    // the five-minute cache.
    clearRolePermissionsCache();
    console.log(`[Role Permissions API] Table saved by ${admin.user.email}`);
    return NextResponse.json({ success: true, table, isDefault: false });
  } catch (error) {
    return handleApiError(error, "Role Permissions API");
  }
}
