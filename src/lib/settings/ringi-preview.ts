/**
 * **The Ringi preview setting, as stored** - one `hi_appsetting` row keyed
 * `ringiPreview`, its value `{ enabled, members }` as JSON. What it means is
 * `lib/auth/ringi-preview`; this file only reads and writes it.
 *
 * The same shape as the role permission table (`settings/role-permissions`),
 * for the same reasons: a five-minute process-wide cache cleared by the save,
 * **only a read that answered is cached**, and a failed read answers with the
 * last one that did - or with `readable: false` when there has never been one,
 * which `checkArea` treats as a refusal. A gate must not fail open because
 * Dataverse was slow.
 *
 * **A missing row is an answer** - the preview has never been switched on -
 * unless this process has already read a saved one: a row does not vanish, and
 * a caller who cannot see it must not switch the gate off for everybody.
 */

import { createDataverseRecord, queryDataverseRawAll, updateDataverseRecord } from "@/lib/providers/dataverse/client";
import { APPSETTING_ENTITY_SET } from "@/lib/settings/budget-period";
import { RINGI_PREVIEW_KEY, RINGI_PREVIEW_OFF, parseRingiPreview, type RingiPreviewSetting } from "@/lib/auth/ringi-preview";
import { SUPER_ADMIN_EMAILS, getRoleName, type UserRole } from "@/lib/types/user-profile";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Reading {
  setting: RingiPreviewSetting;
  /** A saved row (`false` = never switched on). */
  stored: boolean;
  /** `false` only when no read has ever answered in this process. */
  readable: boolean;
}

let cache: (Reading & { expiresAt: number }) | null = null;
let lastGood: Reading | null = null;

export function clearRingiPreviewCache(): void {
  cache = null;
}

export async function ringiPreview(token: string): Promise<Reading> {
  if (cache && cache.expiresAt > Date.now()) return { setting: cache.setting, stored: cache.stored, readable: true };

  try {
    const rows = await queryDataverseRawAll<Record<string, unknown>>(
      token,
      `${APPSETTING_ENTITY_SET}?$select=hi_settingvalue&$filter=hi_settingkey eq '${RINGI_PREVIEW_KEY}'`
    );
    const raw = rows[0]?.hi_settingvalue;
    let reading: Reading;
    if (typeof raw === "string" && raw.trim() !== "") {
      try {
        reading = { setting: parseRingiPreview(JSON.parse(raw)), stored: true, readable: true };
      } catch {
        console.warn("[Ringi Preview] The stored setting is not JSON - the last good one (or off) applies");
        reading = lastGood ?? { setting: RINGI_PREVIEW_OFF, stored: false, readable: true };
      }
    } else if (lastGood?.stored) {
      reading = lastGood;
    } else {
      reading = { setting: RINGI_PREVIEW_OFF, stored: false, readable: true };
    }
    lastGood = reading;
    cache = { ...reading, expiresAt: Date.now() + CACHE_TTL_MS };
    return reading;
  } catch (error) {
    console.warn("[Ringi Preview] The setting could not be read:", error instanceof Error ? error.message : error);
    return lastGood ?? { setting: RINGI_PREVIEW_OFF, stored: false, readable: false };
  }
}

/** Upsert by key: one row per setting, or "the" setting becomes ambiguous. */
export async function saveRingiPreview(token: string, setting: RingiPreviewSetting, updatedBy: string): Promise<void> {
  const existing = await queryDataverseRawAll<Record<string, unknown>>(
    token,
    `${APPSETTING_ENTITY_SET}?$select=hi_appsettingid&$filter=hi_settingkey eq '${RINGI_PREVIEW_KEY}'`
  );
  const value = { hi_settingvalue: JSON.stringify(setting), hi_updatedby: updatedBy };
  const existingId = existing[0]?.hi_appsettingid;
  if (typeof existingId === "string") {
    await updateDataverseRecord(token, APPSETTING_ENTITY_SET, existingId, value);
  } else {
    await createDataverseRecord(token, APPSETTING_ENTITY_SET, { hi_settingkey: RINGI_PREVIEW_KEY, ...value });
  }
  clearRingiPreviewCache();
}

export interface ProfileRow {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

/** Every profile, as the preview needs it. The table is small, but rule 13. */
export async function allProfiles(token: string): Promise<ProfileRow[]> {
  const rows = await queryDataverseRawAll<Record<string, unknown>>(
    token,
    "hi_userprofiles?$select=hi_userprofileid,hi_email,hi_role,hi_isactive"
  );
  return rows.flatMap((row): ProfileRow[] => {
    const id = row.hi_userprofileid;
    const email = row.hi_email;
    if (typeof id !== "string" || typeof email !== "string") return [];
    return [
      {
        id: id.toLowerCase(),
        email: email.trim().toLowerCase(),
        role: getRoleName(typeof row.hi_role === "number" ? row.hi_role : 0),
        isActive: row.hi_isactive !== false,
      },
    ];
  });
}

/**
 * **The addresses a ringi mail may reach unmarked**: every active trial
 * member's profile address, the admins' and the super admins'. Matched against
 * the address the route stored, so a member whose route entry carries their
 * other address (UPN beside mailbox) is marked `[TEST]` - the safe direction.
 */
export function memberAddresses(setting: RingiPreviewSetting, profiles: readonly ProfileRow[]): string[] {
  const members = new Set(setting.members ?? []);
  const addresses = profiles
    .filter((profile) => profile.isActive && (profile.role === "admin" || members.has(profile.id)))
    .map((profile) => profile.email);
  return [...new Set([...addresses, ...SUPER_ADMIN_EMAILS.map((email) => email.toLowerCase())])];
}
