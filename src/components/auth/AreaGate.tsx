"use client";

/**
 * **The role permission table, applied to whichever screen is open**
 * (`lib/auth/permissions`, set in Admin > Role Permissions). One gate in the
 * root layout rather than a check in every page, so no screen can be added
 * without it (rule 5); the screen is found from the address (`areaForPath`).
 *
 * - **None**: the screen is replaced by a sentence naming it and where the
 *   right is granted (rule 41).
 * - **Read**: a strip says so, and `useAreaEditable()` answers false - the
 *   screens that write switch their controls off with it. The server refuses
 *   the change regardless (rules 2, 21).
 * - A screen with no row (Home, sign-in, the Admin Tools index) passes.
 *
 * While the role or the table is still loading the page renders as it would
 * have: a flash of "no access" at somebody about to be let in is worse, and
 * the server is the lock (rule 43's shape).
 */

import { useHeaderHidden } from "@/hooks/useHeaderHidden";
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Eye, ShieldX } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAreaLevel } from "@/hooks/useRolePermissions";
import { areaForPath, type AccessLevel } from "@/lib/auth/permissions";

const AreaLevelContext = createContext<AccessLevel | "checking" | "unlisted">("unlisted");

/**
 * May this caller change what is on the open screen? `true` on Edit - and on
 * a screen with no row, or while the table loads, so nothing is switched off
 * on a guess; `false` on Read (and None, which never renders a screen).
 */
export function useAreaEditable(): boolean {
  const level = useContext(AreaLevelContext);
  return level === "edit" || level === "checking" || level === "unlisted";
}

export function AreaGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const area = areaForPath(pathname ?? "");
  const level = useAreaLevel(area?.id ?? "");
  const value = !area || !isAuthenticated ? "unlisted" : level;
  const { hidden: headerHidden } = useHeaderHidden();

  if (area && isAuthenticated && level === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-white dark:bg-[#2D2A28]">
        <div className="max-w-md p-8 text-center rounded-2xl border border-[#B0B5B5]/30">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ShieldX className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h1>
          <p className="text-[#2D2A28] dark:text-slate-300 mb-4">
            Your role may not open {area.label}. An administrator can grant it in Admin &gt; Role Permissions.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0057BC] text-white rounded-lg hover:bg-[#004494] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AreaLevelContext.Provider value={value}>
      {/* Folds away with the header on a screen that hides it
          (`useHeaderHidden`) - the strip left behind says "Read only". */}
      {area && isAuthenticated && level === "read" && area.levels.includes("edit") && !headerHidden && (
        /* Outlined, one hue - a state, not an alarm (rule 33). */
        <div className="print:hidden flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-[#0057BC] dark:text-[#00A3DE] bg-white dark:bg-slate-900 border-b border-[#0057BC]/30 dark:border-[#00A3DE]/40">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span>
            Read only - your role may view {area.label} but not change it. An administrator can grant Edit in Admin
            &gt; Role Permissions.
          </span>
        </div>
      )}
      {children}
    </AreaLevelContext.Provider>
  );
}

/**
 * **A screen's changes switched off on Read** - one wrapper around a page's
 * `<main>` instead of a condition on each of its buttons. A disabled
 * `<fieldset>` closes every input, select and button inside it (rule 39: form
 * controls only - a link still navigates, which is right for reading). On
 * Edit there is no wrapper at all, so the page's layout is untouched for the
 * people who use it most; `className` carries a flex layout through on Read.
 */
export function AreaReadOnly({ children, className = "" }: { children: ReactNode; className?: string }) {
  const editable = useAreaEditable();
  if (editable) return <>{children}</>;
  return (
    <fieldset disabled className={`min-w-0 border-0 p-0 m-0 ${className}`}>
      {children}
    </fieldset>
  );
}
