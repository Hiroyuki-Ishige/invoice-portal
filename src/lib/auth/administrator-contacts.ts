/**
 * Who to contact when this app will not let you in.
 *
 * A refusal that does not name anybody sends the person to guess (rule 41, one
 * level up): "you are not registered" is only actionable if it also says who
 * registers people. The Admin role is exactly that list, so it is read from the
 * profiles table rather than written into a sentence somewhere - an admin who
 * leaves stops being the contact the same day their profile does.
 *
 * **Admin only, not F&A-Admin.** User Management is Admin only for every role
 * - a fixed row of the role permission table (`lib/auth/permissions`) - so
 * naming anybody else would send the reader to somebody who cannot help.
 *
 * This half is pure and imports nothing, so the browser may hold it and a
 * throwaway fixture may drive it. The Dataverse read is
 * `administrator-contacts-server.ts` (rule 19).
 */

/** One person to contact, as a message may print them. */
export interface AdministratorContact {
  name: string;
  /** Lowercased, and the reason this is worth returning: it is a mailto. */
  email: string;
}

/** A sentence names two or three people, never a directory. */
export const MAX_CONTACTS = 5;

/**
 * One entry per person, not per address.
 *
 * One account arrives under two addresses - the mailbox and the UPN - and a
 * profile is created under whichever one was signed in with, so the super admin
 * on this tenant holds two Admin rows with the same name. Printing them both
 * reads as two people with one name, which is worse than printing either.
 */
export function dedupeAdministrators(
  contacts: AdministratorContact[]
): AdministratorContact[] {
  /* Prototype-less: the key is a display name out of a record, and
     `seen["constructor"]` on a plain object is truthy (rule 4). */
  const seen: Record<string, true> = Object.create(null);
  const kept: AdministratorContact[] = [];

  for (const contact of contacts) {
    if (!contact.email) continue;
    // A profile registered before the name column was filled in still has an
    // address, and the local part of it is a better label than an empty one.
    const name = contact.name || contact.email.split("@")[0];
    const key = name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    kept.push({ name, email: contact.email });
    if (kept.length >= MAX_CONTACTS) break;
  }

  return kept;
}
