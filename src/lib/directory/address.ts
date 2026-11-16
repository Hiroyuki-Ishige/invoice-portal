/**
 * One directory record, one address.
 *
 * Azure AD answers with up to three spellings of the same thing and any of them
 * can be the empty one: `mail` is blank for an account with no mailbox of its
 * own, `email` is what some of this app's own code calls it, and
 * `userPrincipalName` is the sign-in name, which is an address often enough to
 * be worth falling back to. See `.claude/rules/auth.md` -> UPN vs Email.
 *
 * Written out five separate times across the PIC-of-SCM work before this
 * existed - in the PIC store, in the mail composer, and three times in the
 * approval page. None of them were wrong, which is exactly how the sixth one
 * gets the order backwards and mails the wrong box.
 *
 * Deliberately dependency-free, so a lib module, a client component and a
 * throwaway script can all ask the same question.
 */

/** The little of a directory record this needs. `Office365User` satisfies it. */
export interface DirectoryAddressable {
  mail?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
}

export function directoryAddressOf(user: DirectoryAddressable | null | undefined): string {
  if (!user) return "";
  return (user.mail || user.email || user.userPrincipalName || "").trim();
}

/**
 * **Are these one address?** Case and surrounding space ignored - Dataverse,
 * Graph and the directory picker disagree on case - and an empty side is never
 * a match, so two people with no mailbox are not the same person.
 *
 * The one comparison for addresses held as data (a route row against a log
 * line, a PIC against a request). Whether an address is **the caller** is a
 * different question with its own owner - `isCallerAddress()` on the server,
 * `isMe` on the page - because a caller answers to more than one address
 * (rule 1). Four private copies of this existed until 2026-10-23 (review).
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a || "").trim().toLowerCase();
  return left.length > 0 && left === (b || "").trim().toLowerCase();
}
