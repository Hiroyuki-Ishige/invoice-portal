/**
 * **Is this a GUID** - the one test, before an id goes into a Dataverse URL.
 *
 * Sixteen files had their own copy of this regex (review, 2026-10-20; rule 5).
 * It lives here rather than only in `providers/dataverse/client`, which
 * re-exports it, because some of its callers are imported by the browser
 * (`lib/auth/ringi-preview`) and the Dataverse client is not something a page
 * should carry (rule 19). No imports, so it is safe anywhere.
 *
 * Takes `unknown`: an id out of a body or a query is not known to be a string.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(id: unknown): id is string {
  return typeof id === "string" && GUID.test(id);
}
