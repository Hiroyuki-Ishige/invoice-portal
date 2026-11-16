"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useRingiPreview } from "@/hooks/useRingiPreview";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  DEFAULT_PERMISSIONS,
  levelFor,
  parsePermissions,
  type AccessLevel,
  type PermissionTable,
} from "@/lib/auth/permissions";

const fetcher = async (url: string): Promise<{ table: PermissionTable; isDefault: boolean; readable: boolean }> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = (await response.json()) as { table?: unknown; isDefault?: unknown; readable?: unknown };
  // JSON is `unknown` until looked at (rule 12) - the same rebuild the server does.
  return { table: parsePermissions(data.table), isDefault: data.isDefault === true, readable: data.readable !== false };
};

export const ROLE_PERMISSIONS_URL = "/api/settings/role-permissions";

/**
 * **The role permission table in force** (`lib/auth/permissions`), for the
 * menu and the screens. While it loads - and when it cannot be read - the
 * defaults stand in, which are the app as it behaved before the table
 * existed: a screen must not vanish from everybody because a read failed
 * (rule 25). The server asks the stored table on every write regardless.
 */
export function useRolePermissions(): {
  table: PermissionTable;
  isDefault: boolean;
  /** `false` when the server could not read the table (the defaults stand in) - or this request failed. */
  readable: boolean;
  isLoading: boolean;
  error: unknown;
  mutate: () => Promise<unknown>;
} {
  const { isAuthenticated } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(isAuthenticated ? ROLE_PERMISSIONS_URL : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 1000,
  });
  return {
    table: data?.table ?? DEFAULT_PERMISSIONS,
    isDefault: data?.isDefault ?? true,
    readable: error ? false : data?.readable ?? true,
    isLoading,
    error,
    mutate: () => mutate(),
  };
}

/**
 * **The table as it applies to this caller** - the stored one, with the ringi
 * closed while the Ringi preview is on and they are not a trial member
 * (`lib/auth/ringi-preview`). What the menu, the dashboard and the screen gate
 * read; Admin > Role Permissions edits the stored table and never this one.
 */
export function useEffectivePermissions(): PermissionTable {
  const { table } = useRolePermissions();
  const { blocked } = useRingiPreview();
  return useMemo(() => {
    if (!blocked) return table;
    const closed = {} as PermissionTable;
    for (const role of Object.keys(table) as Array<keyof PermissionTable>) {
      closed[role] = { ...table[role], ringi: "none" };
    }
    return closed;
  }, [table, blocked]);
}

/**
 * **This caller's level on one screen.** `checking` until both the person's
 * role and the table are known - a screen must not flash "no access" at
 * somebody it is about to let in (rule 43's shape).
 */
export function useAreaLevel(areaId: string): AccessLevel | "checking" {
  const { role, isLoading: authLoading, profileStatus } = useAuth();
  const { isLoading } = useRolePermissions();
  const table = useEffectivePermissions();
  if (authLoading || profileStatus === "loading" || isLoading) return "checking";
  return levelFor(table, role, areaId);
}
