/**
 * **The role permission table, as stored** - one `hi_appsetting` row keyed
 * `rolePermissions`, its value the table as JSON (`lib/auth/permissions`).
 *
 * A five-minute process-wide cache, cleared by the save. **Only a read that
 * answered is ever cached**, and the last one that did is kept (review,
 * 2026-09-28): this used to cache the defaults on any failure but a 401/403,
 * so one timed-out read put every role back to the defaults - Edit nearly
 * everywhere - for five minutes, undoing whatever an administrator had
 * restricted. A permission table must not fail open.
 *
 * So a failed read answers with the last table read in this process, and
 * with `readable: false` when there has never been one. `checkArea` refuses a
 * write on an unreadable table (the write would not reach Dataverse either),
 * and Admin > Role Permissions will not save over a table it could not see.
 *
 * **A missing row is an answer** - nobody has saved a table, the defaults
 * apply, which are the app as it behaved before the table existed - **unless
 * this process has already read a saved one**: a row does not vanish, and a
 * caller who cannot see it (Read on `hi_appsetting` below Organization level)
 * must not reset everybody else's table.
 */

import { queryDataverseRawAll } from "@/lib/providers/dataverse/client";
import { APPSETTING_ENTITY_SET } from "@/lib/settings/budget-period";
import { DEFAULT_PERMISSIONS, parsePermissions, type PermissionTable } from "@/lib/auth/permissions";

export const ROLE_PERMISSIONS_KEY = "rolePermissions";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Reading {
  table: PermissionTable;
  /** A saved table (`false` = the defaults, nobody has saved one). */
  stored: boolean;
  /** `false` only when no read has ever answered in this process. */
  readable: boolean;
}

let cache: (Reading & { expiresAt: number }) | null = null;
/** The last read that answered - what a failed read falls back to. */
let lastGood: Reading | null = null;

export function clearRolePermissionsCache(): void {
  cache = null;
}

/** The table in force (see the header for what each flag means). */
export async function rolePermissions(token: string): Promise<Reading> {
  if (cache && cache.expiresAt > Date.now()) return { table: cache.table, stored: cache.stored, readable: true };

  try {
    const rows = await queryDataverseRawAll<Record<string, unknown>>(
      token,
      `${APPSETTING_ENTITY_SET}?$select=hi_settingvalue&$filter=hi_settingkey eq '${ROLE_PERMISSIONS_KEY}'`
    );
    const raw = rows[0]?.hi_settingvalue;
    let reading: Reading;
    if (typeof raw === "string" && raw.trim() !== "") {
      try {
        reading = { table: parsePermissions(JSON.parse(raw)), stored: true, readable: true };
      } catch {
        console.warn("[Role Permissions] The stored table is not JSON - the last good one (or the defaults) applies");
        reading = lastGood ?? { table: DEFAULT_PERMISSIONS, stored: false, readable: true };
      }
    } else if (lastGood?.stored) {
      // A saved row does not vanish; this caller cannot see it (see the header).
      reading = lastGood;
    } else {
      reading = { table: DEFAULT_PERMISSIONS, stored: false, readable: true };
    }
    lastGood = reading;
    cache = { ...reading, expiresAt: Date.now() + CACHE_TTL_MS };
    return reading;
  } catch (error) {
    // Nothing is cached: the next caller asks again.
    console.warn("[Role Permissions] The table could not be read:", error instanceof Error ? error.message : error);
    return lastGood ?? { table: DEFAULT_PERMISSIONS, stored: false, readable: false };
  }
}
