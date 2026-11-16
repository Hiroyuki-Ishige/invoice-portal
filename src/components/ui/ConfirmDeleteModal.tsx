"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isImeComposing } from "@/lib/utils/ime";
import { RefreshCw, Trash2 } from "lucide-react";

/**
 * The one delete confirmation in this app.
 *
 * Items, Themes and the Schedule detail page each had their own: two called the
 * browser's `confirm()`, which cannot be styled, reads as a browser fault
 * rather than a decision the app is asking for, and offers the same one-click
 * OK for deleting a CAPEX item as for dismissing a notice. The third had a
 * hand-written modal. Three spellings of one question is how they drift.
 *
 * Deleting here is permanent and the records are referenced by others, so the
 * confirmation asks for the record's name to be typed rather than for a click.
 * That is deliberately slow: the cost of typing a name is a few seconds, and
 * the cost of the wrong row going is a schedule nobody can reconstruct.
 */
export interface ConfirmDeleteModalProps {
  /** Heading, e.g. "Delete this item?" */
  title: string;
  /**
   * The record's name. This is what has to be typed, and it is shown so it can
   * be read and copied - never make somebody guess the string that unlocks a
   * destructive button.
   */
  recordName: string;
  /** Optional second line under the name - a theme, an entity, a PIC. */
  recordSubtitle?: string;
  /** What else the user should know before confirming. */
  warning?: string;
  /** Disables both buttons and shows a spinner on Delete. */
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * What has to be typed. A record with no name would otherwise be unlocked by an
 * empty input - the strictest confirmation in the app becoming the weakest on
 * exactly the rows most likely to be junk.
 */
function requiredPhrase(recordName: string): string {
  return recordName.trim() || "DELETE";
}

/**
 * Render this only while the dialog should be up - `{target && <ConfirmDeleteModal .../>}`.
 *
 * The open/closed state is the parent's, and mounting is what clears the typed
 * name. Keeping the component mounted and resetting the field in an effect is
 * the obvious alternative and the wrong one: it sets state during render-commit,
 * which stops the React compiler optimising the component, and it leaves one
 * frame in which the previous record's name is still in the box - already
 * matching, against a Delete button that is already enabled.
 */
export function ConfirmDeleteModal({
  title,
  recordName,
  recordSubtitle,
  warning,
  isDeleting = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const phrase = requiredPhrase(recordName);
  const matches = typed.trim() === phrase;

  const handleCancel = useCallback(() => {
    if (!isDeleting) onCancel();
  }, [isDeleting, onCancel]);

  // The input is the only thing to do here, so start in it - that saves a click
  // and gives keyboard users somewhere defined to land.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes, but not mid-delete: the request is already in flight and
  // dismissing the dialog would leave the user unsure whether it went through.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleCancel]);

  // Stop the page behind from scrolling while this is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 backdrop-blur-sm p-4 transition-all duration-300 ease-in-out"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      {/* No dismiss-on-backdrop-click: a stray click outside is exactly the
          accident this dialog exists to catch, and losing the typed name to one
          is a pointless punishment. Cancel and Escape both close it. */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 md:p-6 w-full max-w-sm transform transition-all duration-300 ease-in-out">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
        </div>

        <h3
          id={headingId}
          className="text-lg font-semibold text-center text-slate-900 dark:text-white mb-3"
        >
          {title}
        </h3>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-3 py-2.5 mb-3">
          <p className="text-sm font-medium text-slate-900 dark:text-white break-words">
            {recordName.trim() || "(no name)"}
          </p>
          {recordSubtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 break-words mt-0.5">
              {recordSubtitle}
            </p>
          )}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          This cannot be undone.
          {warning ? ` ${warning}` : ""}
        </p>

        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5">
          Type{" "}
          <span className="font-semibold text-slate-900 dark:text-white select-all break-words">
            {phrase}
          </span>{" "}
          to confirm
        </label>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            /* **The one where this bug deletes something.** The box asks for a
               name to be typed, and a Japanese theme name's first conversion
               is an Enter (`lib/utils/ime`). */
            if (isImeComposing(e)) return;
            if (e.key === "Enter" && matches && !isDeleting) onConfirm();
          }}
          disabled={isDeleting}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${phrase} to confirm deletion`}
          className="w-full px-3 py-2 mb-5 text-sm rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-900 dark:border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all duration-300 ease-in-out disabled:opacity-50"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-all duration-300 ease-in-out disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || isDeleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all duration-300 ease-in-out disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
