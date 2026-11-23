/**
 * Every admin screen there is, in one list.
 *
 * There were two: the cards on the dashboard's Admin tab and the Admin group in
 * the sidebar. They had drifted - the board offered Budget Fix Status and a
 * SharePoint folder the sidebar had never heard of, the sidebar offered User
 * Management, FX Rates and Setup the board did not show - so which admin
 * screens exist depended on where you looked for them. One list, one owner
 * (CLAUDE.md rule 5); the next admin page is added here and appears in both.
 *
 * Each entry also carries **its row in the role permission table** (`area`),
 * for the same reason: who may see a screen is decided in Admin > Role
 * Permissions (`lib/auth/permissions`), and must be the same answer in the
 * sidebar, on the dashboard board, on the page itself and in its routes. It
 * was a fixed list of roles per entry until 2026-09-28.
 *
 * **Destinations only.** The board also carries Permissions, which has no page
 * behind it, and it stays written out where it is: a card can say NOT BUILT
 * next to its title, whereas a line in a navigation menu that goes nowhere just
 * reads as a broken app. "Copy budget to other Q" was the other one until
 * 2026-09-13 and is now an entry here like any other.
 */

import { BookOpen, Building2, Database, Mail, Users, type LucideIcon } from "lucide-react";
import { Grid3x3 } from "lucide-react";
import { levelFor, type PermissionTable } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types/user-profile";

export interface AdminDestination {
  label: string;
  /** The line under the card's title. The sidebar has no room for it. */
  description: string;
  href: string;
  /** Not a route in this app: rendered as a plain link, opened in a new tab. */
  external?: boolean;
  icon: LucideIcon;
  /**
   * Its row in the role permission table. Written out on every entry, so a new
   * screen is a decision about who gets it - and a row the table does not know
   * is None for everybody but Admin (`levelFor`), never a silent grant.
   */
  area: string;
}

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  { label: "User Management", description: "Registration and access", href: "/admin/users", icon: Users, area: "admin-users" },
  { label: "Role Permissions", description: "Which role may open and change each screen", href: "/admin/role-permissions", icon: Grid3x3, area: "admin-role-permissions" },
  { label: "Customers", description: "Companies invoices are addressed to", href: "/admin/customers", icon: Building2, area: "admin-customers" },
  { label: "Mail Notifications", description: "Who is told when an invoice is issued", href: "/admin/notifications", icon: Mail, area: "admin-notifications" },
  { label: "Admin Guide", description: "How to add users and set their access", href: "/admin/guide", icon: BookOpen, area: "admin-guide" },
  { label: "Setup", description: "Create and repair Dataverse tables", href: "/admin/setup", icon: Database, area: "admin-setup" },
];

/**
 * The admin screens one role may see.
 *
 * The sidebar, the mobile menu and the dashboard's Admin tab all go through
 * here, so a screen cannot be hidden in one place and offered in another.
 */
export function adminDestinationsFor(role: UserRole, table: PermissionTable): AdminDestination[] {
  return ADMIN_DESTINATIONS.filter((destination) => levelFor(table, role, destination.area) !== "none");
}
