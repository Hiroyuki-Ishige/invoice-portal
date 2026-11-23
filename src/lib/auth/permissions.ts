/**
 * **Who may open each screen, and who may change what is on it** - one table,
 * screens down the side, roles across the top, each cell None, Read or Edit
 * (asked for 2026-09-28, set from Admin > Role Permissions).
 *
 * **It is a gate in front of the rules that were already here, never instead
 * of them** - what a person may actually do is what this table allows *and*
 * what those allow:
 *
 * - Schedule & Amount still asks the person's per-site budget plan access
 *   (`lib/auth/entity-access.ts`).
 * - A ringi is still editable only by the people its route names
 *   (`approval/may-edit-application`).
 * - Meeting in MD's meeting check is still Admin only (signed).
 * - Dataverse's own security roles still decide what a write may touch
 *   (rule 17); this table can only take away, never grant past them.
 *
 * **Enforced by the server on every write** (`checkArea` in
 * `lib/auth/require-signed-in`): a Read screen's buttons are switched off as a
 * courtesy, and the route refuses anyway (rules 2, 21). Reads are gated by the
 * screen, not by each API - a list of themes is read by the Items screen too -
 * and Dataverse's security roles govern what data a person can read at all.
 *
 * **Three cells are not the table's to change**:
 * - the Admin column is Edit everywhere, so no save can lock the
 *   administrators out of the screen that would undo it (rule 25);
 * - User Management, Setup and this table are Admin only for every role -
 *   Edit on User Management could grant a role Admin, so offering it to
 *   anyone else would make every other cell decoration.
 *
 * Client-safe: no Dataverse import (rule 19) - the menu, the screens and the
 * routes all read this one module (rule 5).
 */

import { INVOICE_CREATOR_ROLES, USER_ROLES, type UserRole } from "@/lib/types/user-profile";

export type AccessLevel = "none" | "read" | "edit";
export const ACCESS_LEVELS: readonly AccessLevel[] = ["none", "read", "edit"];
export const ACCESS_LABELS: Record<AccessLevel, string> = { none: "None", read: "Read", edit: "Edit" };

export interface AccessArea {
  id: string;
  label: string;
  /** Where it sits in the menu - the rows are grouped by it. */
  group: "Invoice" | "Master" | "Admin";
  /** The screen's address; an area with none is a link out (Document Folder). */
  href: string;
  /** The levels that mean something here - Assistant and Export have nothing to edit. */
  levels: readonly AccessLevel[];
  /** Admin only for every role, whatever the table says (see the header). */
  adminOnly?: boolean;
}

const ALL = ACCESS_LEVELS;
const NO_EDIT: readonly AccessLevel[] = ["none", "read"];
/** A right inside a screen rather than a screen: seeing it comes with the screen. */
const NO_EDIT_NONE: readonly AccessLevel[] = ["read", "edit"];
void NO_EDIT_NONE;
void NO_EDIT;

/* `as const` so that every id below is a type (`AccessAreaId`): a gate that
   names a screen this list does not have is a compile error, not a quiet
   "none". Four write routes asked for `roleGate-fix-status` and friends -
   ids no row carries - and `levelFor()` answered "none" for every role, so
   only the two super admins could save those screens while the screens
   offered Edit (review, 2026-10-20; rules 21, 25). */
const AREAS = [
  { id: "invoices", label: "Invoices", group: "Invoice", href: "/invoices", levels: ALL },
  { id: "admin-users", label: "User Management", group: "Admin", href: "/admin/users", levels: ALL, adminOnly: true },
  { id: "admin-role-permissions", label: "Role Permissions", group: "Admin", href: "/admin/role-permissions", levels: ALL, adminOnly: true },
  { id: "admin-setup", label: "Setup", group: "Admin", href: "/admin/setup", levels: ALL, adminOnly: true },
  { id: "admin-customers", label: "Customers", group: "Admin", href: "/admin/customers", levels: ALL, adminOnly: true },
  { id: "admin-guide", label: "Admin Guide", group: "Admin", href: "/admin/guide", levels: ALL, adminOnly: true },
  // Not adminOnly: F&A-Admin keeps who is told about an invoice (FINANCE_ADMIN_AREAS).
  { id: "admin-notifications", label: "Mail Notifications", group: "Admin", href: "/admin/notifications", levels: ALL },
] as const satisfies readonly AccessArea[];

/** The id of a row of `ACCESS_AREAS` - what every gate must name. */
export type AccessAreaId = (typeof AREAS)[number]["id"];

export const ACCESS_AREAS: readonly AccessArea[] = AREAS;

/** One role's column: area -> level. */
export type RolePermissions = Record<string, AccessLevel>;
/** The whole table: role -> column. */
export type PermissionTable = Record<UserRole, RolePermissions>;

const area = (id: string): AccessArea | undefined => ACCESS_AREAS.find((entry) => entry.id === id);

/**
 * The Finance screens F&A-Admin had before this table - **its defaults, not a
 * limit**: Admin > Role Permissions can change every one of them.
 */
const FINANCE_ADMIN_AREAS: string[] = ["admin-notifications"];

/**
 * **The table before anybody saves one - the app as it behaved the day this
 * arrived**, so that turning the feature on changes nothing. The one new
 * column, IIR-Admin (CAPEX-Admin until 2026-10-17), is as asked: Meeting in MD and IIR Deck Edit, no Admin
 * screen, the rest as a User - and the IIR approval mark Read, as a User's
 * was; Admin > Role Permissions can give it Edit.
 */
function defaultColumn(role: UserRole): RolePermissions {
  const column: RolePermissions = {};
  for (const entry of ACCESS_AREAS) {
    let level: AccessLevel;
    if (role === "admin") level = entry.levels.includes("edit") ? "edit" : "read";
    else if (entry.group === "Admin") level = role === "faadmin" && FINANCE_ADMIN_AREAS.includes(entry.id) ? "edit" : "none";
    else if (!entry.levels.includes("edit")) level = "read";
    else if (entry.id === "invoices") level = INVOICE_CREATOR_ROLES.includes(role) ? "edit" : "read";
    else level = "edit";
    column[entry.id] = level;
  }
  return column;
}

export const DEFAULT_PERMISSIONS: PermissionTable = Object.fromEntries(
  USER_ROLES.map((role) => [role, defaultColumn(role)])
) as PermissionTable;

/**
 * A table off a request body or a stored JSON, **rebuilt cell by cell from the
 * known roles and areas** - so a stored table from before an area existed gets
 * that area's default, an unknown key is dropped, and a value that is not a
 * level for that area falls back rather than being trusted (rules 4, 12, 36).
 * The fixed cells are put back whatever was sent.
 */
export function parsePermissions(raw: unknown): PermissionTable {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const table = {} as PermissionTable;
  for (const role of USER_ROLES) {
    const stored = Object.prototype.hasOwnProperty.call(source, role) ? source[role] : undefined;
    const cells = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
    const column: RolePermissions = {};
    for (const entry of ACCESS_AREAS) {
      const value = Object.prototype.hasOwnProperty.call(cells, entry.id) ? cells[entry.id] : undefined;
      column[entry.id] =
        typeof value === "string" && (entry.levels as readonly string[]).includes(value)
          ? (value as AccessLevel)
          : DEFAULT_PERMISSIONS[role][entry.id];
    }
    table[role] = column;
  }
  return withFixedCells(table);
}

/** The cells the table may not change (see the header), put back. */
function withFixedCells(table: PermissionTable): PermissionTable {
  for (const role of USER_ROLES) {
    for (const entry of ACCESS_AREAS) {
      if (role === "admin") table[role][entry.id] = entry.levels.includes("edit") ? "edit" : "read";
      else if (entry.adminOnly) table[role][entry.id] = "none";
    }
  }
  return table;
}

/** Whether a cell is fixed - the Admin column, and the Admin-only rows. */
export function isFixedCell(role: UserRole, areaId: string): boolean {
  return role === "admin" || area(areaId)?.adminOnly === true;
}

/** One role's level on one area. An area this code does not know is None. */
export function levelFor(table: PermissionTable, role: UserRole, areaId: string): AccessLevel {
  return table[role]?.[areaId] ?? "none";
}

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, edit: 2 };

/** Does `level` give at least `need`? */
export function allows(level: AccessLevel, need: Exclude<AccessLevel, "none">): boolean {
  return RANK[level] >= RANK[need];
}

/**
 * The best level among several roles - a person with two active profiles gets
 * the more generous, as every role test in `require-signed-in` already does.
 */
export function bestLevel(table: PermissionTable, roles: readonly UserRole[], areaId: string): AccessLevel {
  return roles.reduce<AccessLevel>((best, role) => {
    const level = levelFor(table, role, areaId);
    return RANK[level] > RANK[best] ? level : best;
  }, "none");
}

/** The area a path belongs to - the screen's own, or the longest `href` it starts with. */
export function areaForPath(pathname: string): AccessArea | undefined {
  return ACCESS_AREAS.filter((entry) => entry.href && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** The sentence a refusal says - which screen, which level, which role. */
export function areaRefusal(areaId: string, need: Exclude<AccessLevel, "none">): string {
  const label = area(areaId)?.label ?? areaId;
  return need === "edit"
    ? `Your role may not change ${label}. An administrator can grant Edit in Admin > Role Permissions.`
    : `Your role may not open ${label}. An administrator can grant Read in Admin > Role Permissions.`;
}

/**
 * **The Admin Tools index (`/admin`)** - the administrators' own overview of
 * every Admin screen. It has no row in the table, so it is not the table's to
 * open: Admin only. One predicate for the menu and the screen's gate (rule 20).
 */
export function canOpenAdminTools(role: UserRole): boolean {
  return role === "admin";
}
