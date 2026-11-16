"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

/**
 * **What a screen shows when it could not read its data.**
 *
 * Four pages used to answer a failed load by rendering `mockThemes` /
 * `mockItems` / `mockData` - two invented themes with a made-up PIC and 2024
 * dates, a fabricated budget on the Summary. Fabricated rows are worse than an
 * empty list and far worse than an error: they are indistinguishable from real
 * ones, so a reader takes a network failure for a data loss, or worse, takes the
 * invented figures for the budget (rule 17 - never write what you could not
 * compute; rule 6 - "could not ask" is not "absent").
 *
 * It is one component and not four sentences because the Schedule page already
 * had this right, in its own words, and a fifth spelling is how the five come to
 * describe the same failure differently (rule 20).
 *
 * **Not red.** The palette reserves red for a destructive act or a refusal that
 * must not be missed (`.claude/rules/ui-design.md`), and a load that failed is
 * neither - it is a fact about the network. What makes it impossible to mistake
 * for an empty list is the **box**: a different shape, which the eye finds
 * before it reads, the same reasoning the quotation-expiry treatment uses.
 */
export function LoadFailed({
  /** What could not be read, in the reader's words: "schedules", "themes". */
  what,
  onRetry,
  isRetrying = false,
}: {
  what: string;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className="flex justify-center px-4 py-10 md:py-12">
      <div className="max-w-md rounded-xl border border-[#2D2A28]/40 bg-white px-5 py-5 text-center dark:border-slate-500 dark:bg-transparent">
        <AlertCircle className="mx-auto mb-2 h-6 w-6 text-[#2D2A28] dark:text-slate-300" />
        <p className="text-sm font-medium text-[#2D2A28] dark:text-white">
          Could not load {what}
        </p>
        {/* Says what this is NOT, because that is the whole point of the change:
            nothing has been deleted, and the screen is not describing the data. */}
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Nothing has been changed or deleted - this screen simply could not read
          them. Check your connection and try again; if it keeps happening, sign out
          and back in.
        </p>
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0057BC] px-4 py-2 text-sm font-medium text-white transition-colors duration-300 ease-in-out hover:bg-[#004494] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRetrying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
      </div>
    </div>
  );
}

export default LoadFailed;
