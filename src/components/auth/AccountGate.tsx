"use client";

/**
 * The one screen an account with no registration gets, instead of the app.
 *
 * `profileStatus` has reported `"no_profile"` since it was written and nothing
 * printed it, so somebody who had never been registered in Admin > User
 * Management reached every screen, where each read failed on its own terms -
 * `Error loading approvals`, an empty list, a summary of nothing. A refusal
 * nobody words reads as a broken app (rule 10).
 *
 * **This half is the screen; the server asks the same question on its own.**
 * `lib/auth/registration.ts`, called from the middleware, refuses `/api/*` to an
 * account with no active profile - so this is not a disabled button in front of
 * an endpoint that would have answered (rule 2, rule 21). What neither half
 * decides is what the *data* allows: these pages carry the person's own token,
 * so Dataverse governs that, as it always did.
 *
 * **Three statuses are gated, and two deliberately are not.** `"no_profile"` is
 * the account nobody registered; `"deactivated"` is the account somebody
 * switched off, which until now took the *role* away everywhere and left the
 * app itself open - an Active toggle that did not close the door it looks like
 * it closes. `"table_not_found"` is not gated: that table is created by
 * Admin > Setup, and blocking the app would shut the door on the one person who
 * can open it.
 *
 * **`"not_in_environment"` is the third**, since 2026-10-24, and it is the
 * hole an unregistered person walked through. An account the Dataverse
 * environment does not know fails WhoAmI, and `/api/auth/profile` answered
 * that with the same 401 as a lapsed session - so the status was `"error"`,
 * which this gate does not refuse, and it drew the app: the Schedule screen
 * with "Could not load schedules" and a `User` badge for somebody nobody had
 * registered. The route now says so with its own code (`whyNotSignedIn`).
 *
 * **`"error"` stays open, on purpose.** It was gated for a day, and that
 * locked out a *registered* person whose security role lacks Read on the
 * profiles table - a grant missed by hand five times so far - since that 403
 * comes back on every Check again, while every other screen would have worked
 * (rule 25, rule 26). "Could not establish" is not "refused" (rule 6). The
 * server half lets it through for the same reason (`registration.ts`,
 * `"unknown"`), and the data behind it is Dataverse's to refuse anyway.
 */

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth, type ProfileStatus } from "@/components/providers/AuthProvider";
import type { AccessDeniedReason } from "@/components/auth/AccessDenied";

/**
 * Loaded only when a refusal is drawn. This component is in the root layout,
 * and a static import put the refusal screen - and through it the request
 * form - in the JavaScript of every page, for the handful of accounts that
 * ever see it (rule 19). While the chunk arrives the screen is blank, never
 * the page: the page is the thing being refused.
 */
const AccessDenied = dynamic(
  () => import("@/components/auth/AccessDenied").then((module) => module.AccessDenied),
  { loading: () => null }
);

/** The statuses this gate refuses. Everything else draws the page. */
const REFUSED: readonly AccessDeniedReason[] = ["no_profile", "deactivated", "not_in_environment"];

function refusalOf(status: ProfileStatus): AccessDeniedReason | null {
  return REFUSED.find((reason) => reason === status) ?? null;
}

/**
 * Paths that draw themselves whatever the profile says.
 *
 * Sign-in has to stay reachable - it is where a wrong account is signed out of
 * and a right one signed into, which for somebody registered under their other
 * address is the actual fix.
 */
/* `/guide/mfa` is a static public document (the invitation mail links to it); name the page, not the folder,
   so a later screen under `/guide` is not opened by accident. */
const ALWAYS_OPEN = ["/sign-in", "/auth", "/guide/mfa"];

export function AccountGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, profileStatus } = useAuth();
  const pathname = usePathname() || "";

  const alwaysOpen = ALWAYS_OPEN.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  /* `"loading"` renders the page, never the refusal. The status arrives a
     moment after the first paint, so treating that moment as "not registered"
     would flash this screen at everybody who is (the lesson AdminScreenGate
     wrote down). */
  const refusal = refusalOf(profileStatus);

  if (alwaysOpen || !isAuthenticated || !refusal) {
    return <>{children}</>;
  }

  /* The status *is* the reason - one value, not a second mapping that can drift
     from it (rule 3). `AccessDeniedReason` is derived from `ProfileStatus`. */
  return <AccessDenied reason={refusal} />;
}
