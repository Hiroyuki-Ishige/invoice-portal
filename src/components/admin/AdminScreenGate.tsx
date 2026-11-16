"use client";

/**
 * The one refusal every Admin screen shows.
 *
 * Hiding a link is a courtesy - the address bar defeats it - so each screen in
 * the Admin area asks this before it draws anything. It is still a courtesy:
 * the routes behind these pages refuse on their own (rule 2), and this exists so
 * somebody who followed an old bookmark gets a sentence rather than a screen of
 * controls that fail one by one.
 *
 * What each screen asks is its row in the role permission table (see
 * `useAdminAccess` below) - the same row `destinations.ts` offers it by and
 * its routes check (`checkArea`).
 */

import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAreaLevel } from "@/hooks/useRolePermissions";
import { ACCESS_AREAS, canOpenAdminTools } from "@/lib/auth/permissions";
import { BusyRing } from "@/components/ui/Loading";

/**
 * What an Admin screen asks: its row in the role permission table
 * (`lib/auth/permissions`, set in Admin > Role Permissions), or `"admin"` for
 * the Admin Tools index, which has no row and is the administrators' own.
 * It was "admin" | "finance" - two fixed lists - until 2026-09-28.
 */
export type AdminAccessNeed = string;

export type AdminAccessState = "checking" | "allowed" | "denied";

export function useAdminAccess(need: AdminAccessNeed): AdminAccessState {
  const { role, profileStatus, isLoading } = useAuth();
  const level = useAreaLevel(need === "admin" ? "admin-role-permissions" : need);

  if (isLoading || profileStatus === "loading") return "checking";
  if (need === "admin") return canOpenAdminTools(role) ? "allowed" : "denied";
  if (level === "checking") return "checking";
  return level !== "none" ? "allowed" : "denied";
}

export function AdminScreenGate({
  state,
  need,
}: {
  state: Exclude<AdminAccessState, "allowed">;
  need: AdminAccessNeed;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        {state === "checking" ? (
          <BusyRing size={32} />
        ) : (
          <GlassCard className="max-w-md p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ShieldX className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Access Denied
            </h1>
            {/* Naming the role that would open it, rather than "you need
                permission": whoever is reading this has to ask somebody for
                something, and it saves them a round trip to find out what. */}
            <p className="text-[#B0B5B5] mb-4">
              {need === "admin"
                ? "This screen is for the Admin role."
                : `Your role may not open ${ACCESS_AREAS.find((area) => area.id === need)?.label ?? "this screen"}. An administrator can grant it in Admin > Role Permissions.`}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0057BC] text-white rounded-lg hover:bg-[#004494] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </GlassCard>
        )}
      </main>
    </div>
  );
}
