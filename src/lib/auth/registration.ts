/**
 * **Is this caller registered in this app at all** - the server's own answer.
 *
 * `AccountGate` words the refusal on screen, and a rule the screen states and
 * the server never asks about is not a rule, it is a sentence (rule 21). This
 * is the server asking. It is deliberately the *same* question - an active
 * profile on one of the addresses Dataverse holds for the caller - so the two
 * cannot disagree about who is registered (rule 5).
 *
 * **It lives here rather than in `require-signed-in.ts` because middleware
 * cannot use `next/headers`**, and middleware is the one place a new route
 * cannot forget: a guard added per route is an allowlist that fails by
 * omission, silently, on the sixtieth route somebody writes (rule 36). So this
 * module takes a token rather than reading a cookie jar, uses Web Crypto rather
 * than `node:crypto`, and imports nothing that is not available in both
 * runtimes (rule 19).
 *
 * What it does **not** do is decide what the data allows. That is Dataverse's,
 * on the caller's own token, and always was: an account nobody registered here
 * still reads exactly what its Dataverse security role permits. This refuses
 * *this app's* endpoints to an account this app does not know (rule 10).
 */

import { USER_PROFILE_ENTITY_SET, USER_PROFILE_FIELDS } from "@/lib/types/user-profile";
import { isSuperAdminCaller } from "@/lib/auth/super-admin";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const API_VERSION = "v9.2";

/** Identity resolution must not become the slow part of a request. */
const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * **Positive answers are cached for minutes, refusals for seconds.**
 *
 * The asymmetry is the point, and `roleCache` in `require-signed-in.ts` wrote
 * it down first: pinning a failure would turn one Dataverse blip into minutes
 * of refusals. Here it is also what makes registering somebody take effect -
 * an admin adds them, and the account they had been refused works within half
 * a minute rather than at the end of a five-minute window.
 */
const REGISTERED_TTL_MS = 5 * 60 * 1000;
const REFUSED_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * What the server could establish about a caller's registration.
 *
 * **`"unknown"` is a fourth state and not a synonym for any of the others**
 * (rule 6, rule 26). It means the question could not be put to Dataverse -
 * unreachable, a table that does not exist yet, a lapsed token - and the
 * caller treats it as "let the request through", because the alternative is
 * that one bad minute at Dataverse locks every user out of an app whose data
 * Dataverse is guarding anyway.
 */
export type RegistrationState =
  | "registered"
  | "not_registered"
  | "deactivated"
  | "unknown";

const cache = new Map<string, { state: RegistrationState; expiresAt: number }>();
/** In flight, so a page firing five fetches at once pays one lookup. */
const pending = new Map<string, Promise<RegistrationState>>();

/**
 * The cache key for a bearer token: **SHA-256, never a cheap hash.**
 *
 * The same reasoning as `require-signed-in.ts`, and for the same reason it is
 * not an optimisation: two tokens that key the same are one account, and this
 * entry decides whether that account is let in. Web Crypto because this runs in
 * middleware, where `node:crypto` may not exist.
 */
async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function dataverseGet(token: string, path: string): Promise<Response> {
  return fetch(`${DATAVERSE_URL}/api/data/${API_VERSION}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
}

/** Dataverse's own escaping for a value inside a quoted `$filter` literal. */
function odataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Whether this token's account holds an active profile.
 *
 * Every failure answers `"unknown"`, never a refusal: what could not be
 * established is not a fact (rule 27).
 */
export async function registrationOf(token: string): Promise<RegistrationState> {
  if (!token || !DATAVERSE_URL) return "unknown";

  const key = await tokenKey(token);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.state;
  if (cached) cache.delete(key);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const lookup = resolveRegistration(token)
    .then((state) => {
      if (state !== "unknown") writeCache(key, state);
      return state;
    })
    .catch(() => "unknown" as RegistrationState)
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, lookup);
  return lookup;
}

/**
 * Whole-map: an entry is keyed on a token this process cannot re-derive.
 *
 * **It clears the copy in the bundle that calls it, which is not
 * middleware's.** Middleware is built and run apart from the route handlers
 * (`src/middleware.ts` names no `runtime`), so it holds its own `cache`, and
 * the admin routes that call this cannot reach it. What that costs: a person
 * just registered waits out a refusal (`REFUSED_TTL_MS`, 30s), and a person
 * just deactivated still passes *middleware* until `REGISTERED_TTL_MS` (5 min)
 * - but not the routes, whose `checkArea()` reads `roleCache`, which these
 * same calls clear in the routes' own bundle. So a write stops at once on the
 * instance that took the admin's save (another instance keeps its own
 * `roleCache` to the end of its TTL), and a read can still be answered for up
 * to five minutes.
 */
export function clearRegistrationCache(): void {
  cache.clear();
}

function writeCache(key: string, state: RegistrationState): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, {
    state,
    expiresAt:
      Date.now() + (state === "registered" ? REGISTERED_TTL_MS : REFUSED_TTL_MS),
  });
}

async function resolveRegistration(token: string): Promise<RegistrationState> {
  try {
    // Cheapest authenticated call Dataverse offers, and it fails for a token
    // this app did not legitimately receive.
    const whoAmI = await dataverseGet(token, "WhoAmI");
    if (!whoAmI.ok) return "unknown";
    const { UserId } = (await whoAmI.json()) as { UserId?: string };
    if (!UserId) return "unknown";

    const identity = await dataverseGet(
      token,
      `systemusers(${UserId})?$select=internalemailaddress,domainname`
    );
    if (!identity.ok) return "unknown";
    const { internalemailaddress = "", domainname = "" } =
      (await identity.json()) as {
        internalemailaddress?: string;
        domainname?: string;
      };

    /* Both addresses, because a profile is registered under whichever one was
       to hand - the mailbox or the UPN - and they differ for some accounts.
       Both come from Dataverse, so widening the match takes nothing from the
       check: a request still cannot name its own identity (rule 1). */
    const addresses = [
      ...new Set(
        [internalemailaddress.toLowerCase(), domainname.toLowerCase()].filter(Boolean)
      ),
    ];
    if (addresses.length === 0) return "unknown";

    /* A super admin is registered by definition - their profile is created by
       `/api/auth/profile` on first sign-in, and until that call lands there is
       no row to find. Refusing them in the meantime would lock the one account
       that can register anybody out of the app that registers them. */
    // `token` has just passed WhoAmI, the condition `isSuperAdminCaller` needs.
    if (isSuperAdminCaller(token, addresses)) {
      return "registered";
    }

    const filter = addresses
      .map((a) => `${USER_PROFILE_FIELDS.email} eq '${odataLiteral(a)}'`)
      .join(" or ");
    const profiles = await dataverseGet(
      token,
      `${USER_PROFILE_ENTITY_SET}?$select=${USER_PROFILE_FIELDS.isActive}` +
        `&$filter=${encodeURIComponent(filter)}&$top=${addresses.length}`
    );
    /* Includes the table not existing yet. "Could not ask" is not "absent"
       (rule 6) - and a fail-closed default on a table nobody has looked at is
       how somebody gets locked out (rule 25). */
    if (!profiles.ok) return "unknown";

    const { value } = (await profiles.json()) as {
      value?: Array<Record<string, unknown>>;
    };
    const rows = value ?? [];
    if (rows.length === 0) return "not_registered";

    /* Only an explicit `false` deactivates an account - the same test
       `activeProfiles()` and `mapDataverseToUserProfile()` apply. A row whose
       flag was never written is active, and tightening that here alone would
       make this stricter than the screen (see the note in
       `types/user-profile.ts`, where exactly that locked a user out). */
    const hasActive = rows.some((r) => r[USER_PROFILE_FIELDS.isActive] !== false);
    return hasActive ? "registered" : "deactivated";
  } catch {
    // Timeout or network failure - unestablished, so the request goes through
    // and Dataverse decides the data, as it would have anyway.
    return "unknown";
  }
}
