/**
 * **The Dataverse user behind an Office 365 person.**
 *
 * The user picker on the forms searches Microsoft Graph and hands back an
 * **Azure AD object id**. A lookup to `systemuser` wants a **systemuser id**.
 * They are different GUIDs for the same human, and binding one where the other
 * belongs either names nobody or names the wrong record - which is exactly why
 * the Items route says its PIC is "deliberately not written" and leaves the
 * creator as owner.
 *
 * This is the translation, so a PIC picked on a form can actually be stored.
 *
 * **Three questions, in order of how much they prove**, because a tenant does
 * not always fill in the first:
 *
 * 1. `azureactivedirectoryobjectid` - the same person, asserted by the
 *    directory. Nothing to interpret.
 * 2. `internalemailaddress` - the mailbox Dataverse holds.
 * 3. `domainname` - the sign-in name (UPN), which is often the same string as
 *    the mailbox and often not.
 *
 * An address is matched case-insensitively and **escaped** before it reaches an
 * OData filter (rule: `sanitizeODataString`); a name with an apostrophe would
 * otherwise end the string literal.
 *
 * Returns `null` when nobody matched. That is "could not identify", not "no
 * PIC" (rule 6), and the caller reports it rather than silently storing nothing.
 */

import { queryDataverseRaw, sanitizeODataString, validateUUID } from "./client";

export interface PickedUser {
  /** Azure AD object id, from the Graph-backed picker. */
  id?: string | null;
  mail?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
}

interface SystemUserRow {
  systemuserid: string;
  fullname?: string;
}

/** Only enabled, non-application users - a disabled account cannot be a PIC. */
const ACTIVE = "isdisabled eq false and accessmode eq 0";

async function firstMatch(token: string, filter: string): Promise<SystemUserRow | null> {
  const rows = await queryDataverseRaw<SystemUserRow>(
    token,
    `systemusers?$select=systemuserid,fullname&$top=1&$filter=${encodeURIComponent(
      `${ACTIVE} and (${filter})`
    )}`
  );
  return rows[0] ?? null;
}

export async function resolveSystemUser(
  token: string,
  picked: PickedUser
): Promise<{ id: string; name: string } | null> {
  const attempts: string[] = [];

  // Validated, because it goes into a filter unquoted - a GUID comparison takes
  // no quotes, so a malformed one is a syntax error rather than a no-match.
  if (picked.id && validateUUID(picked.id)) {
    attempts.push(`azureactivedirectoryobjectid eq ${picked.id}`);
  }

  /*
   * **No `tolower()`.** Dataverse's `$filter` supports only `contains`,
   * `startswith` and `endswith` among the string functions - `tolower` is an
   * OData function it does not implement, and a filter carrying one comes back
   * empty rather than failing loudly, which is how the first version of this
   * matched nobody while looking correct. Its column comparison is
   * case-insensitive anyway, so the address goes in as written.
   */
  const addresses = [picked.mail, picked.email, picked.userPrincipalName]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  for (const address of [...new Set(addresses)]) {
    const escaped = sanitizeODataString(address);
    attempts.push(
      `internalemailaddress eq '${escaped}' or domainname eq '${escaped}'`
    );
  }

  for (const filter of attempts) {
    try {
      const row = await firstMatch(token, filter);
      if (row?.systemuserid) {
        return { id: row.systemuserid, name: (row.fullname ?? "").trim() };
      }
    } catch {
      /* One question failing is not the answer to the next one. A tenant with
         `azureactivedirectoryobjectid` unpopulated answers nothing, not an
         error - but a filter this app got wrong should not stop the fallbacks
         from being asked. */
    }
  }

  return null;
}
