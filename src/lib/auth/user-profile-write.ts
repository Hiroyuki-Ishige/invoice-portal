/**
 * Writing a user profile when the table may be older than the app.
 *
 * `hi_entityaccess` was added after the table existed, and Dataverse rejects an
 * entire write over one unknown property - so an environment where Admin >
 * Setup has not been re-run would fail every save on the user screen, including
 * the ones that only change a role. The approvals PATCH already solves this the
 * same way: drop the property Dataverse names, retry, and report what was
 * skipped rather than pretending it was stored.
 */

import {
  createDataverseRecord,
  updateDataverseRecord,
} from "@/lib/providers/dataverse/client";
import { missingColumnFrom } from "@/lib/providers/dataverse/missing-column";
import { USER_PROFILE_ENTITY_SET } from "@/lib/types/user-profile";

const ENTITY_SET = USER_PROFILE_ENTITY_SET;

/*
 * Dataverse names the offending column in its message, and it has **three**
 * wordings for it - `missing-column.ts` owns all of them. This file had two,
 * which was one more than everywhere else and one fewer than there are.
 */
const invalidProperty = missingColumnFrom;

export interface ProfileWriteResult<T> {
  record: T;
  /** Columns Dataverse does not have. Non-empty means Setup has not been run. */
  skipped: string[];
}

/**
 * Retries without the property Dataverse refused, up to `attempts` times.
 *
 * Only an `Invalid property` failure is retried - anything else (no privilege,
 * a bad value, the table missing altogether) still fails loudly, because those
 * are not fixed by writing less.
 */
async function writeWithoutUnknownColumns<T>(
  data: Record<string, unknown>,
  write: (payload: Record<string, unknown>) => Promise<T>,
  attempts = 3
): Promise<ProfileWriteResult<T>> {
  const payload = { ...data };
  const skipped: string[] = [];

  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return { record: await write(payload), skipped };
    } catch (error) {
      const property = invalidProperty(error);
      if (!property || !(property in payload)) throw error;

      delete payload[property];
      skipped.push(property);
      console.warn(`[User Profile] ${property} is not on hi_userprofile - saving without it`);
    }
  }

  throw new Error("Could not save the user profile after dropping unknown columns");
}

export async function createProfileRecord<T>(
  token: string,
  data: Record<string, unknown>
): Promise<ProfileWriteResult<T>> {
  return writeWithoutUnknownColumns(data, (payload) =>
    createDataverseRecord<T>(token, ENTITY_SET, payload)
  );
}

export async function updateProfileRecord(
  token: string,
  id: string,
  data: Record<string, unknown>
): Promise<ProfileWriteResult<void>> {
  return writeWithoutUnknownColumns(data, (payload) =>
    updateDataverseRecord(token, ENTITY_SET, id, payload)
  );
}

/** The notice the screen shows when a column could not be written. */
export function missingColumnWarning(skipped: string[]): string | undefined {
  if (skipped.length === 0) return undefined;
  // Names the button, not the page: "Create table" is hidden once the table
  // exists, which is exactly when this warning appears.
  return `Saved, but ${skipped.join(", ")} could not be stored. Run Admin > Setup > User Profile > "Add missing columns", then save this user again.`;
}
