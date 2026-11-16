/**
 * **Who is a super admin - decided on the Entra object id, never on an address.**
 *
 * Until 2026-10-20 the test was "one of the addresses Dataverse holds for the
 * caller is on `SUPER_ADMIN_EMAILS`". Those addresses are `systemuser`
 * columns (`internalemailaddress`, `domainname`), and a security role that
 * ever grants Write on User - at any depth, the caller's own record included -
 * would let somebody type a super admin's address into their own row and be
 * one. Checked that day: no role grants it. This is the guard for the day one
 * does (the owner asked for it as a precaution).
 *
 * **The object id (`oid`) is Microsoft's answer**: the one claim it says may be
 * used for authorisation - immutable, never reassigned. A UPN is not: it
 * changes with a name and is handed to the next person who gets it
 * (`learn.microsoft.com` -> access token claims reference, claims validation).
 *
 * It is read from the **access token**, which is trusted here only because the
 * caller has already presented it to Dataverse and Dataverse accepted it
 * (`WhoAmI` succeeded) - Dataverse checks Entra's signature, so the claims are
 * Entra's. Nothing in this module may be asked about a token that has not been
 * through that.
 *
 * **The list has had an id since 2026-10-20, so the object id decides and the
 * addresses do not count.** The address test is the fallback for an empty
 * list only - it shipped that way so the change could not lock the one
 * account that can register anybody out of the app (rule 25), and it would
 * decide again only if the list were emptied.
 *
 * Both runtimes (middleware and routes): no Node APIs, no Dataverse import
 * (rule 19).
 */

import { SUPER_ADMIN_EMAILS } from "@/lib/types/user-profile";
import { validateUUID } from "@/lib/utils/uuid";

/**
 * The Entra object ids of the super admins - Entra admin center -> Users ->
 * the person -> **Object ID**. Lowercase GUIDs. Not secrets: an id grants
 * nothing without that person's sign-in.
 */
export const SUPER_ADMIN_OBJECT_IDS: readonly string[] = [
  "36867a32-a52f-4876-b8ac-c38f863f773b", // Hiroyuki Ishige (added 2026-10-20)
];

/**
 * The `oid` claim of a JWT, or null. **Decodes, does not verify** - see the
 * header for why that is enough here, and only here.
 */
export function tokenObjectId(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!claims || typeof claims !== "object") return null;
    const oid = (claims as Record<string, unknown>).oid;
    return validateUUID(oid) ? oid.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Whether this caller is a super admin. `token` must be one Dataverse has just
 * accepted; `addresses` are the ones Dataverse holds, used only while no
 * object id is configured.
 */
export function isSuperAdminCaller(token: string, addresses: readonly string[]): boolean {
  if (SUPER_ADMIN_OBJECT_IDS.length > 0) {
    const oid = tokenObjectId(token);
    return oid !== null && SUPER_ADMIN_OBJECT_IDS.some((id) => id.toLowerCase() === oid);
  }
  return addresses.some((address) =>
    SUPER_ADMIN_EMAILS.some((admin) => admin.toLowerCase() === address.toLowerCase())
  );
}
