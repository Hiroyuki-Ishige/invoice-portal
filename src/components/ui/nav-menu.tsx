"use client";

/**
 * The app's menu: what it holds, for whom, and how a page finds its place in it.
 *
 * It lived in `Header.tsx` while the only thing that drew it was the header's
 * own overlay. The side rail (`SideRail.tsx`, in the root layout) and the
 * header's phone menu both draw it now, so it is written once here and each
 * frame only decides how to lay it out (rule 5).
 */

import Link from "next/link";
import { Home, FileText, Settings, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { adminDestinationsFor } from "@/components/admin/destinations";
import { useEffectivePermissions } from "@/hooks/useRolePermissions";
import { areaForPath, canOpenAdminTools, levelFor, type PermissionTable } from "@/lib/auth/permissions";
import { useAuth } from "@/components/providers/AuthProvider";
import type { UserRole } from "@/lib/types/user-profile";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Leaves the app - rendered as a plain `<a>` into a new tab, not a `Link`. */
  external?: boolean;
}

export interface NavGroup {
  label: string;
  icon: React.ReactNode;
  children: NavItem[];
}

export type MenuItem = NavItem | NavGroup;

export function isNavGroup(item: MenuItem): item is NavGroup {
  return "children" in item;
}

/**
 * **The name of the screen you are on**, for the header beside the brand.
 *
 * Read from the same menu the sidebar draws, never written a second time: a
 * title that disagrees with the item lit up in the menu is two answers to "where
 * am I" (rule 5). A group's child wins over its parent, and the longest matching
 * `href` wins over a shorter one, so `/admin/circulation-route` is "Circulation
 * Route" rather than "Admin Tools".
 *
 * `null` for a page no menu entry covers - a ringi, one schedule, the sign-in
 * screen. Those have their own heading a few pixels below, and repeating it in
 * the chrome would be the same words twice. An empty space is the honest answer
 * to a question the menu cannot answer.
 */
export function screenNameFor(pathname: string, items: MenuItem[]): string | null {
  type Best = { label: string; length: number };
  let best: Best | null = null;

  const consider = (item: NavItem) => {
    if (item.external) return;
    const matches = pathname === item.href || pathname.startsWith(item.href + "/");
    if (!matches) return;
    if (!best || item.href.length > best.length) {
      best = { label: item.label, length: item.href.length };
    }
  };

  for (const item of items) {
    if (isNavGroup(item)) item.children.forEach(consider);
    else consider(item);
  }

  return (best as Best | null)?.label ?? null;
}

/**
 * Which entry the current page belongs to, most specific first.
 *
 * A plain `startsWith` lights up every ancestor: on /admin/circulation-route it
 * marks Admin Tools (/admin) as well, so two items in one group claim to be the
 * page you are on. A sibling that matches more of the path wins.
 */
export function isNavActive(pathname: string, href: string, siblings: NavItem[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;

  return !siblings.some(
    (other) =>
      other.href.length > href.length &&
      (pathname === other.href || pathname.startsWith(other.href + "/"))
  );
}

/**
 * One entry inside an expanded group, in the sidebar and in the mobile menu.
 *
 * The two used to be near-identical `<Link>` blocks. They are one component now
 * because the Admin group gained a SharePoint folder: an external destination
 * has to be an `<a target="_blank">`, and `next/link` would treat the URL as a
 * route to prefetch. Written once, so the mobile menu cannot quietly keep the
 * old behaviour - which is exactly what happened to these two menus in the
 * first place.
 */
export function NavChildLink({
  child,
  siblings,
  pathname,
  onNavigate,
  className,
  activeClassName,
  idleClassName,
}: {
  child: NavItem;
  siblings: NavItem[];
  pathname: string;
  onNavigate: () => void;
  className: string;
  activeClassName: string;
  idleClassName: string;
}) {
  const isActive = isNavActive(pathname, child.href, siblings);
  const classes = `${className} ${isActive ? activeClassName : idleClassName}`;
  const body = (
    <>
      <span
        className={
          isActive
            ? "text-[#0057BC] dark:text-[#00A3DE]"
            : "text-slate-400 dark:text-slate-500"
        }
      >
        {child.icon}
      </span>
      {child.label}
      {child.external && <ExternalLink className="w-3 h-3 ml-auto shrink-0 opacity-60" />}
    </>
  );

  if (child.external) {
    return (
      <a
        href={child.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={classes}
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={child.href} onClick={onNavigate} className={classes}>
      {body}
    </Link>
  );
}

/**
 * The Admin group for one role, built from the one list of admin screens.
 *
 * Returns nothing at all for a role with no business in the Admin area, so the
 * group is absent rather than empty - an "Admin" heading that opens onto no
 * links reads as a broken app, and it also tells the reader that screens exist
 * which they are not being shown.
 *
 * Admin Tools is written out because `/admin` is not one of the destinations -
 * it is the page that holds what is left over, and it is Admin-only. Everything
 * after it comes from `adminDestinationsFor()`, so an admin screen added there
 * shows up here and on the dashboard's Admin tab at once, with the same rule
 * about who may see it.
 */
export function adminGroupFor(role: UserRole, table: PermissionTable): NavGroup[] {
  const children: NavItem[] = [
    ...(canOpenAdminTools(role)
      ? [{ label: "Admin Tools", href: "/admin", icon: <Settings className="w-4 h-4" /> }]
      : []),
    ...adminDestinationsFor(role, table).map((destination) => {
      const Icon = destination.icon;
      return {
        label: destination.label,
        href: destination.href,
        external: destination.external,
        icon: <Icon className="w-4 h-4" />,
      };
    }),
  ];

  if (children.length === 0) return [];
  return [{ label: "Admin", icon: <Settings className="w-5 h-5" />, children }];
}

/**
 * Everything above the Admin group - the same for everybody who is signed in.
 *
 * The sidebar and the mobile menu used to hold a byte-identical copy of this
 * list each, which is the arrangement that let the Admin group drift apart from
 * the dashboard's board in the first place. One list, two frames (rule 5).
 */
export const BASE_MENU_ITEMS: MenuItem[] = [
  { label: "Home", href: "/dashboard", icon: <Home className="w-5 h-5" /> },
  { label: "Invoices", href: "/invoices", icon: <FileText className="w-5 h-5" /> },
];

/**
 * The menu above the Admin group for one role: every entry whose screen the
 * role may open, and a group only while it has an entry left. Home is every
 * signed-in person's, and has no row in the table.
 */
export function menuForRole(role: UserRole, table: PermissionTable): MenuItem[] {
  const open = (href: string | undefined) => {
    if (!href || href === "/dashboard") return true;
    const area = areaForPath(href);
    return !area || levelFor(table, role, area.id) !== "none";
  };
  return BASE_MENU_ITEMS.flatMap((entry): MenuItem[] => {
    if ("children" in entry && entry.children) {
      const children = entry.children.filter((child) => open(child.href));
      return children.length > 0 ? [{ ...entry, children }] : [];
    }
    return open((entry as { href?: string }).href) ? [entry] : [];
  });
}

/**
 * The menu this caller gets. Every frame renders this one array, and the Admin
 * group is absent - not disabled, not empty - for anyone without a screen in
 * it. Hiding a link is a courtesy: each admin page and every route behind it
 * refuses on its own (rule 2). The role permission table decides what is
 * offered (Admin > Role Permissions); while it loads, its defaults stand in.
 */
export function useNavMenu(): MenuItem[] {
  const { role } = useAuth();
  const permissions = useEffectivePermissions();
  return useMemo(
    () => [...menuForRole(role, permissions), ...adminGroupFor(role, permissions)],
    [role, permissions]
  );
}

/** Is the page on this menu entry (the entry's own path or anything under it)? */
export function isOnEntry(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
