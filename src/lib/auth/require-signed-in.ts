/**
 * Server-side identity for API routes.
 *
 * The `dv_access_token` cookie alone proves nothing: it is opaque to this app,
 * and a route that merely checks the cookie *exists* accepts any forged value.
 * Most routes get away with it because they forward the token to Dataverse, which
 * rejects a bad one - Dataverse is the real authority. Routes that spend money
 * without ever calling Dataverse (the AI endpoints) have no such backstop, so
 * they must establish identity themselves.
 *
 * This module does that by asking Dataverse who the caller is. It also resolves
 * the caller's email from Dataverse rather than from the `dv_user_email` cookie,
 * because that cookie's value is supplied by the browser at sign-in and is
 * therefore not evidence of anything - any signed-in user could set it to a
 * super admin's address.
 */

import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DATAVERSE_COOKIES } from "@/lib/providers/dataverse/middleware";
import { allows, areaRefusal, bestLevel, type AccessAreaId } from "@/lib/auth/permissions";
import { rolePermissions } from "@/lib/settings/role-permissions";
import { saysColumnMissing } from "@/lib/providers/dataverse/missing-column";
import { isSuperAdminCaller, SUPER_ADMIN_OBJECT_IDS } from "@/lib/auth/super-admin";
import {
  getRoleName,
  isAdminOrFinance,
  mayDeleteEmptyItems,
  mayCancelInvoices,
  readEntityAccess,
  USER_PROFILE_ENTITY_SET,
  USER_PROFILE_FIELDS,
  type EntityAccess,
  type UserRole,
} from "@/lib/types/user-profile";

const DATAVERSE_URL = process.env.NEXT_PUBLIC_DATAVERSE_URL;
const API_VERSION = "v9.2";

/** Identity resolution must not become the slow part of a request. */
const LOOKUP_TIMEOUT_MS = 10_000;

/**
 * How long a resolved identity is reused for the same token.
 *
 * Without this, every upload would pay two extra Dataverse round trips. Keyed on
 * the token itself, so a different or refreshed token never reuses an entry, and
 * bounded by the token's own expiry.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

export interface SignedInUser {
  userId: string;
  /** Resolved from Dataverse, not from a client-supplied cookie. */
  email: string;
  /**
   * **Every** address Dataverse holds for this account, lowercased: the mailbox
   * (`internalemailaddress`, which is `email` above) and the sign-in name
   * (`domainname`/UPN). They differ for some accounts.
   *
   * The profile lookup below has always matched on both - a profile is created
   * under whichever address the person signed in with. What did not was
   * "is this approval stage mine": that compared the mailbox alone against
   * whatever the directory picker stored on the route, which is `mail` where an
   * account has one and the UPN where it does not. The two spellings of one
   * person then failed to match, and the answer was a 403 telling somebody the
   * stage with their own name on it was not theirs.
   *
   * Both come from Dataverse, so widening the comparison to cover them takes
   * nothing from the guard: a request still cannot name its own identity.
   */
  addresses: string[];
  /**
   * The caller's display name, as Dataverse holds it (`fullname`).
   *
   * For a **notification**, never for a decision: an address identifies an
   * account and a name does not, so nothing here is authorised on it. It exists
   * because "hiroyuki.ishige@hoya.com has approved this application" is a
   * sentence about a mailbox, and the people reading these messages work with a
   * person.
   */
  name: string;
  /**
   * **Whether this caller is a super admin**, settled once with the identity
   * (`auth/super-admin`): on the access token's Entra object id once
   * `SUPER_ADMIN_OBJECT_IDS` is filled, on these addresses until then. Ask
   * `isSuperAdmin(user)`, never the address list - an address is a column a
   * security role could one day let its owner rewrite.
   */
  superAdmin: boolean;
}

const identityCache = new Map<string, { user: SignedInUser; expiresAt: number }>();
/** In flight, per identity key (review, 2026-10-20). */
const identityPending = new Map<string, Promise<SignedInUser | null>>();

/**
 * The same trade, for the profile roles behind `requireAdmin()`.
 *
 * `requireSignedIn()` was cached and `requireAdmin()` was not, so every save on
 * a route the caller does not own paid two extra Dataverse round trips - one to
 * re-read the systemuser, one for the profile - on top of the two the identity
 * lookup had already saved.
 *
 * Only a successful read is stored. `activeProfileRoles()` returns null for
 * "could not ask", and pinning that for five minutes would turn one Dataverse
 * blip into five minutes of refusals. Writes to a profile call
 * `clearRoleCache()`, so a role change or a deactivation takes effect at once
 * rather than at the end of the TTL.
 */
const roleCache = new Map<string, { profiles: CallerProfile[]; expiresAt: number }>();
/** In flight, per `roleCache` key - see `activeProfiles`. */
const rolePending = new Map<string, Promise<CallerProfile[] | null>>();
/** Bumped by `clearRoleCache()`, so a lookup from before a profile write stores nothing. */
let roleGeneration = 0;

/**
 * One of the caller's own active profiles, as authorisation needs it.
 *
 * Role and entity access are read together because they are always wanted
 * together and come off the same row - asking twice would double the round
 * trips this cache exists to avoid, and could read a role from before an edit
 * and an access map from after it.
 */
export interface CallerProfile {
  /** `hi_userprofileid`, lowercased - what the Ringi preview's member list holds. */
  id: string;
  role: UserRole;
  entityAccess: EntityAccess;
}

/**
 * The cache key for a bearer token: **SHA-256, never a cheap hash.**
 *
 * `requireSignedIn()` answers from this cache *without* asking Dataverse again,
 * and the entry is the whole identity - the addresses every route guard tests,
 * the id every role check reads. So the key is not an optimisation, it is the
 * authentication: two tokens that key the same are one account.
 *
 * It was `hash * 31 + charCode | 0` until 2026-08-30 - 32 bits, and linear, so
 * a colliding string can be *constructed* rather than searched for, out of a
 * value the browser supplies (`/api/auth/dataverse/token` stores whatever the
 * body calls an access token). No collision had happened; nothing made one
 * impossible.
 *
 * The two data caches reached this conclusion first and wrote it down -
 * `cache/reference-data.ts` and `fx/read-fx-rates.ts` both hash with SHA-256
 * "because a collision would hand one account another's data". This is the map
 * where that costs more, and it was the one still guessing.
 *
 * Hashed at all so raw bearer tokens are not sitting in a long-lived map.
 */
function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readCache(key: string): SignedInUser | null {
  const entry = identityCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    identityCache.delete(key);
    return null;
  }
  return entry.user;
}

function writeCache(key: string, user: SignedInUser): void {
  // Plain FIFO eviction - the cache exists to save round trips, not to be exact.
  if (identityCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = identityCache.keys().next().value;
    if (oldest) identityCache.delete(oldest);
  }
  identityCache.set(key, { user, expiresAt: Date.now() + CACHE_TTL_MS });
}

function readRoleCache(key: string): CallerProfile[] | null {
  const entry = roleCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    roleCache.delete(key);
    return null;
  }
  return entry.profiles;
}

function writeRoleCache(key: string, profiles: CallerProfile[]): void {
  if (roleCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = roleCache.keys().next().value;
    if (oldest) roleCache.delete(oldest);
  }
  roleCache.set(key, { profiles, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Forgets every cached role. Call after any write to `hi_userprofiles`.
 *
 * Whole-map, not per-user: the entries are keyed on the *caller's* token, and
 * an admin editing somebody else's profile holds neither their token nor a way
 * to derive it. The map is small and refills on the next request.
 */
export function clearRoleCache(): void {
  roleGeneration += 1;
  roleCache.clear();
  rolePending.clear();
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

/**
 * Resolves the caller, or null when the request is not from a live session.
 *
 * Returning null covers every failure mode - no cookie, expired token, forged
 * token, Dataverse unreachable - deliberately, so callers cannot accidentally
 * treat "could not verify" as "verified".
 */
export async function requireSignedIn(): Promise<SignedInUser | null> {
  const jar = await cookies();
  const token = jar.get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
  if (!token) return null;

  // Cheap local check first: a token past its own expiry cannot be valid, so
  // there is no point spending a round trip on it.
  const expiresAt = Number(jar.get(DATAVERSE_COOKIES.EXPIRES_AT)?.value ?? 0);
  if (expiresAt && expiresAt <= Date.now()) return null;

  const key = tokenKey(token);
  const cached = readCache(key);
  if (cached) return cached;

  // In flight, so a page's parallel calls on a cold cache pay one WhoAmI.
  const inFlight = identityPending.get(key);
  if (inFlight) return inFlight;
  const lookup = lookupIdentity(token)
    .then((user) => {
      if (user) writeCache(key, user);
      return user;
    })
    .finally(() => {
      if (identityPending.get(key) === lookup) identityPending.delete(key);
    });
  identityPending.set(key, lookup);
  return lookup;
}

/**
 * Why `requireSignedIn()` answered null - asked **only after** it has, and only
 * by `/api/auth/profile`, which decides what the refusal screen says.
 *
 * `"not_in_environment"` is the one answer that is a fact: a token that has not
 * passed its own expiry, which Dataverse **answered** 401 or 403 at WhoAmI.
 * That is an account the environment does not know - no user record, or not in
 * its security group - and no screen of this app can read anything for it. A
 * HOGT user nobody had registered reached the app through exactly this on
 * 2026-10-24, because it used to arrive as the same `SESSION_EXPIRED` as
 * everything else and the screen let every unexplained failure through.
 *
 * Everything else is `"unverified"`: no cookie, a lapsed token, a timeout,
 * Dataverse unreachable. None of those says anything about the account
 * (rule 6), and the screen must not lock a registered person out over a bad
 * minute (rule 25). The expiry is checked here, before the round trip, for the
 * reason `requireSignedIn` checks it first - and because a lapsed token also
 * answers 401, which would otherwise read as "not in the environment".
 */
export async function whyNotSignedIn(): Promise<"not_in_environment" | "unverified"> {
  const jar = await cookies();
  const token = jar.get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
  if (!token) return "unverified";
  const expiresAt = Number(jar.get(DATAVERSE_COOKIES.EXPIRES_AT)?.value ?? 0);
  if (!expiresAt || expiresAt <= Date.now()) return "unverified";

  try {
    const whoAmI = await dataverseGet(token, "WhoAmI");
    return whoAmI.status === 401 || whoAmI.status === 403 ? "not_in_environment" : "unverified";
  } catch {
    return "unverified";
  }
}

/** WhoAmI, then the addresses - null on any failure (see `requireSignedIn`). */
async function lookupIdentity(token: string): Promise<SignedInUser | null> {
  try {
    // WhoAmI is the cheapest authenticated call Dataverse offers, and it fails
    // for a token this app did not legitimately receive.
    const whoAmI = await dataverseGet(token, "WhoAmI");
    if (!whoAmI.ok) return null;

    const { UserId } = (await whoAmI.json()) as { UserId?: string };
    if (!UserId) return null;

    // Second hop for the addresses, because authorisation decisions are made on
    // them. Both are asked for in the one call the identity already costs.
    const profile = await dataverseGet(
      token,
      `systemusers(${UserId})?$select=internalemailaddress,domainname,fullname`
    );
    const {
      internalemailaddress = "",
      domainname = "",
      fullname = "",
    } = profile.ok
      ? ((await profile.json()) as {
          internalemailaddress?: string;
          domainname?: string;
          fullname?: string;
        })
      : {};

    const email = internalemailaddress.toLowerCase();
    const addresses = [...new Set([email, domainname.toLowerCase()].filter(Boolean))];

    // `token` has just been accepted by Dataverse (WhoAmI above), which is the
    // condition `isSuperAdminCaller` reads its claims under.
    return { userId: UserId, email, addresses, name: fullname.trim(), superAdmin: isSuperAdminCaller(token, addresses) };
  } catch {
    // Timeout or network failure - unverified, so not signed in.
    return null;
  }
}

/**
 * Whether an address on a stored route is this caller's.
 *
 * Case-insensitive, because Dataverse and Graph disagree about it, and across
 * **every** address Dataverse holds for the account - see `SignedInUser.addresses`.
 * Exported so the two action routes ask the question once rather than each
 * writing `a.toLowerCase() === b.toLowerCase()` against whichever single field
 * came to hand.
 */
export function isCallerAddress(user: SignedInUser, email: string | undefined): boolean {
  const address = (email || "").trim().toLowerCase();
  if (!address) return false;
  return user.addresses.length > 0
    ? user.addresses.includes(address)
    : address === user.email.trim().toLowerCase();
}

/**
 * Why a privileged check failed, so a route can answer 401 or 403 correctly.
 *
 * These are different problems with different fixes: an expired `dv_*` cookie
 * means sign in again, while a real refusal means ask an administrator. Both
 * used to surface as a bare "Forbidden", which sent people looking for missing
 * permissions when their session had simply lapsed.
 */
export type DenialReason = "not_signed_in" | "not_permitted";

export interface PrivilegedCheck {
  user: SignedInUser | null;
  reason?: DenialReason;
}

/** Super admin check that reports which of the two failures occurred. */
export async function checkSuperAdmin(): Promise<PrivilegedCheck> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  const allowed = await requireSuperAdmin();
  return allowed ? { user: allowed } : { user: null, reason: "not_permitted" };
}

/**
 * Resolves the caller only if they are a super admin.
 *
 * The email is the one Dataverse reports, so unlike a check against the
 * `dv_user_email` cookie this cannot be satisfied by a crafted sign-in request.
 */
export async function requireSuperAdmin(): Promise<SignedInUser | null> {
  const user = await requireSignedIn();
  if (!user) return null;

  if (user.superAdmin) return user;

  // Logged, not returned: whoever is denied should not learn the super admin
  // list, but an operator wondering why their own account was refused needs to
  // see what it was decided on - the object id once one is configured, else
  // `internalemailaddress`, which is not always the address they sign in with.
  console.warn(
    SUPER_ADMIN_OBJECT_IDS.length > 0
      ? `[Auth] Super admin denied for user ${user.userId}: the token's object id is not in SUPER_ADMIN_OBJECT_IDS.`
      : `[Auth] Super admin denied. Dataverse reports "${user.email || "(no email on the systemuser record)"}" ` +
          `for user ${user.userId}; SUPER_ADMIN_EMAILS does not contain it.`
  );
  return null;
}


/**
 * The roles on the caller's own active profiles, or null if none could be read.
 *
 * Null is "could not establish", not "no role": every caller treats it as a
 * refusal, so a Dataverse failure can never widen access.
 */
async function activeProfiles(user: SignedInUser): Promise<CallerProfile[] | null> {
  const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
  if (!token) return null;

  // Keyed on the token *and* the user id, so a refreshed token starts fresh and
  // no entry can ever be read for a caller it was not written for.
  const key = `${tokenKey(token)}:${user.userId}`;
  const cached = readRoleCache(key);
  if (cached) return cached;

  /* In flight, so the four calls a screen makes at once against a cold cache
     ask Dataverse once (review, 2026-10-20) - `auth/registration` keeps the
     same map. A lookup that began before `clearRoleCache()` answers its caller
     and stores nothing (`roleGeneration`). */
  const inFlight = rolePending.get(key);
  if (inFlight) return inFlight;
  const startedAt = roleGeneration;
  const lookup = lookupProfiles(token, user)
    .then((profiles) => {
      // Only a real answer is cached - see the note on `roleCache`. An empty
      // array is a real answer ("no active profile"), and worth keeping: it is
      // the case that otherwise re-asks Dataverse on every request.
      if (profiles !== null && startedAt === roleGeneration) writeRoleCache(key, profiles);
      return profiles;
    })
    .finally(() => {
      if (rolePending.get(key) === lookup) rolePending.delete(key);
    });
  rolePending.set(key, lookup);
  return lookup;
}

/**
 * The addresses to look the profile up under. **`requireSignedIn()` already
 * read them from the same `systemusers` row**, so asking again was a round
 * trip on every cold role check (review, 2026-10-20); the read stays for an
 * identity whose own address read had failed and left the list empty.
 */
async function profileAddresses(token: string, user: SignedInUser): Promise<string[]> {
  if (user.addresses.length > 0) return user.addresses;
  const identity = await dataverseGet(
    token,
    `systemusers(${user.userId})?$select=internalemailaddress,domainname`
  );
  if (!identity.ok) return [];
  const { internalemailaddress, domainname } = (await identity.json()) as {
    internalemailaddress?: string;
    domainname?: string;
  };
  return [internalemailaddress, domainname]
    .filter((a): a is string => Boolean(a))
    .map((a) => a.toLowerCase());
}

/** Null is "could not establish" - see `activeProfiles`. */
async function lookupProfiles(token: string, user: SignedInUser): Promise<CallerProfile[] | null> {
  try {
    const addresses = (await profileAddresses(token, user)).map((a) => a.replace(/'/g, "''"));
    if (addresses.length === 0) return null;
    const filter = encodeURIComponent(addresses.map((a) => `hi_email eq '${a}'`).join(" or "));
    const read = (select: string) => dataverseGet(token, `${USER_PROFILE_ENTITY_SET}?$select=${select}&$filter=${filter}&$top=2`);

    let profiles = await read(`${USER_PROFILE_FIELDS.id},hi_role,hi_isactive,hi_entityaccess`);
    let withAccess = true;
    /* `hi_entityaccess` may not exist yet on an older table, and Dataverse
       rejects the whole $select over one unknown property (rule 7). That must
       not read as "no profile" and lock everybody out of their own budgets, so
       the roles are asked for again without it - a caller with no access map
       is one with no entity access, which the guards already handle.
       **It is a 400, not a throw**: this fallback used to sit in a `catch` that
       Dataverse's answer never reached, so such a table refused every caller
       (found while sharing the lookup, 2026-10-20). */
    if (!profiles.ok && profiles.status === 400 && saysColumnMissing(await profiles.text(), "hi_entityaccess")) {
      withAccess = false;
      profiles = await read(`${USER_PROFILE_FIELDS.id},hi_role,hi_isactive`);
    }
    if (!profiles.ok) return null;

    const { value } = (await profiles.json()) as {
      value?: Array<Record<string, unknown> & { hi_role?: number; hi_isactive?: boolean; hi_entityaccess?: unknown }>;
    };
    return (value ?? [])
      .filter((p) => p.hi_isactive !== false)
      .map((p) => ({
        id: String(p[USER_PROFILE_FIELDS.id] ?? "").toLowerCase(),
        role: getRoleName(p.hi_role ?? 0),
        entityAccess: withAccess ? readEntityAccess(p.hi_entityaccess) : {},
      }));
  } catch {
    // Timeout or network failure: unestablished, so a refusal.
    return null;
  }
}

/**
 * The caller's own active profiles, for a guard that needs more than the role.
 *
 * Null is "could not establish", exactly as it is inside - every caller must
 * treat it as a refusal, so a Dataverse failure can never widen access.
 */
export async function callerProfiles(): Promise<
  { user: SignedInUser; profiles: CallerProfile[] } | null
> {
  const user = await requireSignedIn();
  if (!user) return null;
  const profiles = await activeProfiles(user);
  if (profiles === null) return null;
  return { user, profiles };
}

/**
 * Whether the caller is a super admin - settled with the identity, see
 * `SignedInUser.superAdmin`. This replaced `isSuperAdminEmail(user.email)`,
 * which asked an address a security role could one day make writable
 * (2026-10-20); there is deliberately no address form of it left to call.
 */
export function isSuperAdmin(user: SignedInUser): boolean {
  return user.superAdmin;
}

/**
 * Resolves the caller only if one of their active profiles satisfies `allows`.
 *
 * The profile is matched on both addresses Dataverse holds for the caller: the
 * mailbox (`internalemailaddress`) and the sign-in name (`domainname`/UPN). They
 * differ for some accounts, and a profile is created under whichever one the
 * user signed in with. Both come from Dataverse, so neither is client-supplied -
 * which is the whole point: the `dv_user_email` cookie names whoever the browser
 * said it was, so a check against it can be satisfied by asking for someone
 * else's address.
 */
async function requireProfileRole(
  allows: (role: UserRole) => boolean,
  action: string,
  needed: string
): Promise<SignedInUser | null> {
  const user = await requireSignedIn();
  if (!user) return null;

  if (user.superAdmin) return user;

  const profiles = await activeProfiles(user);
  if (profiles === null) return null;
  if (profiles.some((p) => allows(p.role))) return user;

  console.warn(
    `[Auth] ${action} denied for ${user.email || user.userId}: no active profile with ${needed}.`
  );
  return null;
}

/**
 * Resolves the caller only if their profile is Admin or F&A-Admin.
 *
 * The two screens Finance owns - FX Rates and Circulation Route - are behind
 * this rather than behind `requireAdmin()`, because they are F&A's own work.
 * The predicate is `isAdminOrFinance()`, the same function the sidebar asks
 * before offering those screens, so a menu entry and the save behind it cannot
 * disagree about who may use them (rule 5).
 *
 * It does **not** cover creating the Dataverse tables those screens sit on:
 * that is schema surgery and stays with a super admin.
 */
export async function requireAdminOrFinance(): Promise<SignedInUser | null> {
  return requireProfileRole(
    (role) => isAdminOrFinance(role),
    "Finance admin",
    "the Admin or F&A-Admin role"
  );
}

/** Admin-or-F&A check that reports which of the two failures occurred. */
export async function checkAdminOrFinance(): Promise<PrivilegedCheck> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  const allowed = await requireAdminOrFinance();
  return allowed ? { user: allowed } : { user: null, reason: "not_permitted" };
}

/**
 * Admin or IIR-Admin - who may delete an empty item (`mayDeleteEmptyItems`),
 * reporting which of the two failures occurred.
 */
export async function checkMayDeleteEmptyItems(): Promise<PrivilegedCheck> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  const allowed = await requireProfileRole(
    (role) => mayDeleteEmptyItems(role),
    "Delete an empty item",
    "the Admin or IIR-Admin role"
  );
  return allowed ? { user: allowed } : { user: null, reason: "not_permitted" };
}

/**
 * Admin, F&A-Admin or Invoice preparer - who may cancel an issued invoice
 * (`mayCancelInvoices`), reporting which of the two failures occurred.
 */
export async function checkMayCancelInvoices(): Promise<PrivilegedCheck> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  const allowed = await requireProfileRole(
    (role) => mayCancelInvoices(role),
    "Cancel an invoice",
    "the Admin, F&A-Admin or Invoice preparer role"
  );
  return allowed ? { user: allowed } : { user: null, reason: "not_permitted" };
}

/**
 * Resolves the caller only if their profile is an Admin.
 *
 * Used by the user-management endpoints, which hand out roles and entity access
 * rights - the one place where getting the identity wrong lets somebody grant
 * themselves everything else.
 */
export async function requireAdmin(): Promise<SignedInUser | null> {
  return requireProfileRole(isAdminRole, "Admin", "the Admin role");
}

/** What "Admin" means - one predicate for `requireAdmin` and `callerIsAdmin` (rule 5). */
const isAdminRole = (role: UserRole): boolean => role === "admin";

/**
 * **Is this caller an Admin?** - `requireAdmin()`'s answer, without its refusal
 * log. For a screen that only *shows* more to an Admin (the approval list's
 * every ringi, 2026-11-10), where "no" is the ordinary answer and a warning per
 * page load would bury the real ones. Not for a write: use `requireAdmin()`.
 * A profile that could not be read is "no" - never wider (rule 6).
 */
export async function callerIsAdmin(user: SignedInUser): Promise<boolean> {
  if (user.superAdmin) return true;
  const profiles = await activeProfiles(user);
  return profiles !== null && profiles.some((profile) => isAdminRole(profile.role));
}

/** Admin check that reports which of the two failures occurred. */
export async function checkAdmin(): Promise<PrivilegedCheck> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  const allowed = await requireAdmin();
  return allowed ? { user: allowed } : { user: null, reason: "not_permitted" };
}

/**
 * The refusal, as the two different problems they are.
 *
 * 401 for a lapsed session - the `dv_*` cookies go stale before MSAL's own
 * token does - and 403 only for an account that is genuinely not allowed. They
 * send an operator looking in completely different places, so they must not be
 * collapsed into one status.
 */
export function deniedResponse(reason: DenialReason | undefined): NextResponse {
  return reason === "not_signed_in"
    ? NextResponse.json(
        { error: "Session expired - sign in again", code: "SESSION_EXPIRED" },
        { status: 401 }
      )
    : NextResponse.json({ error: "Forbidden - admin access required" }, { status: 403 });
}


/**
 * **May this caller do `need` on `areaId`?** - the role permission table
 * (`lib/auth/permissions`, set in Admin > Role Permissions), asked by the
 * server on every write (rule 2). A person with two active profiles gets the
 * more generous of their roles, as every other role test here does; a super
 * admin always passes.
 *
 * This is the gate in front of a route's own rules, never instead of them:
 * a route that also needs the Admin role, a site's Edit access or a place on
 * a ringi's route still asks for it after this.
 */
export async function checkArea(
  areaId: AccessAreaId,
  need: "read" | "edit"
): Promise<PrivilegedCheck & { message?: string }> {
  const user = await requireSignedIn();
  if (!user) return { user: null, reason: "not_signed_in" };
  if (isSuperAdmin(user)) return { user };

  const token = (await cookies()).get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
  if (!token) return { user: null, reason: "not_signed_in" };
  // Independent reads, so side by side (review, 2026-09-28).
  const [profiles, permissions] = await Promise.all([activeProfiles(user), rolePermissions(token)]);
  if (profiles === null) return { user: null, reason: "not_permitted", message: areaRefusal(areaId, need) };
  /* A table nobody could read is not a table that allows everything: the
     write is refused, and would not have reached Dataverse either. */
  if (!permissions.readable) {
    return {
      user: null,
      reason: "not_permitted",
      message: "The role permission table could not be read, so this change was not made. Try again in a moment.",
    };
  }
  const level = bestLevel(permissions.table, profiles.map((profile) => profile.role), areaId);
  if (allows(level, need)) {
    return { user };
  }

  console.warn(`[Auth] ${need} on ${areaId} denied for ${user.email || user.userId}: the role table gives ${level}.`);
  return { user: null, reason: "not_permitted", message: areaRefusal(areaId, need) };
}

/**
 * The refusal for `checkArea`: 401 when the session is gone, otherwise 403
 * naming the screen and where the right is granted (rule 41), with a code the
 * screens can tell apart from Dataverse's own 403.
 */
export function areaDeniedResponse(check: { reason?: DenialReason; message?: string }): NextResponse {
  if (check.reason === "not_signed_in") return deniedResponse("not_signed_in");
  return NextResponse.json(
    { error: check.message ?? "Your role may not do this.", code: "ROLE_PERMISSION" },
    { status: 403 }
  );
}

/**
 * `checkArea` for a route several screens share - the explanation files are
 * uploaded from Schedule & Amount, Meeting in MD and IIR Deck through one
 * dialog - passed when **any** of them gives `need`. Refused, it names the
 * first.
 */
export async function checkAnyArea(
  areaIds: readonly AccessAreaId[],
  need: "read" | "edit"
): Promise<PrivilegedCheck & { message?: string }> {
  let refusal: PrivilegedCheck & { message?: string } = { user: null, reason: "not_permitted" };
  for (const areaId of areaIds) {
    const check = await checkArea(areaId, need);
    if (check.user || check.reason === "not_signed_in") return check;
    if (!refusal.message) refusal = check;
  }
  return refusal;
}
