/**
 * Admin User Detail API Route
 *
 * GET: Get a single user profile
 * PATCH: Update user profile (role, isActive)
 * DELETE: Remove the profile record
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  deleteDataverseRecord,
  queryDataverseAll,
  sanitizeODataString,
  validateUUID,
} from "@/lib/providers/dataverse/client";
import {
  mapDataverseToUserProfile,
  mapUserProfileToDataverse,
  sanitizeEntityAccess,
  SUPER_ADMIN_EMAILS,
  USER_PROFILE_FIELDS,
  isUserRole,
  type EntityAccess,
  type UserRole,
} from "@/lib/types/user-profile";
import {
  checkAdmin,
  clearRoleCache,
  deniedResponse,
  isCallerAddress,
  isSuperAdmin,
} from "@/lib/auth/require-signed-in";
/* Registering, deactivating or deleting somebody changes the answer the
   middleware gate caches, so the two caches are cleared together - a
   registration that takes effect in one place and not the other is the
   screen and the server disagreeing about who is let in (rule 5). */
import { clearRegistrationCache } from "@/lib/auth/registration";
import { updateProfileRecord, missingColumnWarning } from "@/lib/auth/user-profile-write";
import { handleApiError } from "@/lib/utils/api-helpers";

const ENTITY_SET = "hi_userprofiles";

/**
 * Whether deleting this profile is undone by the next sign-in.
 *
 * Being on `SUPER_ADMIN_EMAILS` is not enough to say yes, and answering from
 * that list alone was wrong in the one case the delete button exists for.
 * `/api/auth/profile` re-creates a profile under the address **Dataverse
 * reports** for the account signing in (`internalemailaddress`), and Dataverse
 * reports exactly one address per account. A person can still reach the app
 * under two - MSAL's `getEmailFromAccount()` prefers the `email` claim and
 * falls back to the UPN - so `hiroyuki.ishige@hoya.com` (the mailbox) and
 * `ishigeh@hoya.com` (the sign-in ID) are one human. Only the first can ever
 * be re-created; the second is a leftover, and telling somebody it will return
 * is telling them not to bother clearing it.
 *
 * So the question is asked of Dataverse: is this address some account's own
 * address? Rule 6 - a lookup that fails is "could not ask", not "no", and the
 * cautious answer there is the warning rather than the silence.
 */
async function willReturnAtNextSignIn(
  token: string,
  email: string
): Promise<boolean> {
  const onList = SUPER_ADMIN_EMAILS.some(
    (e) => e.toLowerCase() === email.toLowerCase()
  );
  if (!onList) return false;

  try {
    const accounts = await queryDataverseAll<Record<string, unknown>>(
      token,
      "systemusers",
      {
        select: ["systemuserid"],
        filter: `internalemailaddress eq '${sanitizeODataString(email.toLowerCase())}'`,
      }
    );
    return accounts.length > 0;
  } catch {
    return true;
  }
}

/**
 * GET /api/admin/users/[id]
 *
 * Get a single user profile by ID. Admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Fetch user by ID
    const profiles = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.id} eq ${id}`,
      }
    );

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const profile = mapDataverseToUserProfile(profiles[0]);

    return NextResponse.json({ user: profile });
  } catch (error) {
    return handleApiError(error, "Admin Users API GET [id]");
  }
}

/**
 * PATCH /api/admin/users/[id]
 *
 * Update user profile. Admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Fetch existing user
    const profiles = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.id} eq ${id}`,
      }
    );

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const existingProfile = mapDataverseToUserProfile(profiles[0]);

    /*
     * A super admin's profile is changed by a super admin only.
     *
     * The **profile** is known by its address - a row carries nothing else to
     * know it by - but the **caller** is asked the way every other check asks
     * (`isSuperAdmin(user)`, the token's object id). It compared the caller's
     * one address with the profile's, which refused a super admin their own
     * second profile (the UPN one: a person reaches the app under two
     * addresses) and was the one identity test here not made through
     * `auth/require-signed-in` (rule 1; review, 2026-10-24).
     */
    if (
      SUPER_ADMIN_EMAILS.some(
        (e) => e.toLowerCase() === existingProfile.email.toLowerCase()
      ) &&
      !isSuperAdmin(admin.user)
    ) {
      return NextResponse.json(
        { error: "Cannot modify super admin" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { displayName, jobTitle, role, isActive, entityAccess } = body as {
      displayName?: string;
      jobTitle?: string;
      role?: UserRole;
      isActive?: boolean;
      entityAccess?: EntityAccess;
    };

    /* Deactivating your own profile is the lockout DELETE refuses below, by
       another verb: the next request is turned away and nobody is left on
       the screen to undo it. Matched on every address Dataverse holds for the
       caller, as DELETE is. */
    if (isActive === false && isCallerAddress(admin.user, existingProfile.email)) {
      return NextResponse.json(
        { error: "You cannot deactivate your own profile. Ask another administrator." },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: Partial<{
      displayName: string;
      jobTitle: string;
      role: UserRole;
      isActive: boolean;
      entityAccess: EntityAccess;
    }> = {};

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    if (jobTitle !== undefined) {
      updateData.jobTitle = jobTitle;
    }
    if (isUserRole(role)) {
      updateData.role = role;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    if (entityAccess !== undefined) {
      // Rebuilt from known levels rather than stored as sent: this map is a
      // permission, and the browser is not the authority on what it may say.
      updateData.entityAccess = sanitizeEntityAccess(entityAccess);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update in Dataverse, dropping any column this environment does not have
    // yet - hi_entityaccess is newer than the table, and one unknown property
    // would otherwise fail the whole save, including a plain role change.
    const dataverseData = mapUserProfileToDataverse(updateData);
    const { skipped } = await updateProfileRecord(token, id, dataverseData);

    // A role change or a deactivation must not wait out the role cache's TTL.
    clearRoleCache();
    clearRegistrationCache();

    console.log(
      "[Admin Users API] Updated user:",
      id,
      "by:",
      admin.user.email,
      "fields:",
      Object.keys(updateData)
    );

    // Fetch updated profile
    const updatedProfiles = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.id} eq ${id}`,
      }
    );

    const updatedProfile = mapDataverseToUserProfile(updatedProfiles[0]);

    return NextResponse.json({
      user: updatedProfile,
      updated: true,
      warning: missingColumnWarning(skipped),
    });
  } catch (error) {
    return handleApiError(error, "Admin Users API PATCH");
  }
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Removes the profile record. Admin only.
 *
 * ### Why this deletes rather than deactivates
 *
 * It used to set `isActive: false` and report "User deactivated" - but the
 * screen already has a toggle for that, on the profile it is editing, and
 * nothing ever called this route. So the app had two names for one act and no
 * way at all to remove a row. Deactivating is revoking access; deleting is
 * saying the record should not exist, which is what a duplicate profile needs.
 *
 * ### The super-admin guard is gone, on purpose
 *
 * It refused any address in `SUPER_ADMIN_EMAILS`, to stop an admin locking a
 * super admin out. It cannot: `GET /api/auth/profile` **auto-creates** a
 * profile for a super admin who has none, so deleting one costs them their
 * entity access and nothing else, and it comes back on their next sign-in. A
 * guard that does not guard anything is worse than none, because it is the
 * reason a duplicate profile could not be cleaned up.
 *
 * Deleting **your own** profile is still refused - that one is a lockout, and
 * the caller is identified by Dataverse rather than by any address the browser
 * supplied (rule 1).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Fetch existing user
    const profiles = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.id} eq ${id}`,
      }
    );

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const existingProfile = mapDataverseToUserProfile(profiles[0]);

    // Prevent self-deletion. The caller's addresses are resolved from Dataverse,
    // not read from a cookie, so this cannot be stepped around by claiming to be
    // somebody else - and **all** of them are asked: a profile under the
    // sign-in name (UPN) is as much the caller's as one under the mailbox.
    if (isCallerAddress(admin.user, existingProfile.email)) {
      return NextResponse.json(
        { error: "You cannot delete your own profile. Deactivate it instead." },
        { status: 400 }
      );
    }

    await deleteDataverseRecord(token, ENTITY_SET, id);

    // Removing a profile is a revocation - it takes effect now, not in five
    // minutes' time when a cached role expires.
    clearRoleCache();
    clearRegistrationCache();

    console.log(
      "[Admin Users API] Deleted profile:",
      existingProfile.email,
      "by:",
      admin.user.email
    );

    return NextResponse.json({
      success: true,
      message: "Profile deleted",
      // Said back to the screen rather than assumed there: whether the row
      // returns is a question for Dataverse, not for a hardcoded list.
      willBeRecreatedOnNextSignIn: await willReturnAtNextSignIn(
        token,
        existingProfile.email
      ),
    });
  } catch (error) {
    return handleApiError(error, "Admin Users API DELETE");
  }
}
