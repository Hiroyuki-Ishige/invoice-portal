/**
 * MSAL Configuration for Azure AD Authentication
 *
 * This file provides configuration for Microsoft Authentication Library (MSAL)
 * to authenticate with Azure AD / Entra ID.
 *
 * Required environment variables:
 * - NEXT_PUBLIC_AZURE_CLIENT_ID: Application (client) ID from Azure AD
 * - NEXT_PUBLIC_AZURE_TENANT_ID: Directory (tenant) ID
 * - NEXT_PUBLIC_AZURE_REDIRECT_URI: Redirect URI registered in Azure AD
 * - NEXT_PUBLIC_DATAVERSE_URL: Dataverse environment URL
 */

import type { Configuration } from "@azure/msal-browser";

/**
 * Scopes required for Dataverse API access
 */
export const DATAVERSE_SCOPES = {
  default: () => `${getDataverseUrl()}/.default`,
  userImpersonation: () => `${getDataverseUrl()}/user_impersonation`,
};

/**
 * Scopes required for Microsoft Graph API access
 */
export const GRAPH_SCOPES = {
  userRead: "https://graph.microsoft.com/User.Read",
  userReadAll: "https://graph.microsoft.com/User.Read.All",
  /**
   * Sending route notifications as the signed-in approver.
   *
   * Requested separately from the read scopes, so a tenant that has not
   * consented to it still gets a working people picker - asking for all four at
   * once would fail the whole token request and take user search down with it.
   */
  mailSend: "https://graph.microsoft.com/Mail.Send",
};

/**
 * Check if Azure AD is properly configured (not using placeholder values)
 */
export function isAzureConfigured(): boolean {
  const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
  const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;

  // Check for placeholder or missing values
  if (!tenantId || !clientId) return false;
  if (tenantId === "your-tenant-id" || tenantId.includes("your-")) return false;
  if (clientId === "your-client-id" || clientId.includes("your-")) return false;

  return true;
}

/**
 * The domain Azure AD sends people back to.
 *
 * It has to be one fixed value rather than whatever origin the page happens to
 * be on: a Vercel preview gets a new hostname per deployment, none of them are
 * registered on the app registration, and registering them is not possible in
 * advance. Previews therefore bounce their sign-in through production, which is
 * the pattern in .claude/rules/auth.md.
 *
 * This was hardcoded to `https://capex-budget.vercel.app` - a domain this
 * project does not own. The real one is capex-md.vercel.app, so *production*
 * fell into the preview branch and sent every sign-in to a site that is not
 * this app, while NEXT_PUBLIC_AZURE_REDIRECT_URI sat there being read only on
 * the server, where MSAL never looks. Nobody could sign in and the setting that
 * looked like it controlled this did nothing.
 *
 * Browser-only: every caller is already inside a `typeof window` check.
 *
 * With NEXT_PUBLIC_APP_URL unset it falls back to the current origin and says
 * so, rather than to a fixed guess. On production that is right; on a preview
 * it is an unregistered hostname, and Azure then refuses with AADSTS50011 and
 * prints the URI it was given - which names the problem. The guess is what put
 * this file in the state described above, and a wrong answer stated confidently
 * is harder to find than a refusal.
 */
function productionOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;

  console.warn(
    "[MSAL] NEXT_PUBLIC_APP_URL is not set - using this origin for the redirect URI. " +
      "On a preview deployment Azure AD will refuse it, because preview hostnames are not registered."
  );
  return window.location.origin;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Get Azure AD configuration from environment
 */
export function getAzureConfig() {
  const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
  const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
  const envRedirectUri = process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI;

  if (!clientId) {
    throw new Error("Missing NEXT_PUBLIC_AZURE_CLIENT_ID environment variable");
  }

  if (!tenantId) {
    throw new Error("Missing NEXT_PUBLIC_AZURE_TENANT_ID environment variable");
  }

  // Determine redirect URI based on environment
  let redirectUri: string;
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const productionDomain = productionOrigin();

    if (isLocalhost(window.location.hostname) || origin === productionDomain) {
      redirectUri = `${origin}/auth/callback`;
    } else {
      // Vercel preview deployment - bounce auth through the production domain,
      // since preview hostnames are not registered on the app registration.
      redirectUri = `${productionDomain}/auth/callback`;
    }
  } else {
    redirectUri = envRedirectUri || "";
  }

  return {
    clientId,
    tenantId,
    redirectUri,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  };
}

/**
 * Get Dataverse instance URL from environment
 */
export function getDataverseUrl(): string {
  const url = process.env.NEXT_PUBLIC_DATAVERSE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_DATAVERSE_URL environment variable");
  }
  return url.replace(/\/$/, "");
}

/**
 * MSAL Browser Configuration
 */
export function getMsalConfig(): Configuration {
  const { clientId, authority, redirectUri } = getAzureConfig();

  return {
    auth: {
      clientId,
      authority,
      redirectUri,
      // Same rule as redirectUri, and the same reason it cannot be the current
      // origin: a preview hostname is not registered.
      postLogoutRedirectUri: typeof window !== "undefined"
        ? (isLocalhost(window.location.hostname)
            ? window.location.origin
            : productionOrigin())
        : "/",
    },
    cache: {
      cacheLocation: "localStorage",
    },
    system: {
      // Increase timeouts to prevent timed_out errors
      redirectNavigationTimeout: 30000, // 30 seconds for redirect response (default is 30s)
      iframeBridgeTimeout: 10000, // 10 seconds for iframe BroadcastChannel
      popupBridgeTimeout: 10000,  // 10 seconds for popup BroadcastChannel
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          // Suppress common non-critical errors
          if (message.includes("timed_out") ||
              message.includes("interaction_in_progress") ||
              message.includes("monitor_window_timeout")) {
            return;
          }
          switch (level) {
            case 0:
              console.error("[MSAL]", message);
              break;
            case 1:
              console.warn("[MSAL]", message);
              break;
            case 2:
              if (process.env.NODE_ENV === "development") {
                console.info("[MSAL]", message);
              }
              break;
            case 3:
              if (process.env.NODE_ENV === "development") {
                console.debug("[MSAL]", message);
              }
              break;
          }
        },
        piiLoggingEnabled: false,
        logLevel: process.env.NODE_ENV === "development" ? 2 : 0,
      },
    },
  };
}

/**
 * Login request configuration
 */
/**
 * What to ask Microsoft for at sign-in.
 *
 * `select_account` normally: this app is used on shared machines and the
 * account picker is how somebody signs in as themselves rather than as whoever
 * used the browser last.
 *
 * **After an idle timeout as well** - since 2026-09-17. It was `login` there,
 * because a local sign-out leaves the Microsoft session alive and the picker is
 * one click back in; retyping credentials after every idle day was reported as
 * a regression and judged the wrong price for hygiene. `login` stays available
 * for a caller that really does need Microsoft to ask.
 */
export function getLoginRequest(prompt: "select_account" | "login" = "select_account") {
  return {
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      DATAVERSE_SCOPES.default(),
    ],
    prompt,
  };
}

/**
 * Token request for Dataverse API
 */
export function getDataverseTokenRequest(account?: {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  localAccountId: string;
}) {
  return {
    scopes: [DATAVERSE_SCOPES.default()],
    account,
    forceRefresh: false,
  };
}

/**
 * Token request for Microsoft Graph API
 * Requires User.Read.All permission with admin consent in Azure AD
 */
export function getGraphMailTokenRequest(account?: {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  localAccountId: string;
}) {
  return {
    scopes: [GRAPH_SCOPES.mailSend],
    account,
    forceRefresh: false,
  };
}

export function getGraphTokenRequest(account?: {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  localAccountId: string;
}) {
  return {
    scopes: [GRAPH_SCOPES.userRead, GRAPH_SCOPES.userReadAll],
    account,
    forceRefresh: false,
  };
}

/**
 * Check if MFA was used in the authentication
 */
export function checkMfaFromToken(idTokenClaims: Record<string, unknown>): boolean {
  const amr = idTokenClaims.amr as string[] | undefined;
  if (!amr) return false;
  return amr.includes("mfa") || amr.length > 1;
}

/**
 * Map Azure AD user to application user format
 */
export function mapAzureUserToAppUser(account: {
  homeAccountId: string;
  username: string;
  name?: string;
  localAccountId?: string;
  idTokenClaims?: Record<string, unknown>;
}) {
  const claims = account.idTokenClaims || {};

  const email = (claims.email as string) ||
    (claims.preferred_username as string) ||
    account.username;

  return {
    id: account.localAccountId || account.homeAccountId,
    email,
    userMetadata: {
      displayName: account.name || (claims.name as string) || account.username,
      givenName: claims.given_name as string | undefined,
      surname: claims.family_name as string | undefined,
      jobTitle: claims.jobTitle as string | undefined,
      department: claims.department as string | undefined,
    },
    createdAt: claims.iat
      ? new Date((claims.iat as number) * 1000).toISOString()
      : undefined,
  };
}
