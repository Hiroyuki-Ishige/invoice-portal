import { NextRequest, NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/auth/require-signed-in";
import { debugLog } from "@/lib/utils/api-helpers";

interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
}

interface GraphResponse {
  value: GraphUser[];
  "@odata.nextLink"?: string;
}

/**
 * Search users via Microsoft Graph API
 *
 * The Graph token arrives in the `Authorization` header rather than from a
 * cookie: this searches the *directory*, on the caller's own delegated
 * permission, and the app has no token of its own that could do it.
 *
 * ### Why it also checks this app's session
 *
 * It did not, and Graph validating the bearer felt like enough - it does stop
 * anyone reading a directory they have no right to. What it does not stop is
 * **anybody at all using this deployment as the thing that makes the call**:
 * present your own Graph token, and the request goes out from the app's
 * address, on the app's IP, with the app's rate limit. That is somebody else's
 * traffic wearing our name.
 *
 * So: Graph decides what the caller may read, and `requireSignedIn()` decides
 * whether this app will be the one to ask (rule 1 - the identity comes from
 * Dataverse, not from the header we were handed).
 */
export async function GET(request: NextRequest) {
  try {
    const signedIn = await requireSignedIn();
    if (!signedIn) {
      return NextResponse.json(
        { error: "Session expired - sign in again", code: "SESSION_EXPIRED" },
        { status: 401 }
      );
    }

    // Get Graph token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7); // Remove "Bearer " prefix

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "15", 10) || 15, 1), 50);

    // Require at least 2 characters for search
    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Escape single quotes for OData
    const escapedQuery = query.replace(/'/g, "''");

    // Build OData filter - search by displayName, mail, or userPrincipalName
    // Using startswith for prefix matching and contains for substring matching
    const filter = `startswith(displayName,'${escapedQuery}') or startswith(givenName,'${escapedQuery}') or startswith(surname,'${escapedQuery}') or startswith(mail,'${escapedQuery}') or startswith(userPrincipalName,'${escapedQuery}')`;

    // Query Microsoft Graph API
    const graphUrl = new URL("https://graph.microsoft.com/v1.0/users");
    graphUrl.searchParams.set("$filter", filter);
    graphUrl.searchParams.set("$select", "id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department");
    graphUrl.searchParams.set("$top", limit.toString());
    graphUrl.searchParams.set("$orderby", "displayName");

    // The length, not the text: a people picker is typed into with colleagues'
    // names, and a production log is a poor place to accumulate who looks up whom.
    debugLog("UserSearch", "Searching the directory,", query.length, "characters");

    const graphResponse = await fetch(graphUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error("[UserSearch] Graph API error:", graphResponse.status, errorText);

      // If filter fails, try $search fallback (requires ConsistencyLevel header)
      if (graphResponse.status === 400) {
        debugLog("UserSearch", "Trying $search fallback...");

        const searchUrl = new URL("https://graph.microsoft.com/v1.0/users");
        /* `$search` terms are **double**-quoted, so the character to escape here
           is `"` - `escapedQuery` doubles `'` for the `$filter` above and leaves
           a quote to close the term early. It grants nothing (this runs on the
           caller's own Graph token) but it turns a name with a quote in it into
           a confusing 400. */
        const searchTerm = escapedQuery.replace(/"/g, "");
        searchUrl.searchParams.set("$search", `"displayName:${searchTerm}" OR "mail:${searchTerm}"`);
        searchUrl.searchParams.set("$select", "id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department");
        searchUrl.searchParams.set("$top", limit.toString());

        const searchResponse = await fetch(searchUrl.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ConsistencyLevel: "eventual",
          },
        });

        if (searchResponse.ok) {
          const searchData: GraphResponse = await searchResponse.json();
          debugLog("UserSearch", "$search found", searchData.value.length, "users");

          const users = searchData.value.map((u) => ({
            id: u.id,
            email: u.mail || u.userPrincipalName,
            displayName: u.displayName,
            givenName: u.givenName,
            surname: u.surname,
            jobTitle: u.jobTitle,
            department: u.department,
          }));
          return NextResponse.json({ users });
        }
      }

      // Graph's own status, not a blanket 500: a 401 means the Graph token
      // expired and the browser can retry silently, a 403 means the directory
      // is closed to this account and retrying will never help. Answering 500
      // to both told the picker "the server is broken" in each case.
      return NextResponse.json(
        { error: "Failed to search users", status: graphResponse.status },
        { status: graphResponse.status >= 400 && graphResponse.status < 500 ? graphResponse.status : 502 }
      );
    }

    const data: GraphResponse = await graphResponse.json();
    debugLog("UserSearch", "Found", data.value.length, "users");

    // Transform response
    const users = data.value.map((u) => ({
      id: u.id,
      email: u.mail || u.userPrincipalName,
      displayName: u.displayName,
      givenName: u.givenName,
      surname: u.surname,
      jobTitle: u.jobTitle,
      department: u.department,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[UserSearch] Error:", error);
    /* One sentence, whatever went wrong. This used to answer with the thrown
       message, which on a Graph failure is a service error naming the tenant
       and the query. */
    return NextResponse.json({ error: "Could not search the directory" }, { status: 500 });
  }
}
