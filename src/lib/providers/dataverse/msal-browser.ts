/**
 * MSAL Browser Client for Azure AD Authentication
 *
 * This module provides browser-side authentication using MSAL.js.
 * It handles login, logout, token acquisition, and session management.
 */

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserAuthError,
  AccountInfo,
  AuthenticationResult,
  EventType,
  EventMessage,
  AuthError,
} from "@azure/msal-browser";
import {
  getMsalConfig,
  getLoginRequest,
  getDataverseTokenRequest,
  getGraphTokenRequest,
  getGraphMailTokenRequest,
  checkMfaFromToken,
  mapAzureUserToAppUser,
} from "./msal-config";

// Singleton MSAL instance
let msalInstance: PublicClientApplication | null = null;
let msalInitialized = false;
let interactionInProgress = false;
let initPromise: Promise<AuthenticationResult | null> | null = null;

/**
 * Get or create the MSAL PublicClientApplication instance
 */
export function getMsalInstance(): PublicClientApplication {
  if (typeof window === "undefined") {
    throw new Error("getMsalInstance can only be called in the browser");
  }

  if (!msalInstance) {
    const config = getMsalConfig();
    msalInstance = new PublicClientApplication(config);

    msalInstance.addEventCallback((event: EventMessage) => {
      if (event.eventType === EventType.LOGIN_SUCCESS) {
        const result = event.payload as AuthenticationResult;
        msalInstance?.setActiveAccount(result.account);
        console.log("[MSAL] Login successful", result.account?.username);
      }

      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        console.log("[MSAL] Logout successful");
      }

      if (event.eventType === EventType.ACQUIRE_TOKEN_FAILURE) {
        // InteractionRequiredAuthError is expected when consent is needed - log as warning, not error
        const error = event.error as { name?: string; errorCode?: string; message?: string } | undefined;
        const isInteractionRequired =
          error?.name === "InteractionRequiredAuthError" ||
          error?.errorCode === "interaction_required" ||
          error?.errorCode === "consent_required" ||
          error?.message?.includes("AADSTS65001");

        if (isInteractionRequired) {
          console.warn("[MSAL] Token acquisition requires user interaction (consent needed)");
        } else {
          console.error("[MSAL] Token acquisition failed", event.error);
        }
      }
    });
  }

  return msalInstance;
}

/**
 * Initialize MSAL and handle redirect response
 */
export async function initializeMsal(): Promise<AuthenticationResult | null> {
  // Return existing promise if initialization is already in progress
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const msal = getMsalInstance();

    try {
      interactionInProgress = true;

      if (!msalInitialized) {
        await msal.initialize();
        msalInitialized = true;
      }

      let response: AuthenticationResult | null = null;
      try {
        response = await msal.handleRedirectPromise();
      } catch (redirectError) {
        // Gracefully handle redirect errors (timeout, stale state, etc.)
        const error = redirectError as { errorCode?: string; message?: string };
        const errorCode = error?.errorCode || "";
        const errorMessage = error?.message || "";

        // Suppress known non-critical errors
        if (
          errorCode === "timed_out" ||
          errorCode === "monitor_window_timeout" ||
          errorCode === "hash_empty_error" ||
          errorCode === "interaction_in_progress" ||
          errorMessage.includes("timed_out")
        ) {
          // These errors are expected after logout or navigation - silently ignore
          console.log("[MSAL] handleRedirectPromise:", errorCode || "navigation-related error");
        } else {
          console.warn("[MSAL] handleRedirectPromise error:", redirectError);
        }
      }

      if (response) {
        msal.setActiveAccount(response.account);
        interactionInProgress = false;
        return response;
      }

      const accounts = msal.getAllAccounts();
      if (accounts.length > 0) {
        msal.setActiveAccount(accounts[0]);
      }

      interactionInProgress = false;
      return null;
    } catch (error) {
      interactionInProgress = false;
      console.error("[MSAL] Initialization error:", error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Get the currently active account
 */
export function getActiveAccount(): AccountInfo | null {
  const msal = getMsalInstance();
  return msal.getActiveAccount();
}

/**
 * Get all accounts in the cache
 */
export function getAllAccounts(): AccountInfo[] {
  const msal = getMsalInstance();
  return msal.getAllAccounts();
}

/**
 * Ensure MSAL is initialized before use
 */
async function ensureInitialized(): Promise<PublicClientApplication> {
  const msal = getMsalInstance();
  if (!msalInitialized) {
    await msal.initialize();
    msalInitialized = true;
  }
  return msal;
}

/**
 * Check if an interaction is currently in progress
 */
export function isInteractionInProgress(): boolean {
  if (interactionInProgress) return true;

  // Also check MSAL's internal state if instance exists
  if (msalInstance) {
    try {
      // MSAL tracks active interactions internally
      const activeInteraction = (msalInstance as unknown as { browserStorage?: { getInteractionInProgress?: () => boolean } })
        .browserStorage?.getInteractionInProgress?.();
      if (activeInteraction) return true;
    } catch {
      // Ignore errors checking internal state
    }
  }

  return false;
}

/**
 * Why a sign-in did not start.
 *
 * **Every value here means the browser is still on the page it was on**, which
 * on `/sign-in` is a spinner and the word "Redirecting" with nothing else on
 * it. Each of these used to be a `console.log` and a bare `return`, and the
 * screen had no way to know (rule 10): a person coming back to a tab left
 * overnight watched that spinner until they gave up.
 */
export type SignInBlock = "not_configured" | "interaction_in_progress" | "failed";

/**
 * MSAL's own "a sign-in is already running" marker.
 *
 * `msal.interaction.status` in the **temporary** cache, which is
 * `sessionStorage` - so it belongs to the tab, survives every navigation within
 * it, and outlives a redirect that was started and never came back. Confirmed
 * against the installed 5.15.0 (`BrowserCacheManager.getInteractionInProgress`,
 * `CacheKeys.PREFIX`), because a key guessed from a version note is a key that
 * silently removes nothing.
 */
const MSAL_INTERACTION_STATUS_KEY = "msal.interaction.status";

/**
 * Forget a sign-in that was started and never finished.
 *
 * Deliberately **not** automatic. MSAL's own guidance for `interaction_in_progress`
 * is a retry the person asks for - `overrideInteractionInProgress` exists only
 * for popups - and clearing it on our own would let two flows race. So the
 * screen says what happened and this runs behind the button.
 *
 * Only the marker, never the accounts: `clearLocalSession()` is the heavier
 * thing and would sign the person out of the app to fix a stuck redirect.
 */
export function clearStaleInteraction(): void {
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      store.removeItem(MSAL_INTERACTION_STATUS_KEY);
    } catch {
      /* Private mode, or storage blocked. Nothing was written, so nothing is
         stuck - and a failure here must not stop the retry below it. */
    }
  }
  interactionInProgress = false;
}

/**
 * Hand the browser over to Microsoft.
 *
 * **It resolves only when the redirect did not happen.** MSAL's
 * `NavigationClient.defaultNavigateWindow` calls `window.location.replace()`
 * and then returns a promise that *rejects* on `redirectNavigationTimeout` -
 * read in the installed 5.15.0, not assumed - so a sign-in that works ends with
 * this page unloading, never with this function returning. Anything it returns
 * is therefore a failure, and the caller has to show it.
 */
export async function loginWithRedirect(options?: {
  /** `login` forces Microsoft to ask. Nothing asks for it today. */
  prompt?: "select_account" | "login";
}): Promise<SignInBlock> {
  if (isInteractionInProgress()) {
    console.warn("[MSAL] Sign-in not started - an interaction is already in progress");
    return "interaction_in_progress";
  }

  try {
    interactionInProgress = true;
    const msal = await ensureInitialized();
    await msal.loginRedirect(getLoginRequest(options?.prompt));
    // See above: reaching this line means the navigation did not take.
    interactionInProgress = false;
    return "failed";
  } catch (error) {
    interactionInProgress = false;

    if (error instanceof BrowserAuthError &&
        (error as BrowserAuthError).errorCode === "interaction_in_progress") {
      return "interaction_in_progress";
    }

    /* Logged here rather than thrown. It used to throw into an effect that did
       not catch, so the rejection reached the window handler - which suppresses
       every `BrowserAuthError` by name - and the only trace of a failed sign-in
       was a spinner. */
    console.error("[MSAL] Sign-in could not be started:", error);
    return "failed";
  }
}

/**
 * Login using popup flow
 */
export async function loginWithPopup(): Promise<AuthenticationResult> {
  const msal = await ensureInitialized();
  const response = await msal.loginPopup(getLoginRequest());
  msal.setActiveAccount(response.account);
  return response;
}

/**
 * Logout and redirect to post-logout URL
 */
/**
 * **Sign out of this app only, without going anywhere.**
 *
 * The same local sign-out `logoutWithRedirect` performs, minus the navigation,
 * so the caller decides where the person lands - the idle timeout sends them to
 * the sign-in screen with a message rather than to the home page, and a message
 * nobody sees is not a message.
 *
 * Local, like its neighbour: it clears this app's cache and leaves the
 * Microsoft session alone. MSAL's own docs are blunt about what that means -
 * "the user's session will remain active on the server and can be signed back
 * into your application without providing credentials again" - so the account
 * picker after a timeout is one click back in, by choice (2026-09-17). Ending the
 * Microsoft session instead would sign the person out of Outlook and Teams as
 * well, which an idle CAPEX tab has no business doing.
 */
export function clearLocalSession(): void {
  clearMsalCache();
}

export async function logoutWithRedirect(): Promise<void> {
  // Simply clear MSAL cache locally and redirect
  // This avoids "interaction_in_progress" errors
  clearMsalCache();
  window.location.href = window.location.origin;
}

/**
 * Clear MSAL cache locally (for logout)
 */
function clearMsalCache(): void {
  // Clear localStorage items related to MSAL
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("msal.") || key.includes("login.windows.net") || key.includes("login.microsoftonline.com"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));

  // Clear sessionStorage items related to MSAL
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.startsWith("msal.") || key.includes("login.windows.net") || key.includes("login.microsoftonline.com"))) {
      sessionKeysToRemove.push(key);
    }
  }
  sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));

  // Reset singleton state
  msalInstance = null;
  msalInitialized = false;
  interactionInProgress = false;
  initPromise = null;
}

/**
 * Logout using popup
 */
export async function logoutWithPopup(): Promise<void> {
  const msal = await ensureInitialized();
  const account = msal.getActiveAccount();

  await msal.logoutPopup({
    account,
    postLogoutRedirectUri: window.location.origin,
    mainWindowRedirectUri: window.location.origin,
  });
}

/**
 * Check if error requires user interaction
 */
function requiresInteraction(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) {
    return true;
  }
  if (error instanceof BrowserAuthError) {
    const browserError = error as BrowserAuthError;
    if (browserError.errorCode === "timed_out" ||
        browserError.errorCode === "monitor_window_timeout" ||
        browserError.errorCode === "user_cancelled") {
      return true;
    }
  }
  return false;
}

/**
 * Get access token for Dataverse API
 * @param allowRedirect - If true, will redirect for interactive auth. Default true.
 */
export async function getDataverseAccessToken(allowRedirect = true): Promise<string | null> {
  const msal = await ensureInitialized();
  const account = msal.getActiveAccount();

  if (!account) {
    console.warn("[MSAL] No active account, cannot get token");
    return null;
  }

  try {
    const response = await msal.acquireTokenSilent(
      getDataverseTokenRequest(account)
    );
    return response.accessToken;
  } catch (error) {
    // Check for timeout errors - these require re-authentication
    if (error instanceof BrowserAuthError) {
      const browserError = error as BrowserAuthError;
      if (browserError.errorCode === "timed_out" ||
          browserError.errorCode === "monitor_window_timeout") {
        console.log("[MSAL] Token acquisition timed out, redirecting to login");
        if (allowRedirect && !interactionInProgress) {
          interactionInProgress = true;
          // Clear cookies and redirect to login
          try {
            await fetch("/api/auth/dataverse/token", { method: "DELETE" });
          } catch {
            // Ignore cookie clear errors
          }
          await msal.acquireTokenRedirect(getDataverseTokenRequest(account));
        }
        return null;
      }
      // iframe reload is non-blocking
      if (browserError.errorCode === "block_iframe_reload") {
        console.log("[MSAL] Silent token refresh blocked by iframe reload");
        return null;
      }
    }

    if (requiresInteraction(error)) {
      console.log("[MSAL] Silent token acquisition failed, interaction required");
      if (allowRedirect && !interactionInProgress) {
        interactionInProgress = true;
        await msal.acquireTokenRedirect(getDataverseTokenRequest(account));
      }
      return null;
    }

    console.error("[MSAL] Token acquisition error:", error);
    return null;
  }
}

/**
 * Graph token that can send mail as the signed-in user.
 *
 * Its own request rather than a scope bolted onto `getGraphAccessToken()`:
 * `Mail.Send` needs admin consent, and a tenant that has not granted it would
 * otherwise fail the token request that the people picker depends on. Null here
 * costs a notification; null there would cost user search on every form.
 */
export async function getGraphMailToken(): Promise<string | null> {
  try {
    const msal = await ensureInitialized();
    const account = msal.getActiveAccount();
    if (!account) return null;

    const response = await msal.acquireTokenSilent(getGraphMailTokenRequest(account));
    return response.accessToken;
  } catch {
    // Silent failure is expected until Mail.Send is consented in Azure AD.
    console.log("[MSAL] Mail.Send token unavailable - notifications will not be sent");
    return null;
  }
}

/**
 * Get access token for Microsoft Graph API
 * Returns null if token cannot be acquired silently (does not trigger redirect)
 */
export async function getGraphAccessToken(): Promise<string | null> {
  try {
    const msal = await ensureInitialized();
    const account = msal.getActiveAccount();

    if (!account) {
      return null;
    }

    const response = await msal.acquireTokenSilent(
      getGraphTokenRequest(account)
    );
    return response.accessToken;
  } catch (error) {
    // Don't redirect for Graph API - just return null and let caller handle fallback
    console.log("[MSAL] Graph token silent acquisition failed, using fallback");
    return null;
  }
}

/**
 * Check if the user is authenticated
 */
export function isAuthenticated(): boolean {
  try {
    const msal = getMsalInstance();
    return msal.getAllAccounts().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if MFA was used in the current session
 */
export function hasMfaInSession(): boolean {
  const account = getActiveAccount();
  if (!account?.idTokenClaims) return false;
  return checkMfaFromToken(account.idTokenClaims as Record<string, unknown>);
}

/**
 * Get the current user in application format
 */
export function getCurrentUser() {
  const account = getActiveAccount();
  if (!account) return null;
  return mapAzureUserToAppUser(account);
}

/**
 * Get the current session information
 */
export async function getSession(): Promise<{
  accessToken: string;
  expiresAt: Date;
  user: ReturnType<typeof mapAzureUserToAppUser>;
} | null> {
  const account = getActiveAccount();
  if (!account) return null;

  const token = await getDataverseAccessToken();
  if (!token) return null;

  const user = mapAzureUserToAppUser(account);
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;
  const exp = claims?.exp as number | undefined;

  return {
    accessToken: token,
    expiresAt: exp ? new Date(exp * 1000) : new Date(Date.now() + 3600000),
    user,
  };
}

/**
 * Handle authentication error
 */
export function handleAuthError(error: unknown): {
  code: string;
  message: string;
  requiresInteraction: boolean;
} {
  if (error instanceof InteractionRequiredAuthError) {
    return {
      code: error.errorCode,
      message: "User interaction required. Please sign in again.",
      requiresInteraction: true,
    };
  }

  if (error instanceof BrowserAuthError) {
    const browserError = error as BrowserAuthError;
    if (browserError.errorCode === "timed_out" ||
        browserError.errorCode === "monitor_window_timeout") {
      return {
        code: browserError.errorCode,
        message: "Authentication timed out. Please sign in again.",
        requiresInteraction: true,
      };
    }
  }

  if (error instanceof AuthError) {
    return {
      code: error.errorCode,
      message: error.errorMessage,
      requiresInteraction: false,
    };
  }

  return {
    code: "unknown_error",
    message: error instanceof Error ? error.message : "An unknown error occurred",
    requiresInteraction: false,
  };
}
