/**
 * **Which privilege Dataverse actually said was missing.**
 *
 * A 403 from Dataverse is not a mystery - its body names the privilege, the
 * verb and the table. The status line does not, and every refusal this app has
 * reported so far has been a **guess** dressed as advice: "your security role
 * may lack privileges on Item Explanation or on Notes - ask an administrator"
 * names two tables, three verbs and no answer.
 *
 * **`handleApiError` is the main caller**, and it can be: `DataverseError`
 * carries the body in `detail` and that function already reads it. So one line
 * there gives every Dataverse 403 in the app its privilege name - the schedule
 * delete, the Currency one, items, themes - and the routes that hold a raw
 * `Response` instead of a thrown error call this directly.
 *
 * (An earlier draft of this comment said `handleApiError` "only ever sees a
 * status". It was wrong, and it would have sent the next reader past the one
 * place worth changing - which is rule 32 about a comment, not about data.)
 *
 * That guessing has cost real time twice already. Chasing a schedule's amounts
 * on 2026-09-16, two privileges were ruled out one at a time by screenshots
 * before the real answer - Read on **Currency**, a table nobody had thought to
 * look at - came out of `EntityDefinitions`. Dataverse had been naming it in
 * every response body the whole time.
 *
 * So: read the body. Where it names one, say it. Where it does not, say what
 * was attempted and admit the rest is unknown rather than inventing a list
 * (rule 6 - "could not ask" is not "absent").
 *
 * Pure and dependency-free, so a throwaway script can drive it.
 */

/** The verbs a privilege name can start with, longest first - `AppendTo` is not `Append`. */
const PRIVILEGE_VERBS = [
  "AppendTo",
  "Append",
  "Create",
  "Delete",
  "Assign",
  "Share",
  "Write",
  "Read",
] as const;

/** What the security-role editor calls each verb, so the sentence names a column somebody can find. */
const VERB_LABEL: Record<string, string> = {
  AppendTo: "Append To",
  Append: "Append",
  Create: "Create",
  Delete: "Delete",
  Assign: "Assign",
  Share: "Share",
  Write: "Write",
  Read: "Read",
};

/**
 * `AccessRights: AppendToAccess` is the other shape Dataverse answers in -
 * `SecLib::AccessCheckEx failed` carries this instead of a `prv...` name.
 */
const ACCESS_RIGHT_VERB: Record<string, string> = {
  ReadAccess: "Read",
  WriteAccess: "Write",
  CreateAccess: "Create",
  DeleteAccess: "Delete",
  AppendAccess: "Append",
  AppendToAccess: "AppendTo",
  AssignAccess: "Assign",
  ShareAccess: "Share",
};

export interface MissingPrivilege {
  /** The privilege as Dataverse spelled it, e.g. `prvCreateAnnotation`. `""` when it named none. */
  privilege: string;
  /** The verb in the words the role editor uses, e.g. `Append To`. `""` when unknown. */
  verb: string;
  /** The table's logical name, e.g. `annotation`. `""` when unknown. */
  table: string;
}

/**
 * Pulls the missing privilege out of a Dataverse error body.
 *
 * Handles the two wordings seen from this environment:
 *
 * - `Principal user (Id=...) is missing prvCreateAnnotation privilege (Id=...)
 *   on OTC=5 for entity 'annotation'.`
 * - `SecLib::AccessCheckEx failed. ... AccessRights: AppendToAccess`
 *
 * Returns `null` when neither is there - which is the honest answer for a 403
 * that came from somewhere else entirely, such as a gateway.
 */
export function missingPrivilegeOf(detail: unknown): MissingPrivilege | null {
  const text = String(detail ?? "");
  if (!text) return null;

  /* **Digits are part of a logical name**, and leaving them out does not
     truncate the match - it loses it entirely. `prvReadhi_fy2026budget` has no
     word boundary anywhere inside it that `[A-Za-z_]+?` can stop at, so the
     whole expression fails and a body that names its privilege reads as one
     that named none. No table in this app has a digit today, which is exactly
     why a fixture built from today's names could not have caught it. */
  const named = /\bprv([A-Za-z0-9_]+?)\b/.exec(text);

  /* **Scoped to the text after the privilege**, not searched over the whole
     body. A 403 envelope can carry more than one `for entity` clause - an
     `innererror` repeats the outer message and can name a second table - and a
     sentence that names the wrong table with full confidence is worse than the
     fallback it replaces. */
  const entityIn = (from: number) => /for entity '([A-Za-z0-9_]+)'/.exec(text.slice(from))?.[1];

  if (named) {
    const rest = named[1];
    const verb = PRIVILEGE_VERBS.find((candidate) => rest.startsWith(candidate)) ?? "";
    return {
      privilege: `prv${rest}`,
      verb: verb ? VERB_LABEL[verb] : "",
      /* The entity from the sentence where there is one - `prvCreateAnnotation`
         says "Annotation" in its own name, but a custom table's privilege reads
         `prvAppendTohi_itemexplanation`, whose casing is not the logical name.
         The quoted entity is the one to trust.

         **The order here is a preference no fixture can prove.** In every
         message shape seen from this environment the two agree once the name is
         lowercased, so swapping them passes the whole check - which is worth
         writing down rather than leaving as a green run somebody trusts
         (development.md: items a fixture cannot tell apart cannot fail). What
         the assertions do pin down is each source being used when the other is
         absent. */
      table: entityIn(named.index) ?? (verb ? rest.slice(verb.length).toLowerCase() : ""),
    };
  }

  const rights = /AccessRights:\s*([A-Za-z]+)/.exec(text);
  if (rights) {
    const verb = ACCESS_RIGHT_VERB[rights[1]] ?? "";
    const found = {
      privilege: "",
      verb: verb ? VERB_LABEL[verb] : "",
      /* The whole body here, not the text after the match. The scoping above
         exists because a `prv...` name gives an anchor and a second clause can
         be about a different table; this wording has no anchor - a SecLib
         message carries `ObjectTypeCode: 10412` and usually no `for entity`
         clause at all - so anchoring it to the match position would throw away
         the one clause that could be there. */
      table: entityIn(0) ?? "",
    };
    /* **Nothing learned is `null`, not an empty answer.** `AccessRights: None`
       is a real wording - the principal has no rights at all - and it matches
       this branch while naming neither a verb nor a table. Returned as an
       object it is still truthy, so `privilegeAdvice` produced "does not have
       the privilege it needs" AND suppressed the caller's own fallback, which
       is the sentence that actually lists what to check. A worse answer that
       silences a better one (found in review, 2026-09-17). */
    return found.verb || found.table ? found : null;
  }

  return null;
}

/**
 * **One sentence naming what to grant**, or `null` when Dataverse named nothing.
 *
 * The caller supplies what it was doing, because a privilege name alone is not
 * an instruction: `prvAppendTohi_itemexplanation` is the answer to a question
 * the reader has not asked. Left as `null` rather than padded out with a guess -
 * the caller's own fallback is then the honest sentence (rule 6).
 */
export function privilegeAdvice(detail: unknown): string | null {
  const missing = missingPrivilegeOf(detail);
  if (!missing) return null;

  /* Plain text, no markdown: these sentences are printed into a `<p>`, and a
     `**Create**` that nothing renders reads as a typo in an error message. */
  const table = missing.table ? `"${missing.table}"` : "that table";
  const what = missing.verb
    ? `the ${missing.verb} privilege on ${table}`
    : `the ${missing.privilege || "privilege"} it needs`;

  return (
    `Dataverse refused it: this security role does not have ${what}. ` +
    "An administrator grants it in Power Platform > Security roles > Tables " +
    "(Organization level - these records are owned by whoever created them)."
  );
}
