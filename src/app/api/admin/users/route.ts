/**
 * Admin Users API Route
 *
 * GET: List all user profiles (admin only)
 * POST: Create a new user profile (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  queryDataverseAll,
  sanitizeODataString,
} from "@/lib/providers/dataverse/client";
import {
  mapDataverseToUserProfile,
  mapUserProfileToDataverse,
  sanitizeEntityAccess,
  USER_PROFILE_FIELDS,
  isUserRole,
  type EntityAccess,
  type UserRole,
} from "@/lib/types/user-profile";
import { checkAdmin, clearRoleCache, deniedResponse } from "@/lib/auth/require-signed-in";
/* Registering, deactivating or deleting somebody changes the answer the
   middleware gate caches, so the two caches are cleared together - a
   registration that takes effect in one place and not the other is the
   screen and the server disagreeing about who is let in (rule 5). */
import { clearRegistrationCache } from "@/lib/auth/registration";
import { createProfileRecord, missingColumnWarning } from "@/lib/auth/user-profile-write";
import { handleApiError } from "@/lib/utils/api-helpers";

const ENTITY_SET = "hi_userprofiles";

/**
 * GET /api/admin/users
 *
 * List all user profiles. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    // Identity comes from Dataverse. The dv_user_email cookie holds whatever the
    // browser posted at sign-in, so the role lookup this route used to do was
    // against a self-declared address - and this is the endpoint that hands out
    // the Admin role itself.
    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Get optional search query
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    // Fetch all profiles
    const records = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        orderby: `${USER_PROFILE_FIELDS.email} asc`,
      }
    );

    // Map to UserProfile format
    let profiles = records.map(mapDataverseToUserProfile);

    // Apply search filter (client-side)
    if (search) {
      const searchLower = search.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          p.email.toLowerCase().includes(searchLower) ||
          p.displayName.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      users: profiles,
      count: profiles.length,
    });
  } catch (error) {
    return handleApiError(error, "Admin Users API GET");
  }
}

/**
 * POST /api/admin/users
 *
 * Create a new user profile. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Parse request body
    const body = await request.json();
    const { email, displayName, jobTitle, role = "user", entityAccess } = body as {
      email?: string;
      displayName?: string;
      jobTitle?: string;
      role?: UserRole;
      entityAccess?: EntityAccess;
    };

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();

    // Check if profile already exists
    const existingProfiles = await queryDataverseAll<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.email} eq '${sanitizeODataString(emailLower)}'`,
      }
    );

    if (existingProfiles.length > 0) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Create new profile. The access map is rebuilt from known levels here as
    // well as in the browser - it is a permission, so what a request asks for
    // is not what gets stored.
    const newProfileData = mapUserProfileToDataverse({
      email: emailLower,
      displayName: displayName || emailLower.split("@")[0],
      jobTitle: typeof jobTitle === "string" ? jobTitle : "",
      role: isUserRole(role) ? role : "user",
      azureUserId: "",
      isActive: true,
      entityAccess: sanitizeEntityAccess(entityAccess),
    });

    const { record, skipped } = await createProfileRecord<Record<string, unknown>>(
      token,
      newProfileData
    );

    const createdProfile = mapDataverseToUserProfile(record);
    // Roles are cached for five minutes, so a new profile has to evict them or
    // the person it was created for keeps being refused until the TTL lapses.
    clearRoleCache();
    clearRegistrationCache();
    console.log("[Admin Users API] Created user:", emailLower, "by:", admin.user.email);

    return NextResponse.json({
      user: createdProfile,
      created: true,
      warning: missingColumnWarning(skipped),
    });
  } catch (error) {
    return handleApiError(error, "Admin Users API POST");
  }
}
