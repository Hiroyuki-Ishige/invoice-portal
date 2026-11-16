/**
 * What the refusal screen and the request mail agree on - and nothing else.
 *
 * **Its own module, importing nothing, because the screen is in the root
 * layout.** `AccessDenied` needed one constant from `registration-request.ts`,
 * and the static import took `mail-shell` (a ~500-line template) and the
 * approval steps into the JavaScript of every page, for the few accounts that
 * are ever refused (rule 19). The builder imports these; so does the screen.
 */

/**
 * Why somebody is asking. `AccessDenied`'s reasons minus `table_not_found`,
 * which no Admin fixes by registering anybody - `AccessDenied` passes its own
 * reason here only after narrowing that one away, so the compiler refuses a
 * reason the screen grows and this set does not.
 */
export type RegistrationRequestReason = "no_profile" | "deactivated" | "not_in_environment";

/** The longest note the screen accepts; the builder cuts to it as well. */
export const MAX_REQUEST_NOTE = 1000;

/**
 * The subject, before the app's marker - for the mail the app sends and the
 * one the reader writes in their own mail app alike, so an Admin's inbox
 * shows one request one way (rule 20).
 */
export function requestSubject(reason: RegistrationRequestReason, who: string): string {
  const kind = reason === "deactivated" ? "Reactivation request" : "Registration request";
  return `${kind}: ${who.trim() || "Somebody"}`;
}

