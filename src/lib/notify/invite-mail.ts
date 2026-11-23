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
 * Every mail from this app is prefixed `[Invoice Portal]` (`APP_SUBJECT_PREFIX`
 * in `send-mail.ts`) so an inbox rule can gather it. Mail from an app that
 * arrives unmarked is the thing the prefix exists to prevent.
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
import { ROLE_HINTS, ROLE_LABELS, type UserRole } from "../types/user-profile";
import { escapeHtml, renderMailShell } from "./mail-shell";

export interface InviteMessageInput {
  /** The new user, as the profile records them. Used in the greeting. */
  displayName: string;
  /** The address the profile was created under - the account they sign in as. */
  email: string;
  role: UserRole;
  /** The admin sending it. Empty is tolerated - the sentence just drops the name. */
  invitedBy: string;
  /** `window.location.origin` - the link has to point at the deployment in use. */
  origin: string;
}

export const INVITE_SUBJECT = "You have access to Invoice Portal";

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
  const greeting = `Hello ${escapeHtml(firstName)},`;
  const opener = input.invitedBy
    ? `${escapeHtml(input.invitedBy)} has given you access to <strong>Invoice Portal</strong>, ` +
      "the portal for creating, issuing and managing invoices."
    : "You have been given access to <strong>Invoice Portal</strong>, " +
      "the portal for creating, issuing and managing invoices.";

  // The scheme is checked, not assumed, and only then escaped. `escapeHtml`
  // stops a string breaking out of the attribute; it does **not** stop the URL
  // itself meaning something else, and `javascript:` in an `href` is exactly
  // that (`mail-shell.ts` says so where `escapeHtml` is defined). Today the
  // only caller passes `window.location.origin`, which cannot be anything but
  // `scheme://host` - so this is here for the next caller, who will pass a
  // configured value. There is nothing to encode: the path is a literal.
  const origin = /^https?:\/\//i.test(input.origin) ? input.origin : "";
  const link = escapeHtml(`${origin}/dashboard`);
  // The MFA guide is a public page (no sign-in), in both languages - the reader may not be able to
  // sign in until they have read it.
  const guideEn = escapeHtml(`${origin}/guide/mfa`);
  const guideJa = escapeHtml(`${origin}/guide/mfa?lang=ja`);

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
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="margin:18px 0 0">
          <tr>
            <td style="padding:16px 18px;background:#e6eef8;border-left:4px solid #0057BC;
                       border-radius:0 8px 8px 0;font-size:14px;color:#2D2A28">
              <div style="font-size:15px;font-weight:700;color:#0057BC;margin:0 0 6px">
                First time? Set up your second sign-in check (MFA)
              </div>
              <div style="margin:0 0 12px">
                Microsoft asks for a second check with the Microsoft Authenticator app on your
                phone the first time you sign in. It takes about five minutes. Read the guide
                with pictures first:
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#0057BC;border-radius:6px;padding:9px 18px">
                    <a href="${guideEn}" style="color:#ffffff;font-weight:700;text-decoration:none">English guide</a>
                  </td>
                  <td width="10"></td>
                  <td style="background:#0057BC;border-radius:6px;padding:9px 18px">
                    <a href="${guideJa}" style="color:#ffffff;font-weight:700;text-decoration:none">日本語ガイド</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`,
      facts: [
        { label: "Sign in as", value: input.email, strong: true },
        { label: "Role", value: `${ROLE_LABELS[input.role]} - ${ROLE_HINTS[input.role]}` },
      ],
      ctaLabel: "Open Invoice Portal",
      ctaHref: link,
      footnote:
        "Sent by Invoice Portal. Replying to this message will reach the sender, not the app.",
    }),
  };
}
