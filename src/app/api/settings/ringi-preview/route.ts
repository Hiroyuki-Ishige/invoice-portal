/**
 * **The Ringi preview** (`lib/auth/ringi-preview`) - on or off, and who the
 * trial members are. Set from Admin > User Management.
 *
 * GET: any signed-in caller - the menu, the dashboard and the ringi screens ask
 * whether to offer the ringi, and the ringi screens ask which recipients a mail
 * may reach without a `[TEST]` mark. What a caller gets back:
 *
 * - `enabled`, `isMember`, `readable` - everybody;
 * - `memberAddresses` - only a trial member or an admin, while the preview is
 *   on (they are the only ones who can send ringi mail); `null` when the
 *   profiles could not be read, which the browser treats as "mark it";
 * - `memberIds` - admins only, for the ticks on User Management.
 *
 * PUT: Admin only, like every other write on User Management -
 * `{ enabled: boolean }` switches it, `{ profileId, member }` ticks one person.
 * The first switch-on with no list yet seeds it with every active profile of
 * that moment (the trial members were the registered users, 2026-10-02).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  areaDeniedResponse,
  callerProfiles,
  checkAdmin,
  checkArea,
  deniedResponse,
  isSuperAdmin,
} from "@/lib/auth/require-signed-in";
import { isProfileId, isRingiMember, type RingiPreviewSetting } from "@/lib/auth/ringi-preview";
import { allProfiles, memberAddresses, ringiPreview, saveRingiPreview } from "@/lib/settings/ringi-preview";
import { handleApiError } from "@/lib/utils/api-helpers";

export async function GET() {
  try {
    const caller = await callerProfiles();
    if (!caller) return deniedResponse("not_signed_in");
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
    if (!token) return deniedResponse("not_signed_in");

    const { setting, readable } = await ringiPreview(token);
    const isAdmin = isSuperAdmin(caller.user) || caller.profiles.some((profile) => profile.role === "admin");
    const isMember = isAdmin || isRingiMember(setting, caller.profiles);

    let addresses: string[] | null = null;
    if (setting.enabled && isMember) {
      try {
        addresses = memberAddresses(setting, await allProfiles(token));
      } catch (error) {
        // Not a failure of the request: the browser marks every message instead.
        console.warn("[Ringi Preview API] The profiles could not be read:", error instanceof Error ? error.message : error);
      }
    }

    return NextResponse.json({
      enabled: setting.enabled,
      isMember,
      readable,
      memberAddresses: addresses,
      memberIds: isAdmin ? setting.members ?? [] : null,
    });
  } catch (error) {
    return handleApiError(error, "Ringi Preview API");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const roleGate = await checkArea("admin-users", "edit");
    if (!roleGate.user) return areaDeniedResponse(roleGate);
    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);
    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    const body = (await request.json().catch(() => null)) as
      | { enabled?: unknown; profileId?: unknown; member?: unknown }
      | null;
    const switching = typeof body?.enabled === "boolean";
    const ticking = isProfileId(body?.profileId) && typeof body?.member === "boolean";
    if (!body || switching === ticking) {
      return NextResponse.json(
        { error: "Send either { enabled } or { profileId, member }." },
        { status: 400 }
      );
    }

    /* Never save over a setting this server could not read: the list on screen
       would be a guess, and the save would replace the real one with it. */
    const current = await ringiPreview(token);
    if (!current.readable) {
      return NextResponse.json(
        { error: "The saved setting could not be read, so it was not overwritten. Try again in a moment." },
        { status: 503 }
      );
    }

    let next: RingiPreviewSetting;
    if (switching) {
      const enabled = body.enabled === true;
      let members = current.setting.members;
      if (enabled && members === null) {
        const profiles = await allProfiles(token);
        members = profiles.filter((profile) => profile.isActive).map((profile) => profile.id);
      }
      next = { enabled, members };
    } else {
      const id = (body.profileId as string).toLowerCase();
      const members = new Set(current.setting.members ?? []);
      if (body.member === true) members.add(id);
      else members.delete(id);
      next = { ...current.setting, members: [...members] };
    }

    await saveRingiPreview(token, next, admin.user.email);
    console.log(
      `[Ringi Preview API] ${switching ? `Preview switched ${next.enabled ? "on" : "off"}` : "Member list changed"} by ${admin.user.email}`
    );
    return NextResponse.json({ enabled: next.enabled, memberIds: next.members ?? [] });
  } catch (error) {
    return handleApiError(error, "Ringi Preview API");
  }
}
