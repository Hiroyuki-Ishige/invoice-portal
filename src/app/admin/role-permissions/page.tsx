"use client";

/**
 * **Admin > Role Permissions** - which role may open and change each screen
 * (asked for 2026-09-28). Screens down the side, roles across the top, each
 * cell None / Read / Edit. The table and its rules are `lib/auth/permissions`;
 * the server asks it on every write, and this screen only edits it.
 */

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Loader2, Lock, RotateCcw, Save } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingBlock } from "@/components/ui/Loading";
import { ROLE_PERMISSIONS_URL, useRolePermissions } from "@/hooks/useRolePermissions";
import {
  ACCESS_AREAS,
  ACCESS_LABELS,
  DEFAULT_PERMISSIONS,
  isFixedCell,
  parsePermissions,
  type AccessLevel,
  type PermissionTable,
} from "@/lib/auth/permissions";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/types/user-profile";

/** Most to least, as the table reads left to right. */
const COLUMNS: readonly UserRole[] = [...USER_ROLES].reverse();
const GROUPS = ["Invoice", "Master", "Admin"] as const;

/**
 * One set of column widths for the two tables that make up the grid - the
 * pinned heading and the body - so their columns line up (`table-fixed`).
 */
function Columns() {
  return (
    <colgroup>
      <col className="w-[24%]" />
      {COLUMNS.map((role) => (
        <col key={role} className="w-[19%]" />
      ))}
    </colgroup>
  );
}

/** The heading row, drawn by whichever table carries it at this width. */
function HeadingRow() {
  return (
    <tr className="bg-[#0057BC] text-white">
      <th className="text-left px-4 py-3 font-semibold">Screen</th>
      {COLUMNS.map((role) => (
        <th key={role} className="px-3 py-3 font-semibold text-center">
          {ROLE_LABELS[role]}
        </th>
      ))}
    </tr>
  );
}

/**
 * A level as a segment: Edit filled, Read outlined, None plain - one hue at
 * three weights, no legend (rule 33).
 */
function segmentClass(level: AccessLevel, active: boolean): string {
  if (!active) return "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-[#0057BC] dark:hover:text-[#00A3DE]";
  if (level === "edit") return "bg-[#0057BC] text-white dark:bg-[#00A3DE] dark:text-slate-900";
  if (level === "read") return "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#00A3DE]/15 dark:text-[#00A3DE]";
  return "bg-slate-100 text-[#2D2A28] dark:bg-slate-700 dark:text-slate-100";
}

export default function RolePermissionsPage() {
  const { table: saved, isDefault, readable, isLoading, mutate } = useRolePermissions();
  /* The draft is only what has been changed here; everything else reads the
     saved table - never a copy taken while it was still loading (rule 43). */
  const [draft, setDraft] = useState<PermissionTable | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const access = useAdminAccess("admin-role-permissions");
  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-role-permissions" />;

  const current = draft ?? saved;
  const hasChanges = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const setCell = (role: UserRole, areaId: string, level: AccessLevel) => {
    setJustSaved(false);
    setDraft((previous) => {
      const base = previous ?? saved;
      return parsePermissions({ ...base, [role]: { ...base[role], [areaId]: level } });
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(ROLE_PERMISSIONS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: current }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `The table could not be saved (${response.status}).`);
      }
      await mutate();
      setDraft(null);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The table could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />

      <main className="flex-1 py-8 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          {/* **Pinned from `lg`** (asked for, 2026-09-28): the title, the
              buttons and the column headings stay under the app header while
              the rows scroll. The headings are their own table here, sharing
              the body's column widths; below `lg` the grid scrolls sideways,
              where a pinned heading could not follow it, so there the body
              table carries its own heading and nothing is pinned. */}
          <div className="lg:sticky lg:top-16 z-30 -mx-4 md:-mx-6 px-4 md:px-6 lg:pt-4 bg-white dark:bg-[#2D2A28]">
          <div className="mb-6 md:mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] mb-3 md:mb-4 transition-colors text-sm md:text-base"
            >
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
              Back to Home
            </Link>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Role Permissions</h1>
                <p className="text-base md:text-lg text-[#B0B5B5] mt-2">Which role may open and change each screen</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setJustSaved(false);
                    setDraft(parsePermissions(DEFAULT_PERMISSIONS));
                  }}
                  disabled={isSaving}
                  title="Put every cell back to how the app behaved before this table existed (saved only when you save)"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-900 dark:border-slate-300 text-slate-900 dark:text-white text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Defaults
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving || justSaved || !readable}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg ${
                    hasChanges && !isSaving && !justSaved && readable
                      ? PRIMARY_ACTION_FILL
                      : "bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : justSaved ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* The table could not be read: what is shown is the defaults
              standing in, and saving would overwrite the real one - so it is
              said, and Save is off (review, 2026-09-28). */}
          {!isLoading && !readable && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">
                The saved table could not be read, so the defaults are shown and Save is off - saving now would
                overwrite it. Reload the page in a moment.
              </span>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {!isLoading && (
            <div className="hidden lg:block rounded-t-2xl overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <Columns />
                <thead>
                  <HeadingRow />
                </thead>
              </table>
            </div>
          )}
          </div>

          {isLoading ? (
            <GlassCard className="border border-[#B0B5B5]/30">
              <LoadingBlock text="Loading the table..." size={28} row={false} className="py-20" />
            </GlassCard>
          ) : (
            <GlassCard className="border border-[#B0B5B5]/30 p-0 overflow-hidden lg:rounded-t-none lg:border-t-0">
              {/* A comparison grid - the roles only mean something side by
                  side - so it scrolls on a phone rather than restacking. */}
              <div className="overflow-x-auto lg:overflow-visible">
                <table className="w-full min-w-[820px] lg:min-w-0 lg:table-fixed text-sm">
                  <Columns />
                  <thead className="lg:hidden">
                    <HeadingRow />
                  </thead>
                  {GROUPS.map((group) => (
                    <tbody key={group}>
                      <tr>
                        <td
                          colSpan={COLUMNS.length + 1}
                          className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                        >
                          {group}
                        </td>
                      </tr>
                      {ACCESS_AREAS.filter((area) => area.group === group).map((area) => (
                        <tr key={area.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2 text-[#2D2A28] dark:text-slate-100 whitespace-nowrap">
                            {area.label}
                            {area.adminOnly && (
                              <Lock className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5 text-slate-400" aria-label="Admin only" />
                            )}
                          </td>
                          {COLUMNS.map((role) => {
                            const value = current[role][area.id];
                            const fixed = isFixedCell(role, area.id);
                            return (
                              <td key={role} className="px-3 py-2 text-center">
                                <div
                                  role="radiogroup"
                                  aria-label={`${area.label} - ${ROLE_LABELS[role]}`}
                                  className={`inline-flex rounded-lg border overflow-hidden ${
                                    fixed ? "border-slate-200 dark:border-slate-700 opacity-60" : "border-slate-300 dark:border-slate-600"
                                  }`}
                                  title={fixed ? "Fixed - see the note above" : undefined}
                                >
                                  {area.levels.map((level) => (
                                    <button
                                      key={level}
                                      type="button"
                                      role="radio"
                                      aria-checked={value === level}
                                      disabled={fixed || isSaving}
                                      onClick={() => setCell(role, area.id, level)}
                                      className={`px-2.5 py-1 text-xs font-medium transition-colors duration-300 ease-in-out disabled:cursor-not-allowed ${segmentClass(
                                        level,
                                        value === level
                                      )}`}
                                    >
                                      {ACCESS_LABELS[level]}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </GlassCard>
          )}

          {/* Below the table (asked for, 2026-09-28): the table is what this
              screen is for, and it comes first. */}
          {/* What this table does and does not decide - said, because silence
              reads as "this is all there is to it" (rule 10). */}
          <div className="mt-6 p-4 rounded-xl border border-[#0057BC]/30 bg-[#0057BC]/5 dark:border-[#00A3DE]/40 dark:bg-[#00A3DE]/10 text-sm text-[#2D2A28] dark:text-slate-200 space-y-1.5">
            <p>
              <strong>None</strong> hides the screen, <strong>Read</strong> opens it without its changes,{" "}
              <strong>Edit</strong> allows both. The server refuses a change the table does not allow.
            </p>
            <p>
              This comes <strong>on top of</strong>{" "}the rules already there, never instead: a User still sees only the invoices
              of the companies registered to them (User Management &gt; Companies), only an Admin or F&amp;A Admin issues or cancels
              an invoice, and Dataverse&apos;s own security roles still apply.
            </p>
            <p>
              <strong>None closes a screen, not the data behind it</strong>: lists another screen needs (the customers behind
              the invoices, for example) are still read. Who may read data at all is Dataverse&apos;s security roles.
            </p>
            <p>
              <Lock className="inline w-3.5 h-3.5 -mt-0.5" /> Fixed: Admin is Edit everywhere, and User Management,
              Setup and this screen are Admin only - Edit on User Management could grant any role Admin.
            </p>
          </div>

          {!isLoading && readable && isDefault && !hasChanges && (
            <div className="mt-6 p-4 rounded-xl border border-[#2D2A28]/40 dark:border-slate-500 bg-white dark:bg-transparent text-sm text-[#2D2A28] dark:text-slate-300">
              Nobody has saved this table yet, so the defaults above are in force.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
