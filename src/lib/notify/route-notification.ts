/**
 * Which addresses this app may mail. A person's email is free text on a stored
 * record and becomes a `toRecipients` entry on `/me/sendMail`, so the message
 * leaves a real employee's mailbox - anything outside the organisation's
 * domains is refused. One rule, exported (rule 5).
 *
 * NEXT_PUBLIC_ because the browser applies the same list (rule 14).
 */
const ALLOWED_MAIL_DOMAINS = (
  process.env.NEXT_PUBLIC_NOTIFY_MAIL_DOMAINS ||
  process.env.NOTIFY_MAIL_DOMAINS ||
  "hoya.com"
)
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

export function isNotifiableAddress(email: string): boolean {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return false;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return ALLOWED_MAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}
