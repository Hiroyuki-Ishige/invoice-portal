/**
 * Dataverse Token API
 *
 * Stores MSAL tokens in secure HTTP-only cookies for server-side access.
 *
 * POST /api/auth/dataverse/token - Store tokens after MSAL authentication
 * DELETE /api/auth/dataverse/token - Clear tokens (logout)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  setDataverseTokens,
  clearDataverseTokens,
  DATAVERSE_COOKIES,
} from "@/lib/providers/dataverse/middleware";
import { sessionIsIdle } from "@/lib/auth/idle-session";
import { verifyRequestOrigin, createErrorResponse } from "@/lib/utils/api";

/**
 * Store Dataverse tokens in cookies
 */
export async function POST(request: NextRequest) {
  try {
    // Verify request origin to prevent unauthorized token injection
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (!verifyRequestOrigin(origin, host)) {
      console.warn("[Token API] Rejected request from unauthorized origin:", origin);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { accessToken, userId, userEmail, userName, expiresAt, refresh } = body;

    /*
     * **A silent refresh does not revive a session that has run out** - the
     * same rule `/api/auth/touch` keeps (rules 0, 24). `getAccessToken()`
     * re-stores MSAL's fresh token before a save; in a tab asleep past the
     * window, a save could run before the browser's own idle check and this
     * POST then stamped `dv_last_seen` afresh, so the session never ended and
     * the message never showed (review, 2026-10-20).
     *
     * **Only `refresh: true` is asked.** A sign-in is the one thing that must
     * always succeed: the marker outlives the tokens on purpose, and somebody
     * who opens `/sign-in` straight from a bookmark after a weekend still
     * carries a stale one. Refusing that would be a sign-in that fails once
     * for no reason the person can see. The flag is the browser's word, which
     * is enough here - this protects an unattended tab from itself, not the
     * server from its own user.
     */
    if (refresh === true && sessionIsIdle(request.cookies.get(DATAVERSE_COOKIES.LAST_SEEN)?.value, Date.now())) {
      return clearDataverseTokens(
        NextResponse.json({ error: "The session ended while this page was idle.", idle: true }, { status: 401 })
      );
    }

    if (!accessToken || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, userId" },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ success: true });

    return setDataverseTokens(
      response,
      {
        accessToken,
        userId,
        userEmail,
        userName,
        expiresAt,
      },
      { touch: refresh !== true }
    );
  } catch (error) {
    return createErrorResponse(error, "Failed to store token", 500);
  }
}

/**
 * Clear Dataverse tokens (logout)
 */
/**
 * Sign out - and behind the same origin check as the POST beside it.
 *
 * It had none, which made it the one method here a page on another site could
 * reach: a forced sign-out is a nuisance rather than a breach, but it is the
 * gate its sibling already has, and "the DELETE skipped it" is not a rule
 * anybody would have chosen to write.
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!verifyRequestOrigin(origin, host)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  return clearDataverseTokens(response);
}
