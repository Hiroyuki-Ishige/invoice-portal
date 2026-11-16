/**
 * The fetcher SWR preloads use - **it never throws**.
 *
 * A preload is a background optimisation: nothing on screen is waiting for it,
 * so a 401 or a dropped connection must warm nothing and break nothing. It
 * resolves `null` instead, and the screen that later asks for the same key
 * fetches it again with a fetcher that *can* report failure.
 *
 * Shared because the dashboard preloads from two places now - the page (its
 * schedules, themes and items) and the budget panel (its own by-theme key) -
 * and a second copy of "fail quietly" is how one of them starts throwing into
 * a render (rule 20).
 */
export const preloadFetcher = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Preload] API returned ${response.status} for ${url}`);
      return null;
    }
    return response.json();
  } catch (error) {
    console.warn(`[Preload] Network error for ${url}:`, error);
    return null;
  }
};
