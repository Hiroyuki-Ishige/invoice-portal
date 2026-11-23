/**
 * What a workbook could not prove (e.g. no total row to cross-check against), above the review table.
 * Amber because the person should look before issuing, not because anything has failed. Renders
 * nothing when there is nothing to say.
 */
export function SheetWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 space-y-1"
    >
      {warnings.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
    </div>
  );
}
