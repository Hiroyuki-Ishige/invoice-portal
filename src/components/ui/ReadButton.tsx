"use client";

import type { KeyboardEvent, ReactNode } from "react";

/**
 * **A control that only reads - Preview, Download, open the quotation - and so
 * stays live inside a locked step.**
 *
 * Every locked step on the ringi is locked by one `<fieldset disabled>` (Step
 * 1 once it is approved, Step 2's price table once SCM approves), and the
 * browser disables **every `<button>` under it** - not just the ones that
 * write. Rule 39 says a fieldset closes form controls only; the half that bit
 * here is that a `<button>` *is* a form control, whatever it does. So once
 * Step 1 was approved, its files could not be previewed or downloaded by
 * anybody - reported 2026-11-09 by SCM, who could not open the SOW, drawings
 * and quotations they were negotiating against. The Download icon was faded
 * (`disabled:opacity-40`); Preview and the bin looked live and were just as
 * dead.
 *
 * A `role="button"` span is not a form control, so no fieldset reaches it.
 * It is a button to a keyboard and a screen reader all the same: focusable,
 * Enter and Space press it, and `unavailable` is `aria-disabled` (out of the
 * tab order, the press ignored).
 *
 * **Only for reading.** Anything that writes stays a real `<button>` inside
 * the fieldset, so the lock keeps closing it without anybody having to
 * remember to.
 */
export function ReadButton({
  onPress,
  unavailable = false,
  busy,
  title,
  ariaLabel,
  className = "",
  children,
}: {
  onPress: () => void;
  /** Shown but not pressable - e.g. another download is running. */
  unavailable?: boolean;
  busy?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (unavailable) return;
    if (event.key === "Enter" || event.key === " ") {
      /* Space would otherwise scroll the page, as it does on a button. */
      event.preventDefault();
      onPress();
    }
  };
  return (
    <span
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable || undefined}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={unavailable ? undefined : onPress}
      onKeyDown={onKeyDown}
      className={`cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057BC]/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${className}`}
    >
      {children}
    </span>
  );
}
