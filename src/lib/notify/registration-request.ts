/**
 * The message an account this app will not let in sends to the people who can
 * let it in.
 *
 * The fourth builder beside `invite-mail.ts`, and its mirror image: an
 * invitation goes from an Admin to a new user, this goes from somebody who
 * signed in and was refused to the Admins. It shares the same envelope -
 * `mail-shell` for the letterhead, `sendGraphMail()` for the send - and is sent
 * from the **requester's own mailbox** on their delegated `Mail.Send` token,
 * because that is the one thing an account with no registration (and possibly
 * no Dataverse access at all) can still do. A reply reaches the person asking.
 *
 * Nothing here grants anything. It is a sentence in an inbox with a link to
 * User Management, and the Admin still decides there (rule 2).
 */

// Relative rather than `@/...`, for the reason `invite-mail.ts` gives: a builder
// for mail that leaves the browser should stay runnable from a throwaway script.
import { escapeHtml, renderMailShell } from "./mail-shell";
import {
  MAX_REQUEST_NOTE,
  requestSubject,
  type RegistrationRequestReason,
} from "./registration-request-terms";

export interface RegistrationRequestInput {
  reason: RegistrationRequestReason;
  /** The requester's display name, as Microsoft signed them in. May be empty. */
  displayName: string;
  /** The address the refusal screen printed under "Signed in as". */
  signedInAs: string;
  /** Free text the requester typed - site, department, what they need. Optional. */
  note: string;
  /** `window.location.origin` - the link has to point at the deployment in use. */
  origin: string;
}

/**
 * What the Admin is being asked for, per reason.
 *
 * Three sentences, because they are three different jobs: a new row, a switch
 * flipped back on, and - for `"not_in_environment"` - a row that is not enough
 * on its own. That last one is the case this message exists for most: Dataverse
 * answered that it does not know the account, which is how somebody nobody
 * registered reached the app's screens until 2026-10-24, and a profile in User
 * Management does not make Dataverse know them (rule 10 - say what the button
 * will not fix).
 */
const ASKS: Record<RegistrationRequestReason, { eyebrow: string; lead: string; detail?: string }> = {
  no_profile: {
    eyebrow: "Registration request",
    lead: "signed in to <strong>CAPEX Budget Control</strong> and is not registered as a user yet.",
  },
  deactivated: {
    eyebrow: "Reactivation request",
    lead: "signed in to <strong>CAPEX Budget Control</strong>, and their registration is switched off.",
  },
  not_in_environment: {
    eyebrow: "Registration request",
    lead: "signed in to <strong>CAPEX Budget Control</strong>, and Dataverse does not recognise their account.",
    detail:
      "A profile in User Management is not enough on its own here: the account also has to be a user " +
      "of the Dataverse environment (its security group) with a security role, or every screen still " +
      "fails to read data after it is registered.",
  },
};

export function buildRegistrationRequest(
  input: RegistrationRequestInput
): { subject: string; html: string } {
  const ask = ASKS[input.reason];
  const who = (input.displayName || input.signedInAs || "Somebody").trim();
  const note = input.note.trim().slice(0, MAX_REQUEST_NOTE);

  // Checked, then escaped - the reasoning is `invite-mail.ts`'s: escaping stops
  // a string leaving the attribute, not a `javascript:` URL meaning something.
  const origin = /^https?:\/\//i.test(input.origin) ? input.origin : "";
  const link = escapeHtml(`${origin}/admin/users`);

  // The note is typed by the requester, so it is escaped before the line
  // breaks are put back - never the other way round.
  const noteHtml = note
    ? `<p style="margin:12px 0 0;white-space:normal">${escapeHtml(note).replace(/\r?\n/g, "<br>")}</p>`
    : "";

  return {
    subject: requestSubject(input.reason, who),
    html: renderMailShell({
      eyebrow: ask.eyebrow,
      bodyHtml: `
        <p style="margin:0 0 12px">${escapeHtml(who)} ${ask.lead}</p>
        ${ask.detail ? `<p style="margin:0 0 12px">${escapeHtml(ask.detail)}</p>` : ""}
        <p style="margin:0">
          Register the address below in <strong>Admin &gt; User Management</strong>.
          It is the address the requester's browser reported, not one the app could
          confirm - check that it matches the sender of this mail before you do.
        </p>
        ${noteHtml}`,
      facts: [
        { label: "Name", value: input.displayName || "(not given)" },
        { label: "Signed in as", value: input.signedInAs || "(unknown)", strong: true },
      ],
      ctaLabel: "Open User Management",
      ctaHref: link,
      footnote:
        "Sent from the requester's own mailbox by CAPEX Budget Control. Replying reaches them, not the app.",
    }),
  };
}
