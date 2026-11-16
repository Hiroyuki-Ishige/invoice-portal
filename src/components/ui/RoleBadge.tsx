/**
 * The chip that says what somebody is: Admin, F&A-Admin or User.
 *
 * One component, because a role shown two ways is a role somebody argues
 * about. It lives beside the signed-in name in the header and against every
 * row of Admin > User Management, and both read their words from
 * `ROLE_LABELS` - the same list the role is *granted* from.
 *
 * **Every role gets a chip, including `user`.** The list used to draw a shield
 * for an admin, a small "F&A" for an F&A-Admin, and nothing at all for anybody
 * else, which leaves the commonest role indistinguishable from a row that has
 * not finished loading. Silence is not a value (CLAUDE.md rule 10).
 */

import { ROLE_HINTS, ROLE_LABELS, type UserRole } from "@/lib/types/user-profile";

/**
 * HOYA Blue for the admin, Cyan Blue for F&A - a real right, but not the
 * admin's - and plain slate for the role almost everybody has, which should
 * read as a statement rather than as a decoration.
 */
const ROLE_CLASSES: Record<UserRole, string> = {
  admin:
    "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  faadmin:
    "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800",
  /* Outlined, not filled: the admin's hue at the lighter weight, for a role
     that has a name but, until its rights are set, nothing more (rule 33 -
     one hue, two weights). */
  capexadmin:
    "bg-white text-[#0057BC] border-[#0057BC]/40 dark:bg-transparent dark:text-[#00A3DE] dark:border-[#00A3DE]/40",
  user: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export function RoleBadge({ role, className = "" }: { role: UserRole; className?: string }) {
  return (
    <span
      title={ROLE_HINTS[role]}
      className={`shrink-0 px-2 py-0.5 text-[11px] font-medium rounded border ${ROLE_CLASSES[role]} ${className}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
