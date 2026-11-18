/**
 * The Dataverse read behind `administrator-contacts.ts`.
 *
 * Split off so the type and the de-duplication rule can be held by the browser
 * and driven by a fixture: a module graph is loaded whole, and a value import
 * of this one would take the OData client with it (rule 19).
 */

import { queryDataverse } from "@/lib/providers/dataverse/client";
import { ROLE_VALUES, USER_PROFILE_ENTITY_SET, USER_PROFILE_FIELDS } from "@/lib/types/user-profile";
import {
  dedupeAdministrators,
  type AdministratorContact,
} from "@/lib/auth/administrator-contacts";

const ENTITY_SET = USER_PROFILE_ENTITY_SET;

/**
 * The active Admin profiles, or **null when they could not be read**.
 *
 * Null is "could not ask", never "nobody" (rule 6, rule 26): the two say
 * different things to whoever is locked out, and an empty array here would
 * claim this app has no administrator - which is a claim about the tenant that
 * a failed query is not evidence for.
 *
 * Read with the caller's own token, so it is the caller's Dataverse role that
 * decides whether the answer arrives. Every caller is a signed-in account that
 * has just been refused, and what it learns is the name and work address of the
 * person who registers users - which is the one fact they need in order to ask.
 */
export async function readAdministratorContacts(
  token: string
): Promise<AdministratorContact[] | null> {
  try {
    const records = await queryDataverse<Record<string, unknown>>(token, ENTITY_SET, {
      // `hi_jobtitle` is deliberately not asked for: it arrived later than the
      // table and a missing column would cost the whole answer (rule 7), while
      // a name and an address are what a mailto needs.
      select: [
        USER_PROFILE_FIELDS.displayName,
        USER_PROFILE_FIELDS.email,
        USER_PROFILE_FIELDS.isActive,
      ],
      filter: `${USER_PROFILE_FIELDS.role} eq ${ROLE_VALUES.admin}`,
      orderby: `${USER_PROFILE_FIELDS.displayName} asc`,
    });

    return dedupeAdministrators(
      records
        // The same test `activeProfiles()` applies, and for the same reason:
        // only an explicit `false` deactivates an account, so a row whose flag
        // was never written is active (see `mapDataverseToUserProfile`).
        .filter((r) => r[USER_PROFILE_FIELDS.isActive] !== false)
        .map((r) => ({
          name: String(r[USER_PROFILE_FIELDS.displayName] ?? "").trim(),
          email: String(r[USER_PROFILE_FIELDS.email] ?? "").trim().toLowerCase(),
        }))
    );
  } catch (error) {
    // Swallowed on purpose. The caller is already answering 404 "not
    // registered", and that answer must not become a 500 because the courtesy
    // beside it could not be looked up.
    console.warn(
      "[Administrator contacts] Could not read the Admin profiles:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
