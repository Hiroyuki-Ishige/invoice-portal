"use client";

/**
 * The menu as a rail down the left edge, which folds to icons - the way Docker
 * Desktop's does - instead of a drawer that covers the page.
 *
 * **It lives in the root layout, not in `Header`.** Every page draws its own
 * `<Header />`, so a rail owned by the header would be unmounted and mounted
 * again on each navigation: it would flash, replay its width animation and lose
 * which group was open. A layout keeps its state across pages.
 *
 * **Folded, it takes room from the page; opened, it floats over it.**
 * `SideRailFrame` always pads the page by the folded width (56px) and no more,
 * so opening the menu never reflows a screen (asked for, 2026-11-16: the page
 * moved, and tables sat at the width they had been designed for only some of
 * the time). Opened, the rail is above the header (`z-[54]`, the header being
 * `z-50`) with a shadow; it is `fixed` and never scrolls with the page. The fold
 * (`md` and up only - the phone keeps the header's own menu) is remembered in
 * `localStorage`, which is a per-person convenience and nothing else (it may
 * throw, and the rail then starts the way it would for a first visit).
 *
 * Padding is the page's, the header stays a row of the page: nothing here is a
 * negative margin, because two pages clip their root with `overflow-hidden`.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { areaForPath } from "@/lib/auth/permissions";
import {
  NavChildLink,
  isNavGroup,
  isOnEntry,
  useNavMenu,
  type NavGroup,
  type NavItem,
} from "@/components/ui/nav-menu";

const STORAGE_KEY = "sideRailOpen";

/** Wide enough to open by itself on a first visit; narrower keeps the page. */
const OPEN_BY_DEFAULT_FROM_PX = 1280;

/** Screens that are not "inside" the app: no rail while on them. */
const NO_RAIL = ["/sign-in", "/auth"];

const ACTIVE = "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE]";
const IDLE =
  "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800";

/* The fold is read from `localStorage`, an external store, so it is subscribed
   to rather than copied into state by an effect. The server and the first
   client render both say "folded"; the stored (or default) choice follows. */
const foldListeners = new Set<() => void>();

function readOpen(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage: behave as a first visit.
  }
  return stored ? stored === "1" : window.innerWidth >= OPEN_BY_DEFAULT_FROM_PX;
}

function subscribeOpen(listener: () => void): () => void {
  foldListeners.add(listener);
  return () => foldListeners.delete(listener);
}

export function SideRailFrame({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const choose = (next: boolean) => {
    if (!next) setExpandedGroup(null);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // The choice costs the next load, not this click.
    }
    foldListeners.forEach((listener) => listener());
  };

  const showRail = isAuthenticated && !NO_RAIL.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      {showRail && (
        <Rail
          open={open}
          onToggle={() => choose(!open)}
          expandedGroup={expandedGroup}
          setExpandedGroup={setExpandedGroup}
          pathname={pathname}
          openRail={() => choose(true)}
        />
      )}
      {/* `flex flex-col flex-1`: the body is a column, and a page's own
          `flex-1` / `min-h-screen` must keep meaning what they meant when the
          page was its direct child. */}
      <div
        className={`flex flex-col flex-1 print:pl-0 ${
          showRail ? "md:pl-14" : ""
        }`}
      >
        {children}
      </div>
    </>
  );
}

function Rail({
  open,
  onToggle,
  openRail,
  expandedGroup,
  setExpandedGroup,
  pathname,
}: {
  open: boolean;
  onToggle: () => void;
  openRail: () => void;
  expandedGroup: string | null;
  setExpandedGroup: (label: string | null) => void;
  pathname: string;
}) {
  const items = useNavMenu();
  const railRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* Opened, the rail lies over the page, so a press anywhere else - or Escape -
     puts it away, as a drawer does. The fold button is excluded: its own click
     already toggles, and closing here first would let it reopen. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (railRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      onToggle();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggle();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onToggle]);

  return (
    <>
    <aside
      ref={railRef}
      aria-label="Main menu"
      className={`hidden md:flex flex-col fixed left-0 top-0 bottom-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transition-[width,box-shadow] duration-300 ease-in-out print:hidden ${
        open ? "w-60 z-[54] shadow-2xl" : "w-14 z-40"
      }`}
    >
      {/* Level with the header row beside it: its 4px colour bar, then 64px. */}
      <div className="h-[68px] shrink-0 border-b border-slate-200 dark:border-slate-700" />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
        {items.map((item) =>
          isNavGroup(item) ? (
            <Group
              key={item.label}
              group={item}
              open={open}
              expanded={expandedGroup === item.label}
              pathname={pathname}
              onPress={() => {
                // A folded rail has nowhere to list a group's children: open
                // the rail and the group together, as one press.
                if (!open) openRail();
                setExpandedGroup(expandedGroup === item.label && open ? null : item.label);
              }}
            />
          ) : (
            <Entry key={item.href} item={item} open={open} pathname={pathname} />
          )
        )}
      </nav>
    </aside>

      {/* **On the rail's edge, half over the page** - Docker Desktop's fold
          control. It is NOT inside the rail: the rail is `z-40` and the page's
          header is `z-50`, so a child of the rail hung under the header
          (reported 2026-11-16, with the Preview banner pushing the header down
          over it). Its own `z-[55]` clears the header and stays under the
          dialogs at `z-[80]`. `left` follows the rail's width, same 0.3s.
          HOYA Blue filled, white mark: 6.8:1. */}
      <button
        ref={buttonRef}
        onClick={onToggle}
        aria-label={open ? "Collapse menu" : "Expand menu"}
        aria-expanded={open}
        title={open ? "Collapse menu" : "Expand menu"}
        className={`hidden md:flex fixed top-[80px] z-[55] h-8 w-8 items-center justify-center rounded-full border border-white dark:border-slate-900 bg-[#0057BC] text-white shadow-md transition-[left,background-color,transform] duration-300 ease-in-out hover:bg-[#004494] hover:scale-110 print:hidden ${
          open ? "left-[14rem]" : "left-[2.5rem]"
        }`}
      >
        {open ? <ChevronsLeft className="w-[18px] h-[18px]" /> : <ChevronsRight className="w-[18px] h-[18px]" />}
      </button>
    </>
  );
}

/** The icon, and the label while the rail is open. Folded, the label is the tooltip. */
function Entry({
  item,
  open,
  pathname,
}: {
  item: NavItem;
  open: boolean;
  pathname: string;
}) {
  const active = isOnEntry(pathname, item.href);
  return (
    <Link
      href={item.href}
      title={open ? undefined : item.label}
      aria-label={open ? undefined : item.label}
      className={`flex items-center gap-3 h-10 px-2.5 rounded-lg text-sm font-medium transition-colors ${
        active ? ACTIVE : IDLE
      }`}
    >
      <span className={`shrink-0 ${active ? "text-[#0057BC] dark:text-[#00A3DE]" : "text-slate-400 dark:text-slate-500"}`}>
        {item.icon}
      </span>
      {open && (
        <>
          <span className="truncate">{item.label}</span>
        </>
      )}
    </Link>
  );
}

function Group({
  group,
  open,
  expanded,
  pathname,
  onPress,
}: {
  group: NavGroup;
  open: boolean;
  expanded: boolean;
  pathname: string;
  onPress: () => void;
}) {
  const childActive = group.children.some((child) => isOnEntry(pathname, child.href));
  const shown = open && expanded;
  return (
    <div className="space-y-1">
      <button
        onClick={onPress}
        title={open ? undefined : group.label}
        aria-label={open ? undefined : group.label}
        aria-expanded={open ? expanded : undefined}
        className={`flex items-center justify-between w-full h-10 px-2.5 rounded-lg text-sm font-medium transition-colors ${
          childActive ? ACTIVE : IDLE
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 ${childActive ? "text-[#0057BC] dark:text-[#00A3DE]" : "text-slate-400 dark:text-slate-500"}`}>
            {group.icon}
          </span>
          {open && <span className="truncate">{group.label}</span>}
        </span>
        {open && (
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {/* Height follows the content (0fr -> 1fr), never a `max-h` - the Admin
          group outgrew one once already. `inert` takes a closed group's links
          out of the tab order. */}
      <div
        inert={!shown}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-4 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-1 py-1">
            {group.children.map((child) => (
              <NavChildLink
                key={child.href}
                child={child}
                siblings={group.children}
                pathname={pathname}
                onNavigate={() => {}}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200"
                activeClassName="bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE] font-medium"
                idleClassName="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

