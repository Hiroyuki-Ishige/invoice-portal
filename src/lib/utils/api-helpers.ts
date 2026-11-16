/**
 * Common API helper functions
 * Shared across Dataverse API routes
 */

import { NextResponse } from "next/server";
import { DataverseError, dataverseMessage } from "@/lib/providers/dataverse/client";
import { privilegeAdvice } from "@/lib/providers/dataverse/privilege-error";
import { lengthAdvice } from "@/lib/providers/dataverse/length-error";

// ============================================================================
// Error Handling
// ============================================================================

/**
 * What a refusal from Dataverse should be answered with.
 *
 * 500 says "this app broke". For the two that matter it did not: the token
 * lapsed, or the account was never given access to the environment. Reporting
 * both as 500 cost a real afternoon - a user signed in, every page reported
 * "Internal Server Error", and nothing on screen or in the response said the
 * account simply had no Dataverse user record.
 */
const DATAVERSE_STATUS: Record<number, { status: number; error: string; code: string }> = {
  400: {
    status: 400,
    error: "Dataverse rejected the request",
    code: "DATAVERSE_BAD_REQUEST",
  },
  401: {
    status: 401,
    // Two causes, and the message has to name both or it sends people to the
    // wrong one: an expired token looks identical to an unprovisioned account.
    error:
      "Dataverse did not accept the sign-in. Either the session expired - sign in again - " +
      "or this account has no user record in the Dataverse environment yet.",
    code: "DATAVERSE_UNAUTHORIZED",
  },
  403: {
    status: 403,
    /*
     * **"this action", not "reading".** It said reading, and a 403 on a delete
     * then told somebody to check a Read privilege that was already granted -
     * the missing one was Delete. This handler does not know which verb was
     * attempted, so it must not name one (rule 10). Reported 2026-09-16, when
     * deleting an entity row answered "does not allow reading this table".
     */
    error:
      "Dataverse refused access. The account is signed in, but its security role does not " +
      "allow this action on this table - check Read, Write, Create, Append To and Delete " +
      "for the tables involved, not only Read.",
    code: "DATAVERSE_FORBIDDEN",
  },
  404: { status: 404, error: "Not found in Dataverse", code: "DATAVERSE_NOT_FOUND" },
  429: { status: 429, error: "Dataverse is rate limiting - try again shortly", code: "DATAVERSE_THROTTLED" },
};

/**
 * Handle API errors consistently.
 *
 * A `DataverseError` is answered with what Dataverse actually said, because it
 * is not this app failing; anything else is a genuine 500. Details are still
 * suppressed in production - a Dataverse message can name tables and columns.
 *
 * `columnLabels` is what the caller's form calls each column, for the one
 * sentence below that names a column (a value too long for it).
 */
export function handleApiError(
  error: unknown,
  context: string,
  columnLabels?: ReadonlyMap<string, string>
): NextResponse {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] Exception:`, errorMessage);

  const isProduction = process.env.NODE_ENV === "production";

  if (error instanceof DataverseError) {
    const mapped = DATAVERSE_STATUS[error.status] ?? {
      // Anything else upstream is a bad gateway, not our internal error.
      status: 502,
      error: "Dataverse could not be reached",
      code: "DATAVERSE_ERROR",
    };
    /**
     * **The status goes in the sentence, even in production.**
     *
     * `details` stays suppressed - a Dataverse message names tables and columns.
     * A three-digit status names nothing, and it is the one thing that separates
     * "the request was malformed" from "your role does not allow this", which is
     * the difference between a bug to fix and a privilege to grant. Without it
     * every report is "Dataverse rejected the request" and the first hour goes
     * on working out which kind it is - twice on 2026-09-16 (rule 10).
     */
    /**
     * **The privilege Dataverse named, where it named one** - in production too.
     *
     * This is the one function that words every Dataverse refusal in the app,
     * and the sentence above is necessarily generic: it has a status and no
     * verb, so it lists five privileges and leaves the reader to try them.
     * That list has been tried, one privilege at a time, three times in two
     * days - Append To on Schedule Amount, then Append To on CAPEX Schedule,
     * both wrong; the answer was Read on **Currency**, a table nobody had
     * thought to look at. The body said `prvReadtransactioncurrency` every
     * time and nothing read it.
     *
     * **`details` stays suppressed and this is not it.** The rule above exists
     * because a Dataverse message carries a .NET envelope, record GUIDs and
     * the caller's own id. `privilegeAdvice()` extracts exactly two tokens -
     * a verb and a logical table name - from a message only the person who was
     * refused ever sees, and the table is one they are about to open in the
     * security-role editor anyway. The alternative is telling them to guess,
     * which is the thing that keeps costing days (rule 10).
     */
    /*
     * **A value too long for its column, named - with Dataverse's own limit.**
     * The same reasoning as the privilege above: a bare "rejected the request
     * (400)" sent a user creating an item to the developer (2026-10-26), when
     * the body said which field and how many characters it holds.
     */
    const named =
      error.status === 403
        ? privilegeAdvice(error.detail)
        : error.status === 400
          ? lengthAdvice(error.detail, columnLabels)
          : null;

    return NextResponse.json(
      {
        error: named ?? `${mapped.error} (${error.status})`,
        code: mapped.code,
        ...(isProduction ? {} : { details: dataverseMessage(error.detail) }),
      },
      { status: mapped.status }
    );
  }

  return NextResponse.json(
    {
      error: "Internal server error",
      ...(isProduction ? {} : { details: errorMessage })
    },
    { status: 500 }
  );
}

// ============================================================================
// Data Extraction Helpers
// ============================================================================

/**
 * Extract item name from various possible field names in Dataverse record
 * Note: For hi_capexitem table, only hi_itemname exists (NOT hi_name or hi_capexitemname)
 */
export function extractItemName(item: Record<string, unknown>): string {
  return (
    item.hi_itemname ||
    item["_hi_item_value@OData.Community.Display.V1.FormattedValue"] ||
    item["hi_capexitemid@OData.Community.Display.V1.FormattedValue"]
  ) as string || "";
}

/**
 * Extract theme name from item record (lookup field)
 */
export function extractThemeName(item: Record<string, unknown>): string {
  return (
    item["_hi_capextheme_value@OData.Community.Display.V1.FormattedValue"] ||
    item["_hi_theme_value@OData.Community.Display.V1.FormattedValue"]
  ) as string || "";
}

/**
 * Extract theme ID from item record (lookup field)
 */
export function extractThemeId(item: Record<string, unknown>): string {
  return (
    item._hi_capextheme_value ||
    item._hi_theme_value
  ) as string || "";
}

/**
 * **The person in charge - which is not the record owner.**
 *
 * `hi_capexitem` carries `hi_pic`, a lookup to `systemuser`, and this used to
 * read `_ownerid_value` *first* - so wherever an item's PIC was printed, the
 * name shown was whoever created the record. Asked of the tenant on 2026-09-03:
 * **275 of 299 items carry a PIC and 270 of those are a different person from
 * the owner**, so the wrong name was being shown almost everywhere it appeared -
 * the Items list, the reference-data cache every report reads, and the Schedule
 * screens. "DSSC at CMU, Annual Membership Fee" is Toshio Takizawa's; it said
 * Hiroyuki Ishige.
 *
 * The comment above this function asserted the owner *was* the PIC. It was
 * wrong, and it is the same mistake `hi_theme` cost a day earlier: **ask the
 * record**, never the file (CLAUDE.md).
 *
 * The order is the answer's order of authority: the real lookup, then the text
 * `hi_pic` that `hi_capexschedule` keeps instead. **The owner is not a fallback
 * for it** - an item with no PIC has no PIC, and printing the creator there is
 * how this started (rule 6).
 */
export function extractPic(record: Record<string, unknown>): string {
  return (
    record["_hi_pic_value@OData.Community.Display.V1.FormattedValue"] ||
    record.hi_pic
  ) as string || "";
}

/** The record owner - a different question, and the one that decides deletion. */
export function extractOwner(record: Record<string, unknown>): string {
  return (record["_ownerid_value@OData.Community.Display.V1.FormattedValue"] as string) || "";
}

/**
 * Extract entity name from schedule record (lookup field)
 */
export function extractEntityName(record: Record<string, unknown>): string {
  return (
    record["_hi_entitycapex_value@OData.Community.Display.V1.FormattedValue"]
  ) as string || "";
}

// ============================================================================
// Amount Conversion
// ============================================================================

/** Conversion factor from USD to KUSD (thousands) */
export const USD_TO_KUSD = 1000;

/**
 * Convert amount from USD to KUSD (thousands)
 */
export function toKusd(amount: number | null | undefined): number {
  return (amount || 0) / USD_TO_KUSD;
}

// ============================================================================
// Logging Helpers
// ============================================================================

const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * **Whether Dataverse's own error text may go back to the browser** - never in
 * production. Its body names tables, columns, record GUIDs and the org URL;
 * the status and the app's own sentence are what a reader gets there.
 * `handleApiError` decides the same way. One constant, not a copy per route.
 */
export const SHOW_UPSTREAM_DETAIL = isDevelopment;

/**
 * Debug log that only outputs in development
 */
export function debugLog(context: string, ...args: unknown[]): void {
  if (isDevelopment) {
    console.log(`[${context}]`, ...args);
  }
}

// ============================================================================
// Map Utilities
// ============================================================================

/**
 * Group array items by a key function
 * More efficient than multiple has/get calls
 */
export function groupBy<T, K>(
  items: T[],
  keyFn: (item: T) => K | undefined
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (key === undefined) continue;

    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}
