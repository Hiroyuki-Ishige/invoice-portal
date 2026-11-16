/**
 * **"Preview"** beside the Ringi application wherever it is offered - the
 * dashboard tab and both menus - while the Ringi preview is on
 * (`lib/auth/ringi-preview`). One spelling, so the three cannot disagree
 * (rule 20).
 *
 * Outlined, one hue: a state, not an alarm (rule 33). `#0057BC` on white is
 * 6.9:1; `#00A3DE` on slate-900 is 6.3:1.
 */
export function PreviewChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`shrink-0 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide leading-4 rounded-full border border-[#0057BC]/40 text-[#0057BC] dark:border-[#00A3DE]/50 dark:text-[#00A3DE] ${className}`}
    >
      Preview
    </span>
  );
}
