/**
 * **`map` over async work, at most `limit` at a time, results in input order.**
 *
 * Written for the budget explanation review (2026-09-15): reading five files one
 * after another put the whole review close to its time limit, and reading all
 * five at once would hold five 10MB bodies in memory together. Two at a time is
 * the trade - roughly half the wait, twice the memory of one file, never five.
 *
 * Order is the point of returning an array indexed by input: the review shows
 * the model the files newest first, and that must not depend on which OCR call
 * happened to finish first.
 *
 * Pure - no Node or browser API - so a script can drive it.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
