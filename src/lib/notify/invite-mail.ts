/**
 * The message that tells somebody they now have an account here.
 *
 * The third builder beside `route-notification.ts` and `manual-mail.ts`, and the
 * only one that is not about a ringi. It shares their envelope - `mail-shell`
 * for the letterhead, `sendGraphMail()` for the send, `isNotifiableAddress()`
 * for the domain rule - and differs in exactly two ways, both deliberate:
 *
 * ### It carries its own subject marker
 *
 * Ringi mail is prefixed `[Fm Ringi system]` so an inbox rule can gather it.
 * An invitation is not about a ringi, and a rule filtering that marker would
 * start catching a message that has no application number in it. So this one
 * says `[CAPEX Budget]` - a different marker, not the absence of one, because
 * mail from an app that arrives unmarked is the thing the prefix exists to
 * prevent.
 *
 * ### It is sent from the admin who granted the access
 *
 * Like every other message here it goes out on `/me/sendMail` with the acting
 * person's delegated token, so it arrives as "ISHIGE Hiroyuki gave you access",
 * from a colleague, rather than from a no-reply address nobody recognises. That
 * is what makes a link in it safe to click, and it is also why there is no
 * token or secret in the mail: **this is a notice, not a credential**. There is
 * nothing to accept. The account is the reader's own Microsoft 365 account, the
 * profile already exists by the time this is sent, and the link is the plain
 * dashboard URL.
 */

// Relative rather than `@/...`, for the reason `manual-mail.ts` gives: a builder
// for mail that leaves the tenant should stay runnable from a throwaway script,
// and the path alias does not resolve outside Next.
import {
  ROLE_HINTS,
  ROLE_LABELS,
  entityAccessLevel,
  isSuperAdmin,
  type EntityAccess,
  type UserRole,
} from "../types/user-profile";
import { escapeHtml, renderMailShell } from "./mail-shell";

export interface InviteMessageInput {
  /** The new user, as the profile records them. Used in the greeting. */
  displayName: string;
  /** The address the profile was created under - the account they sign in as. */
  email: string;
  role: UserRole;
  /** What was granted per entity. Read through `entityAccessLevel`, never indexed. */
  entityAccess: EntityAccess;
  /** The admin sending it. Empty is tolerated - the sentence just drops the name. */
  invitedBy: string;
  /** `window.location.origin` - the link has to point at the deployment in use. */
  origin: string;
}

/**
 * Entity codes at a given level, in a stable order.
 *
 * `Object.keys` is safe here - own enumerable properties only - but the level is
 * still read through `entityAccessLevel()` rather than indexed, because the map
 * comes back from stored JSON and `access["constructor"]` is truthy on any
 * object literal. Rule 4; it has already cost this repo a day once.
 */
function entitiesAt(access: EntityAccess | null | undefined, level: "edit" | "view"): string[] {
  if (!access) return [];
  return Object.keys(access)
    .filter((code) => entityAccessLevel(access, code) === level)
    .sort();
}

/** What a reader may edit, as `requireEntityWrite()` would decide it. */
export interface AccessSummary {
  /** The entity codes this person may change. Empty when `bypasses` is true. */
  editable: string[];
  /** They are not narrowed by the per-entity rule at all. */
  bypasses: boolean;
  /** `bypasses`, or at least one editable entity. The only test the wording needs. */
  canEditAnything: boolean;
}

/**
 * What the reader may actually do, said the way the admin screen says it.
 *
 * **Edit is enforced; View is not.** Reading is open - every signed-in person
 * sees every entity's figures, in the summaries, the PDF and the chatbot - so a
 * mail that listed "View: HOMS" would be describing a restriction that does not
 * exist, and the first report they opened would contradict it. Only the editable
 * entities are named, and the sentence about reading says plainly that it is not
 * narrowed. Saying what a feature does not do is cheaper than being caught not
 * doing it (rule 10).
 *
 * ### Both bypasses, not just the role
 *
 * `requireEntityWrite()` in `lib/auth/entity-access.ts` lets a caller past the
 * per-entity rule on **two** counts, in this order: the address is on
 * `SUPER_ADMIN_EMAILS`, or the role is `admin`. Reading only the second is how
 * this mail came to tell a super admin whose profile happens to say `user` that
 * they may edit nothing, while the server let them edit everything. The list is
 * the shared one in `types/user-profile.ts` - `isSuperAdminEmail()` next to the
 * server's own check reads the same array, and cannot be imported here because
 * its module pulls in `next/headers`.
 */
export function describeAccess(input: {
  role: UserRole;
  entityAccess: EntityAccess;
  /** The address the profile was created under - a super admin is one by address. */
  email: string;
}): AccessSummary {
  // Listing entities for somebody who bypasses the rule would understate what
  // they have, so the caller is given the flag instead of a list.
  if (isSuperAdmin(input.email) || input.role === "admin") {
    return { editable: [], bypasses: true, canEditAnything: true };
  }
  const editable = entitiesAt(input.entityAccess, "edit");
  return { editable, bypasses: false, canEditAnything: editable.length > 0 };
}

export const INVITE_SUBJECT = "You have access to CAPEX Budget Control";

/**
 * The invitation, ready for `sendGraphMail`.
 *
 * Everything interpolated is escaped here: the shell does not sanitise its
 * `bodyHtml`, because the composer next door needs its formatting preserved.
 * Nothing in this message is typed by anyone, but a display name arrives from
 * the directory and is free text all the same.
 */
export function buildInviteMessage(input: InviteMessageInput): { subject: string; html: string } {
  const firstName = (input.displayName || input.email.split("@")[0]).trim();
  const { editable, bypasses, canEditAnything } = describeAccess({
    role: input.role,
    entityAccess: input.entityAccess,
    email: input.email,
  });

  const greeting = `Hello ${escapeHtml(firstName)},`;
  const opener = input.invitedBy
    ? `${escapeHtml(input.invitedBy)} has given you access to <strong>CAPEX Budget Control</strong>, ` +
      "the CAPEX budget and Ringi approval system."
    : "You have been given access to <strong>CAPEX Budget Control</strong>, " +
      "the CAPEX budget and Ringi approval system.";

  // The scheme is checked, not assumed, and only then escaped. `escapeHtml`
  // stops a string breaking out of the attribute; it does **not** stop the URL
  // itself meaning something else, and `javascript:` in an `href` is exactly
  // that (`mail-shell.ts` says so where `escapeHtml` is defined). Today the
  // only caller passes `window.location.origin`, which cannot be anything but
  // `scheme://host` - so this is here for the next caller, who will pass a
  // configured value. There is nothing to encode: the path is a literal.
  const origin = /^https?:\/\//i.test(input.origin) ? input.origin : "";
  const link = escapeHtml(`${origin}/dashboard`);

  // The amber panel, used only when there is something the reader would
  // otherwise discover by pressing Save and being refused. `canEditAnything`
  // already folds in every bypass - re-testing the role here would say that
  // `describeAccess` is not trusted to answer the question it exists for.
  const notice = canEditAnything
    ? undefined
    : "You can read every budget, but you cannot change any entity's figures yet. " +
      "Ask whoever sent this if you need editing rights.";

  return {
    subject: INVITE_SUBJECT,
    html: renderMailShell({
      eyebrow: "Access granted",
      bodyHtml: `
        <p style="margin:0 0 12px">${greeting}</p>
        <p style="margin:0 0 12px">${opener}</p>
        <p style="margin:0">
          Sign in with your usual Microsoft 365 account - there is no separate
          password to set up.
        </p>`,
      facts: [
        { label: "Sign in as", value: input.email, strong: true },
        { label: "Role", value: `${ROLE_LABELS[input.role]} - ${ROLE_HINTS[input.role]}` },
        {
          label: "May edit",
          // Three sentences, not two, so `canEditAnything` cannot serve here:
          // "every entity" and "these two entities" are both true answers to a
          // question the boolean flattens.
          value: bypasses
            ? "Every entity"
            : editable.length > 0
              ? editable.join(", ")
              : "No entities yet",
        },
        { label: "May read", value: "Every entity's figures" },
      ],
      noticeHtml: notice ? escapeHtml(notice) : undefined,
      ctaLabel: "Open CAPEX Budget Control",
      ctaHref: link,
      footnote:
        "Sent by CAPEX Budget Control. Replying to this message will reach the sender, not the app.",
    }),
  };
}
