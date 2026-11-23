/**
 * User Profile Types for Authorization
 *
 * These types define the user profile structure stored in Dataverse
 * for role-based access control (admin/user).
 */

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  /**
   * The job title as the directory read it when this user was registered.
   *
   * Stored beside the name rather than looked up on render, the same as every
   * person on a ringi: a later lookup can disagree with whoever the name now
   * means. Empty on profiles registered before the column existed.
   */
  jobTitle: string;
  role: UserRole;
  azureUserId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  modifiedAt: string;
  /** What this user may do per CAPEX entity. An absent entity means none. */
  entityAccess: EntityAccess;
}

/**
 * What one user may do with one entity's data.
 *
 * "none" is stored as absence rather than as a value, so a user with nothing
 * granted carries an empty object rather than a row per entity that has to be
 * kept in step as entities are added.
 */
export type EntityAccessLevel = "none" | "view" | "edit";

export const ENTITY_ACCESS_LEVELS: readonly EntityAccessLevel[] = ["none", "view", "edit"];

export const ENTITY_ACCESS_LABELS: Record<EntityAccessLevel, string> = {
  none: "None",
  view: "View",
  edit: "Edit",
};

/** Access per entity code, e.g. `{ V1: "edit", HLAO: "view" }`. */
export type EntityAccess = Record<string, EntityAccessLevel>;

/** A backstop on a stored map, not a limit on how many entities may exist. */
export const MAX_ACCESS_ENTITIES = 100;
const MAX_ENTITY_CODE_LENGTH = 100;

/**
 * The level for one entity, read safely.
 *
 * Never index the map directly: it is rebuilt from stored JSON, and
 * `access["constructor"]` resolves through `Object.prototype` to a function -
 * truthy, and not a level, so a `!== "none"` test would pass. The same mistake
 * cost the consistency check its fixable-field allowlist; see CLAUDE.md.
 */
export function entityAccessLevel(
  access: EntityAccess | null | undefined,
  entity: string
): EntityAccessLevel {
  if (!access || !Object.prototype.hasOwnProperty.call(access, entity)) return "none";
  const level = access[entity];
  return ENTITY_ACCESS_LEVELS.includes(level) ? level : "none";
}

export function canViewEntity(access: EntityAccess | null | undefined, entity: string): boolean {
  return entityAccessLevel(access, entity) !== "none";
}

export function canEditEntity(access: EntityAccess | null | undefined, entity: string): boolean {
  return entityAccessLevel(access, entity) === "edit";
}

/**
 * A stored or posted access map, reduced to entity codes and known levels.
 *
 * Applied on the way in and on the way out: the column holds JSON that a future
 * enforcement point will read as a permission, so neither a hand-edited record
 * nor a crafted request body decides what it contains. "none" entries are
 * dropped rather than stored, which is what keeps the map the size of what was
 * actually granted.
 */
export function sanitizeEntityAccess(raw: unknown): EntityAccess {
  if (!raw || typeof raw !== "object") return {};

  // Prototype-less, so a key named "__proto__" is stored as data rather than
  // changing the object it is stored in.
  const access: EntityAccess = Object.create(null);
  let kept = 0;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kept >= MAX_ACCESS_ENTITIES) break;

    const entity = key.trim().slice(0, MAX_ENTITY_CODE_LENGTH);
    if (!entity) continue;
    if (value !== "view" && value !== "edit") continue;

    access[entity] = value;
    kept++;
  }

  return access;
}

/** How many entities this user may see at all - the figure the list shows. */
export function countGrantedEntities(access: EntityAccess | null | undefined): number {
  return access ? Object.values(access).filter((level) => level !== "none").length : 0;
}

/**
 * `faadmin` (F&A-Admin) is Finance & Accounting: the same IIR-approval rights as
 * an admin, without the rest of the admin tooling.
 *
 * `capexadmin` (IIR-Admin) was created 2026-09-28 as "CAPEX-Admin" and renamed
 * IIR-Admin on 2026-10-17 - **the label only**: the key and the Dataverse value
 * (4) are what saved role permissions and every profile hold, so they stay.
 * Admin > Setup renames an existing table's option to match. What it may do is the
 * role permission table's column for it (`lib/auth/permissions`, Admin > Role
 * Permissions) - by default a User plus Edit on Meeting in MD and IIR Deck;
 * the ringi's own Finance powers (`isAdminOrFinance`) do not include it. Its
 * option in Dataverse is added by Admin > Setup.
 */
export type UserRole = "admin" | "faadmin" | "capexadmin" | "user";

/**
 * Every role, least to most - the order the Role cards offer them.
 *
 * **Three roles since 2026-11-23**: Admin, F&A Admin and User. Invoice preparer
 * and Invoice receiver (added 2026-11-18) were folded away - see
 * `RETIRED_ROLE_VALUES`.
 */
export const USER_ROLES: readonly UserRole[] = ["user", "faadmin", "admin"];

/** A role name off a request body, checked against the one list (rule 5). */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Dataverse choice values for hi_role field
 */
export const ROLE_VALUES = {
  admin: 1,
  user: 2,
  faadmin: 3,
  capexadmin: 4,
} as const;

/**
 * **Dataverse values of roles that no longer exist** (Invoice preparer 5, Invoice
 * receiver 6; retired 2026-11-23). Their options stay in the choice column so a row
 * that still holds one can be read, and `getRoleName` reads them as a plain User.
 * Admin > Setup > Top up rewrites those rows to User (`migrateRetiredRoles`).
 */
export const RETIRED_ROLE_VALUES: readonly number[] = [5, 6];

/** Labels for the role choice, matching the Dataverse option labels. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  faadmin: "F&A Admin",
  capexadmin: "IIR-Admin",
  user: "User",
};

/**
 * What each role actually gets, in one line.
 *
 * Shown under the buttons that grant a role, and as the tooltip on the chip
 * that reports one. Written once so the two cannot describe the same role
 * differently - the badge in the header already spent a while calling an
 * F&A-Admin an ordinary user.
 */
export const ROLE_HINTS: Record<UserRole, string> = {
  admin: "Full access - creates and cancels invoices, manages users and settings",
  faadmin: "Finance & Accounting - creates, issues and cancels invoices, and keeps who is told about them",
  capexadmin: "IIR administrator - by default a User plus Edit on Meeting in MD and IIR Deck (Admin > Role Permissions)",
  user: "Reads the invoice screens",
};

/**
 * Convert Dataverse role value to UserRole
 */
export function getRoleName(value: number): UserRole {
  if (value === ROLE_VALUES.admin) return "admin";
  if (value === ROLE_VALUES.faadmin) return "faadmin";
  if (value === ROLE_VALUES.capexadmin) return "capexadmin";
  // Includes the retired invoice roles (RETIRED_ROLE_VALUES): a plain User.
  return "user";
}

/**
 * Admin or F&A-Admin - the two roles Finance work is shared between.
 *
 * **The ringi's own Finance powers** now: reopening a signed-off step,
 * repairing a route, correcting the applicants, removing somebody else's
 * attachment - and changing any item's budget explanation whatever its site.
 * Those are rules of the ringi, not screen permissions, so the role
 * permission table does not govern them. The IIR mark, FX Rates, Circulation
 * Route and the other Admin screens were behind this test by name until
 * 2026-09-28; they are rows of that table now (`lib/auth/permissions`), with
 * Admin and F&A-Admin as their defaults.
 *
 * Super admins qualify because they are admins by definition.
 */
export function isAdminOrFinance(
  role: UserRole | null | undefined,
  email?: string | null
): boolean {
  if (email && isSuperAdmin(email)) return true;
  return role === "admin" || role === "faadmin";
}

/**
 * **May this role delete an empty item from IIR Deck?** Admin and IIR-Admin
 * (asked for, 2026-10-17) - the people who keep the deck tidy. What "empty"
 * means is `lib/budget/empty-item`, and the server asks it whoever is asking.
 *
 * One predicate for the bin on the row and the route behind it (rule 5).
 * Super admins qualify because they are admins by definition.
 */
export function mayDeleteEmptyItems(
  role: UserRole | null | undefined,
  email?: string | null
): boolean {
  if (email && isSuperAdmin(email)) return true;
  return role === "admin" || role === "capexadmin";
}

/**
 * **May this role create and issue an invoice?** Admin and F&A Admin (decided 2026-11-23,
 * when the Invoice preparer and Invoice receiver roles were retired). These are the defaults
 * of the `invoices` row of Admin > Role Permissions; the server still asks the table
 * (`checkArea`).
 */
export const INVOICE_CREATOR_ROLES: readonly UserRole[] = ["admin", "faadmin"];

/**
 * **May this role cancel an issued invoice?** Admin and F&A Admin. One predicate for the
 * button and the route (rule 5). Super admins qualify because they are admins by definition.
 */
export function mayCancelInvoices(
  role: UserRole | null | undefined,
  email?: string | null
): boolean {
  if (email && isSuperAdmin(email)) return true;
  return role === "admin" || role === "faadmin";
}

/**
 * Convert UserRole to Dataverse role value
 */
export function getRoleValue(role: UserRole): number {
  return ROLE_VALUES[role];
}

/**
 * Super admin emails - these users always have access and auto-create profiles
 */
export const SUPER_ADMIN_EMAILS = [
  "hiroyuki.ishige@hoya.com",
  "ishigeh@hoya.com",
];

/**
 * Whether an address is on the list - **for a screen's courtesy only.** The
 * server decides who is a super admin on the token's object id
 * (`auth/super-admin`, `isSuperAdmin(user)` in `auth/require-signed-in`), never
 * on an address: an address is a column a security role could make writable.
 */
export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === email.toLowerCase()
  );
}

/**
 * **Invoice Portal's own table of registered users.** CAPEX Budget Control lives in the same
 * Dataverse environment and keeps its people in `hi_userprofile`; sharing that table would mean
 * a person added or removed here changes who may open CAPEX. This app's users are its own.
 * Every reader and writer takes the name from here (rule 5), and Admin > Setup builds the table
 * under it. The columns inside are named as they always were.
 */
export const USER_PROFILE_LOGICAL_NAME = "hi_invoiceuserprofile";
export const USER_PROFILE_ENTITY_SET = "hi_invoiceuserprofiles";

/**
 * Dataverse field mappings for the user profile table (`USER_PROFILE_LOGICAL_NAME`)
 */
export const USER_PROFILE_FIELDS = {
  id: "hi_invoiceuserprofileid",
  email: "hi_email",
  displayName: "hi_displayname",
  /** Added later than the rest, with the directory picker. */
  jobTitle: "hi_jobtitle",
  role: "hi_role",
  azureUserId: "hi_azureuserid",
  isActive: "hi_isactive",
  lastLoginAt: "hi_lastloginat",
  createdAt: "createdon",
  modifiedAt: "modifiedon",
  /** JSON: `{ "V1": "edit", "HLAO": "view" }`. Added later than the rest. */
  entityAccess: "hi_entityaccess",
} as const;

/**
 * The access map on a record, or an empty one.
 *
 * Absent, empty and unparseable all mean "nothing granted": the column is newer
 * than the table, so a profile written before Admin > Setup was re-run simply
 * has no value there, and that must load rather than throw.
 */
/**
 * The stored `hi_entityaccess` JSON, read into a map.
 *
 * Exported because the authorisation path reads the column straight off a
 * `$select` rather than through `mapDataverseToUserProfile`, and two parsers for
 * one column is how a screen and a guard come to disagree about what somebody
 * may do (rule 5).
 */
export function readEntityAccess(raw: unknown): EntityAccess {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    return sanitizeEntityAccess(JSON.parse(raw));
  } catch {
    console.warn("[User Profile] Ignoring unreadable entity access JSON");
    return {};
  }
}

/**
 * Convert Dataverse record to UserProfile
 */
export function mapDataverseToUserProfile(record: Record<string, unknown>): UserProfile {
  return {
    id: record[USER_PROFILE_FIELDS.id] as string,
    email: (record[USER_PROFILE_FIELDS.email] as string) || "",
    displayName: (record[USER_PROFILE_FIELDS.displayName] as string) || "",
    jobTitle: (record[USER_PROFILE_FIELDS.jobTitle] as string) || "",
    role: getRoleName(record[USER_PROFILE_FIELDS.role] as number),
    azureUserId: (record[USER_PROFILE_FIELDS.azureUserId] as string) || "",
    /*
     * **Only an explicit `false` deactivates an account.**
     *
     * `activeProfiles()` in `lib/auth/require-signed-in.ts` has always filtered
     * on `hi_isactive !== false`, and that is the rule: this mapper must give
     * the same answer, because one of them decides what the screen says and the
     * other decides what the server allows.
     *
     * It was tightened to "present and not true" on 2026-08-30, on the reading
     * that an unset flag is not a grant (rule 6). It is a defensible rule and
     * it was **the wrong place to apply it**: it made this mapper stricter than
     * the authorization filter, so an account whose row carries a null flag -
     * one created by hand rather than through this app - was refused at
     * `/api/auth/profile` with ACCOUNT_DEACTIVATED while every other check still
     * counted it active. That locked a real user out of sign-in within hours.
     *
     * If unset should mean inactive, it has to change in **both** places at
     * once, after checking what the existing rows actually hold.
     */
    isActive: record[USER_PROFILE_FIELDS.isActive] !== false,
    lastLoginAt: (record[USER_PROFILE_FIELDS.lastLoginAt] as string) || null,
    createdAt: (record[USER_PROFILE_FIELDS.createdAt] as string) || "",
    modifiedAt: (record[USER_PROFILE_FIELDS.modifiedAt] as string) || "",
    entityAccess: readEntityAccess(record[USER_PROFILE_FIELDS.entityAccess]),
  };
}

/**
 * Convert UserProfile to Dataverse record (for create/update)
 */
export function mapUserProfileToDataverse(
  profile: Partial<Omit<UserProfile, "id" | "createdAt" | "modifiedAt">>
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  if (profile.email !== undefined) {
    record[USER_PROFILE_FIELDS.email] = profile.email.toLowerCase();
  }
  if (profile.displayName !== undefined) {
    record[USER_PROFILE_FIELDS.displayName] = profile.displayName;
  }
  if (profile.jobTitle !== undefined) {
    record[USER_PROFILE_FIELDS.jobTitle] = profile.jobTitle.slice(0, 200);
  }
  if (profile.role !== undefined) {
    record[USER_PROFILE_FIELDS.role] = getRoleValue(profile.role);
  }
  if (profile.azureUserId !== undefined) {
    record[USER_PROFILE_FIELDS.azureUserId] = profile.azureUserId;
  }
  if (profile.isActive !== undefined) {
    record[USER_PROFILE_FIELDS.isActive] = profile.isActive;
  }
  if (profile.lastLoginAt !== undefined) {
    record[USER_PROFILE_FIELDS.lastLoginAt] = profile.lastLoginAt;
  }
  if (profile.entityAccess !== undefined) {
    const access = sanitizeEntityAccess(profile.entityAccess);
    // Empty is written as an empty string rather than "{}", so "nothing
    // granted" reads the same whether the profile predates the column or had
    // every entity cleared.
    record[USER_PROFILE_FIELDS.entityAccess] =
      Object.keys(access).length > 0 ? JSON.stringify(access) : "";
  }

  return record;
}
