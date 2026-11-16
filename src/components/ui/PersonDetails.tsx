"use client";

/**
 * **Who the person in the picker beside this actually is** - their job title
 * and their address, with a button that copies the address.
 *
 * Lifted out of `approval/[id]/page.tsx` on 2026-09-04, when Admin >
 * Circulation Route's SCM intake list needed the same two lines beside its own
 * pickers. It had been local to the approval form since it was written; a
 * second copy of it in the admin screen is rule 20's exact subject, and the
 * copy would have been the one that stopped matching - the wrapping rules
 * below are the sort of thing nobody re-derives, they just re-guess.
 *
 * The picker stays a **name box**. It used to repeat the job title on a second
 * line inside itself, where it had a fraction of the width and was the copy
 * that got cut short. Both facts come from the directory with the name and are
 * stored with it (rule 9); neither is typed.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, User } from "lucide-react";

/**
 * Copy one value to the clipboard, and say for two seconds that it worked.
 *
 * Exported because it is useful on its own beside anything worth copying, and
 * because leaving it unexported would have meant the next caller writing a
 * second one - which is how this whole file came to exist.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Denied clipboard permission, or an insecure origin. Nothing useful to
      // do beyond leaving the value on screen to select by hand.
      console.warn("[PersonDetails] Clipboard write was refused");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className="shrink-0 p-1 rounded text-slate-400 hover:text-[#0057BC] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-300"
    >
      {copied ? (
        /* HOYA Blue, not green. The palette is a closed set and green is
           nowhere in it (`.claude/rules/ui-design.md`); this tick was the
           standing debt this component carried, and moving the file is the
           "touched for another reason" the rule asks for. It is the same blue
           the button already hovers to, which is the point - the confirmation
           is the control lighting up, not a second colour appearing. */
        <Check className="w-3.5 h-3.5 text-[#0057BC] dark:text-[#00A3DE]" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

export function PersonDetails({
  email,
  title,
  className = "",
  /**
   * What to show when the directory gave neither.
   *
   * Absent by default, and the component renders nothing - which is right on a
   * ringi, where the name box carries the meaning and a missing title is not
   * news. It is **not** right on the SCM intake list, where the whole purpose
   * of the row is that this person gets emailed: a registration with no address
   * is dropped by `notifiable()` and logged where nobody reads it, so a blank
   * there is a promise the app is quietly not keeping (rule 10). That caller
   * passes a sentence; nobody else has to think about it.
   */
  emptyNote,
}: {
  email: string;
  title: string;
  className?: string;
  emptyNote?: string;
}) {
  if (!email && !title) {
    if (!emptyNote) return null;
    return (
      <div className={`min-w-0 text-xs text-slate-400 dark:text-slate-500 ${className}`}>
        {emptyNote}
      </div>
    );
  }

  return (
    <div
      className={`min-w-0 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400 ${className}`}
    >
      {/* The title wraps, the address does not. "Divisional President, Memory
          Disk Division" reads fine over two lines and badly cut in half; an
          email is one token, so wrapping it just puts the break in an arbitrary
          place. Two lines is the cap - beyond that the row starts pushing the
          people below it around. */}
      {title && (
        <span className="flex items-start gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2 leading-snug" title={title}>
            {title}
          </span>
        </span>
      )}
      {email ? (
        <span className="flex items-center gap-1.5 min-w-0">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate" title={email}>
            {email}
          </span>
          <CopyButton value={email} label="email address" />
        </span>
      ) : (
        /* A title but no address. The same reasoning as the empty case above,
           and the same silence to break: this row will never be mailed. */
        emptyNote && <span className="text-slate-400 dark:text-slate-500">{emptyNote}</span>
      )}
    </div>
  );
}
