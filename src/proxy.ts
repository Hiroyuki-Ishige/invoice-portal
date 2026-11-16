import { type NextRequest } from "next/server";
import { updateDataverseSession } from "@/lib/providers/dataverse/middleware";

/**
 * Middleware that handles Dataverse authentication.
 */
export async function proxy(request: NextRequest) {
  return await updateDataverseSession(request);
}

export const config = {
  matcher: [
    /*
     * Every endpoint, whatever its last segment looks like. The pattern below
     * skips anything ending in an image extension, and that applied to
     * `/api/*` too - an endpoint whose id ended `.png` would never have met
     * the registration check (review, 2026-10-20). Listed first and on its
     * own so that the exclusion below can never be widened over it.
     */
    "/api/:path*",
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
