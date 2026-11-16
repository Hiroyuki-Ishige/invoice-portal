/**
 * Dataverse Middleware
 *
 * Handles token storage and validation for Dataverse authentication.
 * Tokens are stored in secure, HTTP-only cookies for server-side access.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  LAST_SEEN_COOKIE_MAX_AGE_SECONDS,
  sessionIsIdle,
} from "@/lib/auth/idle-session";
import { registrationOf } from "@/lib/auth/registration";
/* Pure - no imports of its own - so it runs in the middleware runtime as
   happily as in the browser (rule 19). */
import { safeReturnPath } from "@/lib/auth/return-path";

// Cookie names for Dataverse tokens
export const DATAVERSE_COOKIES = {
  ACCESS_TOKEN: "dv_access_token",
  USER_ID: "dv_user_id",
  USER_EMAIL: "dv_user_email",
  USER_NAME: "dv_user_name",
  EXPIRES_AT: "dv_expires_at",
  /**
   * When this browser was last **used** - not when its token was last renewed.
   *
   * Its own cookie because the five above expire with the access token, about
   * an hour out, and are rewritten by `getAccessToken()` whenever the app asks
   * for one. Their age measures the token; this measures the person. It
   * outlives the idle window on purpose - see `lib/auth/idle-session.ts` for
   * why the value is compared rather than the expiry.
   */
  LAST_SEEN: "dv_last_seen",
} as const;

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Parse JWT token to get expiration time
 */
function getTokenExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
function isTokenExpired(expiresAt: number): boolean {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;
  return expiresAt - bufferMs <= now;
}

/**
 * Update Dataverse session in middleware
 */
export async function updateDataverseSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const accessToken = request.cookies.get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value;
  const expiresAt = request.cookies.get(DATAVERSE_COOKIES.EXPIRES_AT)?.value;
  const userId = request.cookies.get(DATAVERSE_COOKIES.USER_ID)?.value;
  const lastSeen = request.cookies.get(DATAVERSE_COOKIES.LAST_SEEN)?.value;

  /**
   * Routes that are worth sending to sign-in rather than rendering signed out.
   *
   * Not a security control - the server decides that on every request
   * (CLAUDE.md rule 2). What this decides is what somebody *sees*: a page that
   * renders without a token fetches, gets 401, and shows its own error, which
   * for `/approval/{id}` is a red "Error loading approval" - the screen an
   * approver following a link from their mail used to land on. Bounced here
   * instead, they get signed in and put back on the ringi.
   *
   * `/themes`, `/items` and `/schedule` used to be on this list and matched
   * nothing: those pages live under `/capex/`.
   */
  const protectedPaths = [
    "/dashboard",
    "/approval",
    "/capex",
    "/summary",
    "/reports",
    "/assistant",
    "/admin",
  ];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Auth-related paths
  const authPaths = ["/sign-in", "/auth/callback"];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  const isAuthenticated = !!(accessToken && userId);
  const isExpired = expiresAt ? isTokenExpired(parseInt(expiresAt, 10)) : false;

  /**
   * **The session was left alone for too long.**
   *
   * Checked before anything else, and on the marker rather than on the token:
   * by the time somebody has been away a day the `dv_*` cookies expired
   * twenty-three hours ago, so "no token" cannot tell an idle session from a
   * browser that never had one. Only the stamp can, which is why it outlives
   * them (see `lib/auth/idle-session.ts`).
   *
   * The cookies go with the redirect, the marker included: without that the
   * next navigation reads the same stale stamp and announces the same timeout
   * again, and MSAL - which caches in `localStorage` - would sign them back in
   * behind the message. The browser half clears MSAL's own cache; this half
   * makes sure the server stops answering.
   *
   * Auth paths are left alone deliberately: `/sign-in` is where the redirect
   * lands, and a rule that fired there would be a loop.
   */
  /*
   * **Pages only.** This middleware also runs in front of `/api/*`, and a
   * redirect there is worse than useless: `fetch` follows it, the caller gets a
   * sign-in page where it expected JSON, and the two endpoints that would put
   * the session right - the touch and the cookie DELETE - could never be
   * reached. An API request from a session this old is refused by the route
   * itself anyway; its access token expired twenty-three hours ago.
   * `/api/auth/touch` makes the same decision on its own and answers 401.
   */
  const isApiPath = request.nextUrl.pathname.startsWith("/api/");
  const wentIdle = !isAuthPath && !isApiPath && sessionIsIdle(lastSeen, Date.now());

  if (wentIdle) {
    const url = new URL("/sign-in", request.url);
    if (isProtectedPath) {
      url.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    }
    url.searchParams.set("message", "idle");
    return clearDataverseTokens(NextResponse.redirect(url));
  }

  /**
   * **An account this app has no record of is refused its endpoints, here.**
   *
   * `AccountGate` says so on screen, and a rule the screen states and the
   * server never asks about is a sentence, not a rule (rule 21). This is the
   * server asking - and it asks **once**, in front of all 59 routes, because a
   * guard added route by route is an allowlist that fails by omission on the
   * sixtieth one somebody writes (rule 36).
   *
   * Three things it is careful about:
   *
   * - **`/api/*` only.** A page renders and its own gate words the refusal; a
   *   redirect here would be the loop the idle check above is careful about.
   * - **`/api/auth/*` is always open.** `/api/auth/profile` is *how* the
   *   browser learns it is not registered, and how a super admin's profile is
   *   created at all; the token endpoint and the touch endpoint are the session
   *   itself. Gating them would refuse the very calls that produce the message
   *   and would leave nobody able to sign out.
   * - **`"unknown"` goes through.** It means the question could not be put to
   *   Dataverse, which is not evidence of anything (rule 6), and failing closed
   *   on it would turn one unreachable minute into an outage for everybody -
   *   in front of data Dataverse is guarding on its own.
   * - **Asked whenever a token is presented - nothing else.** It used to wait
   *   for `isAuthenticated && !isExpired`, which also needs the `dv_user_id`
   *   cookie and a five-minute margin on `dv_expires_at`. Both are the
   *   caller's to send: a curl carrying only `dv_access_token` (or an
   *   `expires_at` a minute out) skipped this check, while `requireSignedIn()`
   *   - which reads the token alone - let the request in (review,
   *   2026-10-20). A token that really has lapsed costs nothing extra here:
   *   WhoAmI refuses it, that is `"unknown"`, and the route answers 401.
   */
  const isOpenApiPath = request.nextUrl.pathname.startsWith("/api/auth/");
  if (isApiPath && !isOpenApiPath && accessToken) {
    const registration = await registrationOf(accessToken);
    if (registration === "not_registered" || registration === "deactivated") {
      return NextResponse.json(
        registration === "deactivated"
          ? {
              error:
                "This account has been deactivated in CAPEX Budget. Please contact the Administrator.",
              code: "ACCOUNT_DEACTIVATED",
            }
          : {
              error:
                "This account is not registered in CAPEX Budget yet. Please contact the Administrator.",
              code: "NOT_REGISTERED",
            },
        { status: 403 }
      );
    }
  }

  if (isProtectedPath) {
    if (!isAuthenticated || isExpired) {
      // Built fresh rather than cloned: a clone keeps the page's own query
      // string, so `/approval/x?step=5` would arrive as
      // `/sign-in?step=5&redirectTo=...` and carry a parameter that means
      // nothing on this screen.
      const url = new URL("/sign-in", request.url);
      // Path *and* query. A route notification links to
      // `/approval/{id}?step=5`, and losing the query drops the approver on
      // Step 1 with Circulation four clicks away.
      url.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
      if (isExpired && isAuthenticated) {
        url.searchParams.set("message", "session_expired");
      }
      return NextResponse.redirect(url);
    }
  }

  /*
   * **An authenticated caller has no business on the sign-in screen** - but
   * where they go is the page they were heading for, and the URL they land on
   * carries none of this one's query.
   *
   * This cloned `nextUrl` and only changed the path, which put `/sign-in`'s own
   * parameters on a page that reads neither: reported 2026-09-20 as
   * `/dashboard?redirectTo=%2Fassistant&message=idle` - an idle sign-out that
   * raced its own cookie clearing, arrived here still holding a live session,
   * and was bounced to the dashboard **carrying the message it was supposed to
   * show**. The message is the whole point of the idle timeout (rule 0), and it
   * went to a screen with nothing to print it. The protected-path branch above
   * builds its URL fresh for exactly this reason; this one did not.
   *
   * `redirectTo` is honoured rather than dropped, through the same
   * `safeReturnPath` the rest of the app uses, so a stranger's link cannot turn
   * this into an open redirect. Anything it refuses falls to the dashboard.
   */
  if (isAuthPath && isAuthenticated && !isExpired) {
    const wanted = safeReturnPath(request.nextUrl.searchParams.get("redirectTo"));
    return NextResponse.redirect(new URL(wanted ?? "/dashboard", request.url));
  }

  /* Moving around the app is being present. Only here, and only for a real
     navigation: `isUserNavigation()` is what stops a polling page from holding
     its own session open forever. */
  if (lastSeen && isAuthenticated && isUserNavigation(request)) {
    touchLastSeen(response);
  }

  return response;
}

/**
 * Store Dataverse tokens in cookies
 */
export function setDataverseTokens(
  response: NextResponse,
  tokens: {
    accessToken: string;
    userId: string;
    userEmail?: string;
    userName?: string;
    expiresAt?: number;
  },
  /** False for a silent token refresh - see the end of this function. */
  options: { touch?: boolean } = {}
): NextResponse {
  const { accessToken, userId, userEmail, userName, expiresAt } = tokens;

  /*
   * **What the client says, then the token's own `exp`, then an hour.**
   *
   * This took the *earlier* of the two for a few hours on 2026-08-30, on the
   * reading that the body should not be able to outlive the bearer inside it.
   * That is true and it is not worth what it costs here: this value becomes
   * `maxAge` on the cookies **and** `dv_expires_at`, which the middleware reads
   * to decide whether to bounce a page to `/sign-in`. Anything that shortens it
   * unexpectedly is not a tightened rule, it is a **sign-in loop** - the
   * session is written, immediately reads as expired, and the redirect starts
   * again. There is no bypass in the looser reading either: Dataverse refuses
   * the expired bearer whatever this cookie says, and `requireSignedIn()`
   * answers null.
   */
  const expiry = expiresAt || getTokenExpiry(accessToken) || Date.now() + 3600000;

  response.cookies.set(DATAVERSE_COOKIES.ACCESS_TOKEN, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: Math.floor((expiry - Date.now()) / 1000),
  });

  response.cookies.set(DATAVERSE_COOKIES.USER_ID, userId, {
    ...COOKIE_OPTIONS,
    maxAge: Math.floor((expiry - Date.now()) / 1000),
  });

  response.cookies.set(DATAVERSE_COOKIES.EXPIRES_AT, expiry.toString(), {
    ...COOKIE_OPTIONS,
    maxAge: Math.floor((expiry - Date.now()) / 1000),
  });

  if (userEmail) {
    response.cookies.set(DATAVERSE_COOKIES.USER_EMAIL, userEmail, {
      ...COOKIE_OPTIONS,
      maxAge: Math.floor((expiry - Date.now()) / 1000),
    });
  }

  if (userName) {
    response.cookies.set(DATAVERSE_COOKIES.USER_NAME, userName, {
      ...COOKIE_OPTIONS,
      maxAge: Math.floor((expiry - Date.now()) / 1000),
    });
  }

  /* Signing in is activity, and it is the first the clock ever sees. Its own
     lifetime, deliberately: everything above expires with the token.

     **A refresh is not.** The browser re-writes these cookies whenever MSAL
     renews the token - about once an hour, from a timer in an open tab - and
     stamping that would keep a tab nobody is looking at signed in for ever
     (rules 0, 24). A person's presence reaches the stamp the ways
     `isUserNavigation()` and `/api/auth/touch` describe. */
  if (options.touch !== false) touchLastSeen(response);

  return response;
}

/**
 * Clear Dataverse tokens from cookies
 */
export function clearDataverseTokens(response: NextResponse): NextResponse {
  const clearOptions = { ...COOKIE_OPTIONS, maxAge: 0 };

  response.cookies.set(DATAVERSE_COOKIES.ACCESS_TOKEN, "", clearOptions);
  response.cookies.set(DATAVERSE_COOKIES.USER_ID, "", clearOptions);
  response.cookies.set(DATAVERSE_COOKIES.USER_EMAIL, "", clearOptions);
  response.cookies.set(DATAVERSE_COOKIES.USER_NAME, "", clearOptions);
  response.cookies.set(DATAVERSE_COOKIES.EXPIRES_AT, "", clearOptions);
  /* Cleared with the rest, so a deliberate sign-out is never followed by
     "you were signed out for inactivity" on the way back in. */
  response.cookies.set(DATAVERSE_COOKIES.LAST_SEEN, "", clearOptions);

  return response;
}

/**
 * Mark this browser as used, now.
 *
 * The stamp is the value; the cookie's own expiry only decides how long the
 * app remembers that this browser ever had a session at all.
 */
export function touchLastSeen(response: NextResponse, at: number = Date.now()): NextResponse {
  response.cookies.set(DATAVERSE_COOKIES.LAST_SEEN, String(at), {
    ...COOKIE_OPTIONS,
    maxAge: LAST_SEEN_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * Whether this request is a person moving around the app, rather than the app
 * fetching something.
 *
 * **This is the whole of what keeps the timeout honest.** Slide the clock on
 * every request and a page left open with any polling on it never times out;
 * slide it on none and a reader who is navigating is signed out mid-session.
 * So: a document request (a full page load) or an App Router client navigation,
 * which asks for the RSC payload and says so in a header. An SWR revalidation
 * or a save is neither, and neither is a `/api/...` call - those ride on
 * whatever the person last did, which is what `/api/auth/touch` is for.
 */
export function isUserNavigation(request: NextRequest): boolean {
  if (request.nextUrl.pathname.startsWith("/api/")) return false;
  if (request.headers.get("sec-fetch-dest") === "document") return true;
  // Next's own header for a client-side navigation. Present on prefetches too,
  // which are honest enough: the browser only prefetches links a person is
  // about to be shown, and the clock is measured in hours.
  return request.headers.has("rsc") || request.headers.has("next-router-state-tree");
}

/**
 * Get Dataverse tokens from request cookies
 */
export function getDataverseTokensFromRequest(request: NextRequest): {
  accessToken: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  expiresAt: number | null;
  isExpired: boolean;
} {
  const accessToken = request.cookies.get(DATAVERSE_COOKIES.ACCESS_TOKEN)?.value || null;
  const userId = request.cookies.get(DATAVERSE_COOKIES.USER_ID)?.value || null;
  const userEmail = request.cookies.get(DATAVERSE_COOKIES.USER_EMAIL)?.value || null;
  const userName = request.cookies.get(DATAVERSE_COOKIES.USER_NAME)?.value || null;
  const expiresAtStr = request.cookies.get(DATAVERSE_COOKIES.EXPIRES_AT)?.value;
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

  return {
    accessToken,
    userId,
    userEmail,
    userName,
    expiresAt,
    isExpired: expiresAt ? isTokenExpired(expiresAt) : true,
  };
}
