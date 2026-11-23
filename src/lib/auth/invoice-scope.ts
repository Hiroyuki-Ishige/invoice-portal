/**
 * **Which companies' invoices the caller may see** (2026-11-23).
 *
 * Admin and F&A Admin issue and cancel invoices, so they see every company's. A **User** sees only the
 * companies registered to them in Admin > User Management - kept in the profile's `hi_entityaccess` map,
 * keyed by the customer code (`HLAM`, `HOGV`...), a company being any code with a level other than none.
 * A User with no company sees no invoice.
 *
 * Applied by every route that returns an invoice or the customer master (`/api/invoices`,
 * `/api/invoices/[id]`, `/api/customers`). **This is the app's rule, enforced on the server - not
 * Dataverse's:** the Invoice Portal Reader security role can still read the whole `hi_invoice` table
 * for anybody who calls Dataverse directly with their own token. Record-level isolation would need
 * business units or owner teams in Dataverse.
 */

import { callerProfiles } from "./require-signed-in";
import { INVOICE_CREATOR_ROLES, entityAccessLevel } from "@/lib/types/user-profile";

export type InvoiceScope = { all: true } | { all: false; codes: string[] };

/**
 * The caller's scope, or `null` when it could not be established - which every caller must treat as a
 * refusal, so that a Dataverse failure never widens what somebody sees (rule 6).
 */
export async function invoiceScopeOfCaller(): Promise<InvoiceScope | null> {
  const caller = await callerProfiles();
  if (!caller) return null;
  if (caller.user.superAdmin || caller.profiles.some((p) => INVOICE_CREATOR_ROLES.includes(p.role))) return { all: true };

  const codes = new Set<string>();
  for (const profile of caller.profiles) {
    for (const code of Object.keys(profile.entityAccess)) {
      if (entityAccessLevel(profile.entityAccess, code) !== "none") codes.add(code);
    }
  }
  return { all: false, codes: [...codes] };
}

/** Whether the scope includes this customer code (case does not matter). */
export function scopeAllows(scope: InvoiceScope, customerCode: string): boolean {
  if (scope.all) return true;
  const wanted = customerCode.trim().toLowerCase();
  return scope.codes.some((code) => code.trim().toLowerCase() === wanted);
}

/**
 * An OData condition on a customer-code column for a limited scope; `null` for everybody. Quotes doubled.
 * **A scope with no company gets a condition that matches nothing, never `null`** - `null` means "no
 * restriction", and an empty list must not read as that.
 */
export function scopeFilter(scope: InvoiceScope, column: string): string | null {
  if (scope.all) return null;
  const terms = scope.codes.map((code) => `${column} eq '${code.replace(/'/g, "''")}'`);
  return terms.length > 0 ? `(${terms.join(" or ")})` : `(${column} eq '' and ${column} ne '')`;
}
