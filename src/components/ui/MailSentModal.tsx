"use client";

import { useEffect } from "react";
import { Mail, X } from "lucide-react";

export interface MailSentModalProps {
  /** Heading, e.g. "Invitation sent". */
  title: string;
  /** Who it went to. */
  to: string;
  /** Who was copied, if anyone. */
  cc?: string;
  /** Anything worth saying beside the confirmation (a partial refusal). */
  note?: string;
  onClose: () => void;
}

/**
 * Confirms that a mail left the building. HOYA Blue, not green or amber (rule 33): a sent mail is a
 * fact, not a pass/fail. Render it only while it should be up - `{sent && <MailSentModal .../>}`.
 */
export function MailSentModal({ title, to, cc, note, onClose }: MailSentModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 animate-[fadeIn_0.3s_ease-in-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl animate-[popIn_0.3s_ease-in-out]"
      >
        <div className="flex items-start gap-4 px-6 py-5">
          <div className="shrink-0 w-12 h-12 rounded-full bg-[#0057BC]/10 dark:bg-[#00A3DE]/15 flex items-center justify-center">
            <Mail className="w-6 h-6 text-[#0057BC] dark:text-[#00A3DE]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">{title}</h3>
            <dl className="mt-2 grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">To</dt>
              <dd className="min-w-0 break-all text-[#2D2A28] dark:text-white">{to}</dd>
              {cc ? (
                <>
                  <dt className="text-slate-500 dark:text-slate-400">Cc</dt>
                  <dd className="min-w-0 break-all text-[#2D2A28] dark:text-white">{cc}</dd>
                </>
              ) : null}
            </dl>
            {note ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex justify-end bg-slate-50 dark:bg-slate-900/40 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-xl bg-[#0057BC] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004494] transition-colors duration-300 ease-in-out"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
