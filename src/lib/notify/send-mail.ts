/**
 * Sending a route notification through Graph, as the signed-in user.
 *
 * Browser-side on purpose: `/me/sendMail` needs the approver's own delegated
 * token, which is the point - the mail comes from the person who acted, not
 * from a service account nobody recognises.
 *
 * **Never throws into the approval path.** Every failure here is reported as a
 * value and swallowed by the caller. A ringi that was approved but not
 * announced is a nuisance; an approval that appears to fail because a mailbox
 * was missing is a broken app, and the approver would press the button again.
 */

import {
  type GraphFileAttachment,
} from "./attachments";
import { isNotifiableAddress } from "./route-notification";
import { buildInviteMessage, type InviteMessageInput } from "./invite-mail";
import {
  buildRegistrationRequest,
  type RegistrationRequestInput,
} from "./registration-request";
import { mailContentWidth } from "./mail-shell";
import { buildInvoiceNotice, type InvoiceNoticeInput } from "./invoice-notice";

const GRAPH_SEND_MAIL = "https://graph.microsoft.com/v1.0/me/sendMail";

export interface SendOutcome {
  sent: number;
  /**
   * What went wrong, if anything did. Shown as a notice, never as an error.
   *
   * **Can be set alongside a non-zero `sent`**: a message can go to four people
   * and be refused for a fifth. Read `sent` to decide whether anything happened
   * and `problem` to decide whether to say something about it - testing only
   * `problem` reports a partial send as a total failure.
   */
  problem?: string;
}

/**
 * Common Graph refusals, said in terms of what to do about them.
 *
 * A raw "403 ErrorAccessDenied" sends an operator to the wrong place: the usual
 * cause is that `Mail.Send` has never been consented for this app, which is an
 * Azure AD change, not a mailbox problem.
 */
function explain(status: number, attachmentCount = 0): string {
  // A message too big for one request comes back as 413, and sometimes as a
  // bare 400 - which reads as "the app is broken" unless the attachments are
  // named as the likely cause.
  if ((status === 413 || status === 400) && attachmentCount > 0)
    return "The message was refused - the attachments are probably too large. Remove one and try again.";
  if (status === 413) return "The message was refused as too large.";
  if (status === 403)
    return "Sending mail was refused. Mail.Send may not be consented for this app in Azure AD.";
  if (status === 401) return "The sign-in has expired - sign in again to send notifications.";
  if (status === 404)
    return "This account has no mailbox of its own, so it cannot send the notification.";
  return `Graph refused the message (${status}).`;
}

/**
 * What every subject line this app sends starts with.
 *
 * The point is the inbox, not the app: an approver gets mail about a ringi from
 * the route, from a colleague using Step 5's composer, and from people talking
 * about the same ringi by hand. Only the first two come from here, and one
 * marker at the head of the subject is what makes them filterable and sortable
 * without reading the body.
 */
export const MAIL_SUBJECT_PREFIX = "[Invoice Portal]";

/**
 * The marker for mail that is **not** about a ringi - the invitation, today.
 *
 * A second marker rather than none. The prefix exists so a reader can tell at a
 * glance which app wrote to them and filter accordingly, and that argument
 * covers an invitation as well as an approval. What it does not survive is
 * being lied to: a rule gathering `[Fm Ringi system]` would start collecting a
 * message with no application number in it, and the first person to notice
 * would go looking for the ringi it was about.
 */
export const APP_SUBJECT_PREFIX = "[Invoice Portal]";

/**
 * Put the marker at the head of a subject, once.
 *
 * Idempotent on purpose: the composer shows the prefix to the sender, and a
 * sender who types it as well should not get it twice. Compared
 * case-insensitively for the same reason - `[fm ringi system]` is the same
 * intent, and two spellings in one inbox defeat the filter this exists for.
 */
export function withSubjectPrefix(subject: string, prefix = MAIL_SUBJECT_PREFIX): string {
  const trimmed = subject.trim();
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return trimmed;
  return `${prefix} ${trimmed}`.trim();
}

/** A message ready for Graph: the two lines of it, and who gets it. */
export interface GraphMessage {
  subject: string;
  html: string;
  to: Array<{ name: string; email: string }>;
  /**
   * People copied in - read, not asked.
   *
   * Screened by the same tenant rule as `to`, and **never a substitute for
   * it**: a message with nobody in To is refused even when this list is full.
   * Copying somebody is a statement about who the message is *for*, and a mail
   * addressed to nobody arrives looking like a mistake in every client.
   *
   * Only the hand-written composer sets it. A route notification has one
   * audience by definition - the people the route names - and a Cc there would
   * be the app deciding who else should be reading a ringi.
   */
  cc?: Array<{ name: string; email: string }>;
  /**
   * The marker for this message's subject. Defaults to the ringi one, so the
   * two callers that predate this field keep the prefix they had.
   *
   * **Not a way to send unmarked mail**: an empty string still falls back to the
   * default, because a caller that wanted no marker at all is far more likely to
   * be a caller that forgot the field.
   */
  subjectPrefix?: string;
  /**
   * Files hung on the message - screenshots, a quotation PDF. The hand-written
   * mail carries these; a route notification carries only the inline pictures
   * of the purchasing history it reports (`sendRouteNotification`).
   *
   * Sent inside this request, which is why `lib/notify/attachments.ts` caps
   * what may be picked: Graph refuses a `sendMail` body over 4 MB outright, and
   * the refusal arrives as a 400 with nothing in it about size.
   */
  attachments?: GraphFileAttachment[];
  /** Built at `WIDE_MAIL_WIDTH` - so the `[TEST]` strip above it is as wide. */
  wide?: boolean;
}

/**
 * Put one message on Graph. **The only place this app calls `/me/sendMail`.**
 *
 * Route notifications and the hand-written mail from Step 5 differ in what they
 * say and who decides the recipients - they do not differ in how a message is
 * sent, what a 403 means, or whether a copy lands in Sent Items. Two spellings
 * of that is how one of them quietly stops saving a copy.
 *
 * ### The domain rule is applied here, and it is not a security control
 *
 * `isNotifiableAddress()` used to be checked only by whoever was calling: the
 * server for route notifications, the composer's recipient chips for a
 * hand-written mail. The chip check is a courtesy - this runs in the browser on
 * the user's own delegated token, so anyone willing to open devtools could call
 * straight past it, and could equally have opened Outlook and typed the address
 * themselves. Nothing here can stop that, and pretending otherwise is worse
 * than not trying.
 *
 * What the check *is* good for is keeping one rule in one place, so a stale
 * address on a route and a mistyped one in the composer are refused by the same
 * sentence. That belongs at the last point before the send, not at each caller,
 * which is what this file already claims to be.
 */
export async function sendGraphMail(
  message: GraphMessage,
  graphToken: string | null
): Promise<SendOutcome> {
  const addressed = message.to.filter((person) => person.email);
  const recipients = addressed.filter((person) => isNotifiableAddress(person.email));
  /* Copies go through the identical filter - one rule, not a second spelling of
     it (rule 20). An outside address is no more mailable for being in Cc. */
  const copiedTo = (message.cc ?? []).filter((person) => person.email);
  const copies = copiedTo.filter((person) => isNotifiableAddress(person.email));
  const refused =
    addressed.length - recipients.length + (copiedTo.length - copies.length);

  if (recipients.length === 0) {
    return {
      sent: 0,
      problem:
        refused > 0
          ? "Those addresses are outside the organisation, so nothing was sent."
          : "Nobody on that stage has an email address to notify.",
    };
  }
  if (!graphToken) {
    return { sent: 0, problem: "Could not get permission to send mail - nobody was notified." };
  }

  const subject = withSubjectPrefix(message.subject, message.subjectPrefix || MAIL_SUBJECT_PREFIX);
  const html = message.html;

  try {
    const response = await fetch(GRAPH_SEND_MAIL, {
      method: "POST",
      headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: recipients.map((person) => ({
            emailAddress: { address: person.email, name: person.name },
          })),
          // Omitted when empty for the same reason `attachments` is: every
          // notification this app has ever sent went without the property.
          ...(copies.length
            ? {
                ccRecipients: copies.map((person) => ({
                  emailAddress: { address: person.email, name: person.name },
                })),
              }
            : {}),
          // Omitted rather than sent empty: `attachments: []` is accepted, but
          // every message this app has ever sent went without the property and
          // there is no reason for the common case to start carrying it.
          ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        },
        // Kept, so the approver has their own record of what was sent and to whom.
        saveToSentItems: true,
      }),
    });

    if (!response.ok) return { sent: 0, problem: explain(response.status, message.attachments?.length) };
    // Sent, but not to everyone asked for. Reported rather than swallowed: the
    // sender is looking at a list of names and has no other way to learn that
    // one of them was dropped.
    /* **`sent` counts To, never Cc**, and the two callers that read it are why.
       Both ask "did this message reach anybody it was addressed to", and a
       message that reached only its copies did not. The Cc addresses that were
       refused are still reported through `problem`, because the sender is
       looking at a list of names and has no other way to learn one was
       dropped. */
    return {
      sent: recipients.length,
      problem:
        refused > 0
          ? `${refused} ${refused === 1 ? "address was" : "addresses were"} outside the organisation and ${refused === 1 ? "was" : "were"} not mailed.`
          : undefined,
    };
  } catch {
    return { sent: 0, problem: "Could not reach Microsoft 365 - nobody was notified." };
  }
}

/**
 * Tell somebody they now have an account. **The one way an invitation is sent.**
 *
 * Two screens ask for this - the Create User button and the Invite button on
 * each row - and neither of them chooses the recipient, the marker or the
 * wording. That is the whole reason this exists rather than each caller
 * assembling a `GraphMessage`: the invitation sent on creation and the one sent
 * a week later from the list are the same message, or the second is a puzzle.
 */
export async function sendInvitation(
  invite: Omit<InviteMessageInput, "origin">,
  graphToken: string | null,
  /** Copied in - the admin pressing the button, so they keep a copy in their own inbox. */
  cc: Array<{ name: string; email: string }> = []
): Promise<SendOutcome> {
  const { subject, html } = buildInviteMessage({ ...invite, origin: window.location.origin });
  return sendGraphMail(
    {
      subject,
      html,
      to: [{ name: invite.displayName || invite.email, email: invite.email }],
      cc,
      subjectPrefix: APP_SUBJECT_PREFIX,
    },
    graphToken
  );
}

/**
 * Ask the Admins to register (or switch back on) the account that is signed in.
 * **The one way a registration request is sent** - from `AccessDenied`, the
 * screen an account this app will not let in sees instead of the app.
 *
 * Sent from the requester's own mailbox, like everything else here: it needs
 * only their Microsoft 365 sign-in and `Mail.Send`, never Dataverse, which is
 * exactly what an unregistered account may not have. The caller chooses who to
 * ask (the Admin profiles, or the super admins when those could not be read);
 * the wording, marker and link are this file's.
 */
export async function sendRegistrationRequest(
  request: Omit<RegistrationRequestInput, "origin">,
  to: { name: string; email: string }[],
  graphToken: string | null
): Promise<SendOutcome> {
  const { subject, html } = buildRegistrationRequest({ ...request, origin: window.location.origin });
  return sendGraphMail({ subject, html, to, subjectPrefix: APP_SUBJECT_PREFIX }, graphToken);
}

/**
 * Tell a site's accounting that invoices were issued to it. **The one way that mail is sent.**
 *
 * Sent from the signed-in user's own mailbox, like the invitation, after they have seen who it
 * goes to. `to` and `cc` are the customer's addresses (Admin > Mail Notifications), screened by
 * the same tenant rule as every other mail. `pdfs` are the invoices' files, when they go along.
 */
export async function sendInvoiceNotice(
  notice: Omit<InvoiceNoticeInput, "attached">,
  to: string[],
  cc: string[],
  pdfs: GraphFileAttachment[],
  graphToken: string | null
): Promise<SendOutcome> {
  const { subject, html } = buildInvoiceNotice({ ...notice, attached: pdfs.length > 0 });
  const person = (email: string) => ({ name: email, email });
  return sendGraphMail(
    {
      subject,
      html,
      to: to.map(person),
      cc: cc.map(person),
      attachments: pdfs,
      subjectPrefix: APP_SUBJECT_PREFIX,
    },
    graphToken
  );
}
