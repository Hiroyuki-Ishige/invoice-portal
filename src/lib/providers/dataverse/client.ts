/**
 * Dataverse OData Client
 *
 * Provides methods to query Dataverse using OData API
 */

import { getDataverseUrl } from "./msal-config";

const API_VERSION = "v9.2";

interface DataverseResponse<T> {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  value: T[];
}

/**
 * A refusal from Dataverse, with the status it refused under.
 *
 * These used to be thrown as a plain `Error` whose message happened to start
 * with a number, so `handleApiError` had nothing to read and answered **500 -
 * Internal server error** for every one of them. An account with no Dataverse
 * user record then looked exactly like a bug in this app: every page reported a
 * server error, and the one fact that would have explained it - Dataverse said
 * 401 - was inside a string nobody parsed.
 *
 * 401 and 403 are the two that matter. They are not our failures, and they send
 * an operator to completely different places: a lapsed token versus an account
 * that has never been given access to the environment.
 */
export class DataverseError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    operation: string
  ) {
    super(`Dataverse ${operation} failed: ${status} - ${detail}`);
    this.name = "DataverseError";
  }
}

/** Reads Dataverse's own message out of its JSON envelope, if it sent one. */
export function dataverseMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    return parsed?.error?.message || detail;
  } catch {
    return detail;
  }
}

/**
 * Headers for a hand-written PATCH or POST - a write that needs its raw
 * `Response` (a status per row, a refusal's body for `privilegeAdvice`), which
 * the helpers here do not hand back. `extra` is where `If-Match: *` goes: a
 * PATCH without it is an upsert.
 */
export function dataverseWriteHeaders(accessToken: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    ...extra,
  };
}

/**
 * Get standard headers for Dataverse API requests - the write headers, and the
 * formatted values every read here relies on (one list, rule 20).
 */
function getHeaders(accessToken: string): HeadersInit {
  return dataverseWriteHeaders(accessToken, { Prefer: "odata.include-annotations=*" });
}

/**
 * Execute OData query against Dataverse
 */
export async function queryDataverse<T>(
  accessToken: string,
  entitySet: string,
  options?: {
    select?: string[];
    filter?: string;
    expand?: string;
    orderby?: string;
    top?: number;
  }
): Promise<T[]> {
  const baseUrl = getDataverseUrl();
  const url = new URL(`${baseUrl}/api/data/${API_VERSION}/${entitySet}`);

  if (options?.select) {
    url.searchParams.set("$select", options.select.join(","));
  }
  if (options?.filter) {
    url.searchParams.set("$filter", options.filter);
  }
  if (options?.expand) {
    url.searchParams.set("$expand", options.expand);
  }
  if (options?.orderby) {
    url.searchParams.set("$orderby", options.orderby);
  }
  if (options?.top) {
    url.searchParams.set("$top", options.top.toString());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new DataverseError(response.status, errorText, "query");
  }

  const data: DataverseResponse<T> = await response.json();
  return data.value;
}

/**
 * Execute raw OData query with custom URL
 */
export async function queryDataverseRaw<T>(
  accessToken: string,
  queryUrl: string
): Promise<T[]> {
  const baseUrl = getDataverseUrl();
  const url = queryUrl.startsWith("http")
    ? queryUrl
    : `${baseUrl}/api/data/${API_VERSION}/${queryUrl}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new DataverseError(response.status, errorText, "query");
  }

  const data: DataverseResponse<T> = await response.json();
  return data.value;
}

/**
 * Like `queryDataverseRaw`, but it reads every page.
 *
 * `queryDataverseRaw` returns `data.value` and drops `@odata.nextLink`, so any
 * result larger than Dataverse's page cap (5,000 by default) comes back
 * **silently truncated**. For a lookup table that is harmless; for
 * `hi_scheduleamounts` it means a budget total summed from part of the data,
 * with nothing anywhere saying so - the one class of defect this app's money
 * rules exist to prevent, and the hardest to notice, because a total that is
 * merely too small still looks like a total.
 *
 * `queryDataverseAll` already paginates but builds its own query from options;
 * this takes the same hand-written query string the raw reader takes, so the
 * call sites that already had their `$filter` and `$expand` written out can
 * switch by changing the function name and nothing else.
 */
export async function queryDataverseRawAll<T>(
  accessToken: string,
  queryUrl: string
): Promise<T[]> {
  const baseUrl = getDataverseUrl();
  let url: string | null = queryUrl.startsWith("http")
    ? queryUrl
    : `${baseUrl}/api/data/${API_VERSION}/${queryUrl}`;

  const all: T[] = [];

  while (url) {
    const response: Response = await fetch(url, {
      method: "GET",
      headers: getHeaders(accessToken),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new DataverseError(response.status, errorText, "query");
    }

    const data: DataverseResponse<T> = await response.json();
    all.push(...data.value);
    // Already absolute, and it carries the paging cookie - never rebuilt.
    url = data["@odata.nextLink"] || null;
  }

  return all;
}

/**
 * Get all records with pagination handling
 */
export async function queryDataverseAll<T>(
  accessToken: string,
  entitySet: string,
  options?: {
    select?: string[];
    filter?: string;
    expand?: string;
    orderby?: string;
    /**
     * **A ceiling on how much of a table one read is willing to pay for.**
     *
     * Absent - the usual case - means every page, which is what a list screen
     * needs. A caller that only ever shows the newest handful passes a number
     * instead, and then has to **say** that it looked at that many rather than
     * report a total it did not count (rule 44). Dataverse answers at most this
     * many and stops paging, so it is a real bound, not a slice of the result.
     */
    top?: number;
  }
): Promise<T[]> {
  const baseUrl = getDataverseUrl();
  let url: string | null = `${baseUrl}/api/data/${API_VERSION}/${entitySet}`;

  const params = new URLSearchParams();
  if (options?.select) {
    params.set("$select", options.select.join(","));
  }
  if (options?.filter) {
    params.set("$filter", options.filter);
  }
  if (options?.top && Number.isFinite(options.top) && options.top > 0) {
    params.set("$top", String(Math.floor(options.top)));
  }
  if (options?.expand) {
    params.set("$expand", options.expand);
  }
  if (options?.orderby) {
    params.set("$orderby", options.orderby);
  }

  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  const allRecords: T[] = [];

  while (url) {
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders(accessToken),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new DataverseError(response.status, errorText, "query");
    }

    const data: DataverseResponse<T> = await response.json();
    allRecords.push(...data.value);

    url = data["@odata.nextLink"] || null;
    /* **The ceiling is enforced here, not only asked for.** Dataverse honours
       `$top`, but a `top` larger than its own page cap can still come back with
       a `nextLink`, and a bound that depends on the server keeping its side of
       the bargain is not a bound. */
    if (options?.top && allRecords.length >= options.top) break;
  }

  return options?.top ? allRecords.slice(0, options.top) : allRecords;
}

/** Validate GUID format - the one definition is `utils/uuid` (it has no imports). */
export { validateUUID } from "@/lib/utils/uuid";

/**
 * Sanitize string for OData filter to prevent injection.
 * Escapes single quotes and removes potentially dangerous OData operators.
 */
export function sanitizeODataString(value: string): string {
  if (!value) return value;
  return value
    .replace(/'/g, "''") // Escape single quotes
    .replace(/\$/g, "") // Remove OData operators ($filter, $select, etc.)
    .replace(/\\/g, ""); // Remove backslashes
}

/**
 * Create a new record in Dataverse
 */
export async function createDataverseRecord<T>(
  accessToken: string,
  entitySet: string,
  data: Record<string, unknown>
): Promise<T> {
  const baseUrl = getDataverseUrl();
  const url = `${baseUrl}/api/data/${API_VERSION}/${entitySet}`;

  const response = await fetch(url, {
    method: "POST",
    // The created row comes back, with its id and `@odata.etag`.
    headers: writeHeaders(accessToken, undefined, { Prefer: "return=representation" }),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new DataverseError(response.status, errorText, "create");
  }

  return await response.json();
}

/**
 * **The headers of every write** - create, update and delete (rule 20).
 *
 * - `If-Match` when `ifMatch` is given: the row's `@odata.etag` as it was
 *   read, so a row somebody changed since is refused with **412** rather than
 *   overwritten (rule 27); `*` asks only that the row exists.
 * - `Prefer: odata.include-annotations=*`, as every read sends - harmless on a
 *   write that answers 204. A writer that wants the row back passes
 *   `Prefer: return=representation` in `extra`, which replaces it.
 */
function writeHeaders(accessToken: string, ifMatch?: string, extra: Record<string, string> = {}): HeadersInit {
  return dataverseWriteHeaders(accessToken, {
    Prefer: "odata.include-annotations=*",
    ...extra,
    ...(ifMatch ? { "If-Match": ifMatch } : {}),
  });
}

/** One PATCH of one row, thrown as a `DataverseError` when refused. */
async function patchRecord(
  accessToken: string,
  entitySet: string,
  id: string,
  data: Record<string, unknown>,
  options: { ifMatch?: string; returnColumn?: string } = {}
): Promise<Response> {
  const select = options.returnColumn ? `?$select=${options.returnColumn}` : "";
  const response = await fetch(`${getDataverseUrl()}/api/data/${API_VERSION}/${entitySet}(${id})${select}`, {
    method: "PATCH",
    headers: writeHeaders(
      accessToken,
      options.ifMatch,
      options.returnColumn ? { Prefer: "return=representation" } : {}
    ),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new DataverseError(response.status, await response.text(), "update");
  }
  return response;
}

/**
 * Update an existing record in Dataverse. `ifMatch` makes it conditional
 * (`writeHeaders`); without it a PATCH is also an upsert.
 */
export async function updateDataverseRecord(
  accessToken: string,
  entitySet: string,
  id: string,
  data: Record<string, unknown>,
  ifMatch?: string
): Promise<void> {
  await patchRecord(accessToken, entitySet, id, data, { ifMatch });
}

/**
 * **The version a read of one row came back at** - what an `If-Match` sends.
 *
 * The `ETag` header *or* the body's `@odata.etag`, whichever arrived. Three
 * writers read only the header (`answer-route` twice, `ringipic-action`) while
 * every other reader in this app reads the body; where Dataverse puts the
 * version only in the body, those writers sent no `If-Match` at all, and the
 * lock against two people answering at once was off without anything saying so
 * (review, 2026-10-20; rule 27). `null` when neither is there.
 */
export function rowVersion(headers: Headers, body: unknown): string | null {
  const fromBody =
    body && typeof body === "object" ? (body as Record<string, unknown>)["@odata.etag"] : undefined;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return headers.get("ETag");
}

/**
 * **An update that answers with the row's new version** - its `@odata.etag`
 * as Dataverse wrote it, from the PATCH's own response (`return=representation`
 * with one column selected). Reading the row again afterwards would be a second
 * round trip, and could hand back the version of somebody else's write that
 * landed in between - which the caller's next `If-Match` would then wave
 * through (rule 27). `null` when the response carried none.
 */
export async function updateDataverseRecordReturningVersion(
  accessToken: string,
  entitySet: string,
  id: string,
  primaryKey: string,
  data: Record<string, unknown>,
  ifMatch?: string
): Promise<string | null> {
  const response = await patchRecord(accessToken, entitySet, id, data, { ifMatch, returnColumn: primaryKey });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const etag = body?.["@odata.etag"] ?? response.headers.get("ETag");
  return typeof etag === "string" ? etag : null;
}

/** Delete a record from Dataverse; `ifMatch` makes it conditional (`writeHeaders`). */
export async function deleteDataverseRecord(
  accessToken: string,
  entitySet: string,
  id: string,
  ifMatch?: string
): Promise<void> {
  const response = await fetch(`${getDataverseUrl()}/api/data/${API_VERSION}/${entitySet}(${id})`, {
    method: "DELETE",
    headers: writeHeaders(accessToken, ifMatch),
  });
  if (!response.ok) {
    throw new DataverseError(response.status, await response.text(), "delete");
  }
}
