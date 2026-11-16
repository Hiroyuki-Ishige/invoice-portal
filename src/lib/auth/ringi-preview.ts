/**
 * **Ringi application in preview: trial members only** (asked 2026-10-02).
 *
 * While the ringi is still being built, its applications are tests, and only
 * the people an administrator has ticked in Admin > User Management may open
 * it. One `hi_appsetting` row keyed `ringiPreview` holds the switch and the
 * list (`lib/settings/ringi-preview` reads and writes it).
 *
 * **Why a person and not a role**: Role Permissions is per role, and every
 * trial member today is an ordinary User. A budget planner added next month
 * would be a User too, and would inherit the ringi with the role.
 *
 * It is a gate **in front of** the role permission table, never instead of it:
 * a trial member still needs the table to allow the screen (`checkArea`).
 *
 * - **Admins always pass**, whatever the list says, so no save can lock out
 *   the people who would undo it (rule 25). A super admin passes before this is
 *   asked at all.
 * - **No row is "off"** - the app as it was before the preview existed.
 * - **`members: null` is "never seeded"**: the first time the preview is
 *   switched on, the active profiles of that moment become the list (the
 *   people registered on 2026-10-02 were the trial members). A list that is
 *   empty on purpose is `[]`, and stays empty.
 *
 * Client-safe: no Dataverse import (rule 19). The server's gate, the menu, the
 * screens and the mail marker all read this one module (rule 5).
 */

import type { UserRole } from "@/lib/types/user-profile";
import { validateUUID } from "@/lib/utils/uuid";

export const RINGI_PREVIEW_KEY = "ringiPreview";

export interface RingiPreviewSetting {
  enabled: boolean;
  /** Profile ids (`hi_userprofileid`). `null` = never seeded (see the header). */
  members: string[] | null;
}

export const RINGI_PREVIEW_OFF: RingiPreviewSetting = { enabled: false, members: null };


export function isProfileId(value: unknown): value is string {
  return typeof value === "string" && validateUUID(value);
}

/**
 * A stored value, rebuilt field by field (rule 12): it came out of a column.
 * Anything that is not a profile id is dropped rather than kept as a string
 * some later comparison might match.
 */
export function parseRingiPreview(raw: unknown): RingiPreviewSetting {
  if (!raw || typeof raw !== "object") return RINGI_PREVIEW_OFF;
  const record = raw as { enabled?: unknown; members?: unknown };
  const members = Array.isArray(record.members)
    ? [...new Set(record.members.filter(isProfileId).map((id) => id.toLowerCase()))]
    : null;
  return { enabled: record.enabled === true, members };
}

/** The part of a profile this test reads. */
export interface PreviewProfile {
  id: string;
  role: UserRole;
}

/**
 * **Is this person a trial member?** - an admin profile, or a profile on the
 * list. Asked only while the preview is on; off, everybody is.
 */
export function isRingiMember(setting: RingiPreviewSetting, profiles: readonly PreviewProfile[]): boolean {
  if (!setting.enabled) return true;
  const members = new Set((setting.members ?? []).map((id) => id.toLowerCase()));
  return profiles.some((profile) => profile.role === "admin" || members.has(profile.id.toLowerCase()));
}

/** The refusal, naming what is missing and where it is granted (rule 41). */
export const RINGI_PREVIEW_REFUSAL =
  "Ringi application is in preview and open to trial members only. " +
  "An administrator can add you in Admin > User Management.";

/**
 * **Who a ringi mail may reach without a `[TEST]` mark**, as the browser holds
 * it when it sends:
 *
 * - `null` - the preview is off: nothing is marked;
 * - a list - the trial members' addresses, lowercased;
 * - `"unknown"` - the setting or the list could not be read. **Marked**: an
 *   unneeded `[TEST]` on a test ringi costs nothing, a missing one sends a test
 *   to somebody as if it were real (rule 6).
 */
export type TrialAudience = string[] | null | "unknown";

export const TEST_MAIL_MARK = "[TEST]";

/** Does a message to these addresses need the mark? One outsider marks the whole message. */
export function needsTestMark(addresses: readonly string[], audience: TrialAudience): boolean {
  if (audience === null) return false;
  if (audience === "unknown") return true;
  const members = new Set(audience.map((address) => address.trim().toLowerCase()));
  return addresses.some((address) => !members.has(address.trim().toLowerCase()));
}
