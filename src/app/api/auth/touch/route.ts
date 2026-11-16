/**
 * **"I am still here."**
 *
 * The browser posts this while somebody is actually typing or clicking, at most
 * once every few minutes (`TOUCH_INTERVAL_MS`), and it slides the idle clock.
 * Nothing else about a request may slide it: middleware does the same for a
 * real navigation, and between them that is the whole list. An SWR
 * revalidation, a save, a chatbot answer - none of them mean a person is at the
 * keyboard, and a timeout that any request can postpone is not a timeout.
 *
 * Deliberately cheap: it reads three cookies and writes one. No Dataverse call,
 * no identity resolution - this decides nothing about what the caller may do,
 * only that the session they already hold has not been abandoned. Everything
 * that grants is still decided by `requireSignedIn()` on the route that grants
 * it (rule 2).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DATAVERSE_COOKIES,
  clearDataverseTokens,
  touchLastSeen,
} from "@/lib/providers/dataverse/middleware";
import { sessionIsIdle } from "@/lib/auth/idle-session";
import { verifyRequestOrigin } from "@/lib/utils/api";

export async function POST(request: NextRequest) {
  // The same gate the token route uses: this writes a cookie, so it should not
  // be writable from another site's page.
  if (!verifyRequestOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lastSeen = request.cookies.get(DATAVERSE_COOKIES.LAST_SEEN)?.value;
  const userId = request.cookies.get(DATAVERSE_COOKIES.USER_ID)?.value;

  // Nothing to keep alive. Not an error: a signed-out tab left open will ask,
  // and the answer is simply that there is no session here.
  if (!lastSeen || !userId) {
    return NextResponse.json({ active: false });
  }

  /*
   * **A dead session cannot be revived by asking.**
   *
   * Without this the endpoint would be the hole in its own feature: a tab
   * asleep past the window wakes up, posts a touch before its own clock check
   * runs, and writes a fresh stamp over the one that had run out. The session
   * would then never end for anybody who left a tab open, which is precisely
   * the case this exists for.
   */
  if (sessionIsIdle(lastSeen, Date.now())) {
    return clearDataverseTokens(
      NextResponse.json({ active: false, idle: true }, { status: 401 })
    );
  }

  return touchLastSeen(NextResponse.json({ active: true }));
}
