/**
 * User Profile API Route
 *
 * GET: Check if current user has a profile in Dataverse
 * POST: Create a profile for the current user (super admin auto-creation)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import {
  checkAdmin,
  clearRoleCache,
  deniedResponse,
  requireSignedIn,
  whyNotSignedIn,
} from "@/lib/auth/require-signed-in";
import { clearRegistrationCache } from "@/lib/auth/registration";
import { handleApiError } from "@/lib/utils/api-helpers";
import {
  queryDataverse,
  createDataverseRecord,
  updateDataverseRecord,
  sanitizeODataString,
} from "@/lib/providers/dataverse/client";
import {
  UserProfile,
  mapDataverseToUserProfile,
  mapUserProfileToDataverse,
  USER_PROFILE_FIELDS,
} from "@/lib/types/user-profile";
import { readAdministratorContacts } from "@/lib/auth/administrator-contacts-server";

const ENTITY_SET = "hi_userprofiles";

/**
 * GET /api/auth/profile
 *
 * Check if the current logged-in user has a profile.
 * Returns the profile if found, 404 if not found.
 * Super admins are auto-created if they don't have a profile.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
    /** A label only - the display name on a profile this route may create. */
    const userName = cookieStore.get(DATAVERSE_COOKIES.USER_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized - no token" },
        { status: 401 }
      );
    }

    /**
     * **Whose profile this is, decided by Dataverse.**
     *
     * It used to be the `dv_user_email` cookie, which the browser sets and
     * which therefore proves nothing (rule 1) - and this route does not merely
     * *read* by that address, it **creates an admin profile** under it when the
     * address is a super admin's.
     *
     * The second cost was a duplicate. One person can arrive under two
     * addresses: MSAL's `getEmailFromAccount()` prefers the `email` claim and
     * falls back to the UPN, so `hiroyuki.ishige@hoya.com` and
     * `ishigeh@hoya.com` are the same account keyed two ways, and both are on
     * the super-admin list - so both got a profile auto-created, and User
     * Management showed the same person twice. Dataverse reports one address
     * per account, so asking it is what makes one account one profile.
     */
    const signedIn = await requireSignedIn();
    if (!signedIn) {
      /* **An account the environment does not know is told so, by its own
         code.** It used to share `SESSION_EXPIRED` with every other failure,
         and the screen - rightly - lets an unexplained failure through, so an
         account nobody had registered reached the app (2026-10-24). Asked only
         here, on the way out: this is the one route whose refusal is a screen. */
      if ((await whyNotSignedIn()) === "not_in_environment") {
        return NextResponse.json(
          {
            error:
              "Dataverse does not recognise this account - it has no user record in this " +
              "environment, or no access to it. An administrator has to add it.",
            code: "NOT_IN_ENVIRONMENT",
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Session expired - sign in again", code: "SESSION_EXPIRED" },
        { status: 401 }
      );
    }

    const userId = signedIn.userId;
    const emailLower = signedIn.email.toLowerCase();

    /**
     * **Every address Dataverse holds for this account, not just the mailbox.**
     *
     * A profile is registered under whichever address was to hand - the picker
     * in User Management stores `mail` where an account has one and the UPN
     * where it does not - and the two differ for some accounts. This route
     * matched `signedIn.email` alone, so a person registered under their UPN
     * was answered "Profile not found" here while `activeProfiles()` in
     * `require-signed-in` - which has always matched on both - counted them
     * registered everywhere else.
     *
     * That disagreement cost nothing while the 404 only set a flag nobody
     * printed. It is now the whole of what the screen says, so the two reads
     * have to give one answer (rule 5): a narrower one here locks a registered
     * user out of the app with a sentence telling them to go and get registered.
     */
    /*
     * **And an account with no address at all is not identified.**
     *
     * `addresses` is empty when the `systemusers` read behind `requireSignedIn`
     * did not answer - a WhoAmI that succeeded and a directory row that did
     * not. An empty list would build an empty `$filter`, and an OData query
     * with no filter returns **every** profile, whose first row this route
     * would then hand back as the caller's own. Refused instead: what could
     * not be established is not a fact (rule 27).
     */
    if (signedIn.addresses.length === 0) {
      return NextResponse.json(
        {
          error: "Could not identify this account in Dataverse - sign in again",
          code: "SESSION_EXPIRED",
        },
        { status: 401 }
      );
    }

    const addressFilter = signedIn.addresses
      .map((a) => `${USER_PROFILE_FIELDS.email} eq '${sanitizeODataString(a)}'`)
      .join(" or ");

    // Query for existing profile
    const profiles = await queryDataverse<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: addressFilter,
        // One per address, because both may be registered - and then the
        // active one is the profile, which `top: 1` could have missed.
        top: signedIn.addresses.length,
      }
    );

    /* The mailbox first where both are registered, so the address this app
       calls the caller's own is the profile it hands back. */
    const matched =
      profiles.find(
        (p) => String(p[USER_PROFILE_FIELDS.email] ?? "").toLowerCase() === emailLower
      ) ?? profiles[0];

    if (matched) {
      const profile = mapDataverseToUserProfile(matched);

      /* Deactivated, and told who can switch it back on - the same courtesy
         the 404 below carries, because it is the same next move for the
         reader. Absent when the list could not be read (rule 6). */
      if (!profile.isActive) {
        const contacts = await readAdministratorContacts(token);
        return NextResponse.json(
          {
            error: "Account is deactivated",
            code: "ACCOUNT_DEACTIVATED",
            ...(contacts ? { administrators: contacts } : {}),
          },
          { status: 403 }
        );
      }

      // Update last login timestamp
      try {
        await updateDataverseRecord(token, ENTITY_SET, profile.id, {
          [USER_PROFILE_FIELDS.lastLoginAt]: new Date().toISOString(),
        });
      } catch (updateError) {
        // Non-critical, just log
        console.warn("[Profile API] Failed to update last login:", updateError);
      }

      return NextResponse.json({ profile });
    }

    /* Profile not found - check if super admin. **On the identity's own verdict
       (`signedIn.superAdmin`, `auth/super-admin`), not the address**: this
       branch writes an Admin profile, so deciding it on `internalemailaddress`
       would make a writable column a way to mint a permanent Admin (2026-10-20). */
    if (signedIn.superAdmin) {
      // Auto-create profile for super admin
      const newProfileData = mapUserProfileToDataverse({
        email: emailLower,
        displayName: userName || emailLower.split("@")[0],
        role: "admin",
        azureUserId: userId || "",
        isActive: true,
        lastLoginAt: new Date().toISOString(),
      });

      const createdRecord = await createDataverseRecord<Record<string, unknown>>(
        token,
        ENTITY_SET,
        newProfileData
      );

      const createdProfile = mapDataverseToUserProfile(createdRecord);
      console.log("[Profile API] Auto-created super admin profile:", emailLower);

      return NextResponse.json({
        profile: createdProfile,
        created: true,
      });
    }

    /*
     * Not a super admin and no profile found - and this is the answer the
     * screen turns into a sentence, so it carries who can put it right.
     *
     * `administrators` is **absent** when the list could not be read, and an
     * empty array when it was read and nobody holds the role. The screen says
     * the same thing either way, but the two are not the same fact and this
     * response must not claim the second while meaning the first (rule 6).
     */
    const administrators = await readAdministratorContacts(token);

    return NextResponse.json(
      {
        error: "Profile not found",
        code: "NO_PROFILE",
        ...(administrators ? { administrators } : {}),
      },
      { status: 404 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Profile API] GET error:", errorMessage);

    // Check if it's a table not found error
    if (errorMessage.includes("Resource not found") || errorMessage.includes("doesn't exist")) {
      return NextResponse.json(
        {
          error: "User profile table not configured",
          code: "TABLE_NOT_FOUND",
          details: "Please create hi_userprofile table in Dataverse",
        },
        { status: 503 }
      );
    }

    // Everything else through the shared handler, so a Dataverse refusal is
    // answered with what Dataverse said. This branch used to return a flat 500,
    // which is how an account with no user record in the environment came to
    // report "Internal server error" on every page it loaded.
    return handleApiError(error, "Profile API");
  }
}

/**
 * POST /api/auth/profile
 *
 * Create a new user profile (admin only).
 * Used by admin panel to add new users.
 */
export async function POST(request: NextRequest) {
  try {
    // `checkAdmin()`, not the `dv_user_email` cookie. This endpoint creates a
    // profile and takes the role from the request body, so it is a grant: the
    // cookie version asked the browser who was calling, and the browser sets
    // that cookie itself at sign-in. Anyone with a valid session could name an
    // admin, pass the check, and mint themselves an admin profile - which every
    // other route then honours, because the profile is where the role lives.
    const admin = await checkAdmin();
    if (!admin.user) return deniedResponse(admin.reason);

    const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)!.value;

    // Parse request body
    const body = await request.json();
    const { email, displayName, role = "user" } = body as {
      email?: string;
      displayName?: string;
      role?: "admin" | "user";
    };

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();

    // Check if profile already exists
    const existingProfiles = await queryDataverse<Record<string, unknown>>(
      token,
      ENTITY_SET,
      {
        filter: `${USER_PROFILE_FIELDS.email} eq '${sanitizeODataString(emailLower)}'`,
        top: 1,
      }
    );

    if (existingProfiles.length > 0) {
      return NextResponse.json(
        { error: "User profile already exists" },
        { status: 409 }
      );
    }

    // Create new profile. The role is narrowed to the known values rather than
    // stored as sent - the same rule the admin endpoint applies - because it is
    // a permission and the request is not the authority on what it may say.
    const newProfileData = mapUserProfileToDataverse({
      email: emailLower,
      displayName: displayName || emailLower.split("@")[0],
      role: role === "admin" ? "admin" : "user",
      azureUserId: "",
      isActive: true,
    });

    const createdRecord = await createDataverseRecord<Record<string, unknown>>(
      token,
      ENTITY_SET,
      newProfileData
    );

    const createdProfile = mapDataverseToUserProfile(createdRecord);
    clearRoleCache();
    clearRegistrationCache();
    console.log("[Profile API] Created profile:", emailLower, "by admin:", admin.user.email);

    return NextResponse.json({
      profile: createdProfile,
      created: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Profile API] POST error:", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to create profile",
        ...(process.env.NODE_ENV !== "production" ? { details: errorMessage } : {}),
      },
      { status: 500 }
    );
  }
}
