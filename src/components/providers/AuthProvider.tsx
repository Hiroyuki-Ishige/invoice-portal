"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import type { AccountInfo, AuthenticationResult } from "@azure/msal-browser";
import type { SignInBlock } from "@/lib/providers/dataverse/msal-browser";
import type { UserProfile, UserRole } from "@/lib/types/user-profile";
import { SUPER_ADMIN_EMAILS } from "@/lib/types/user-profile";
/* The type only. Its module reads Dataverse, and a value import from here
   would take the OData client into the browser bundle (rule 19). */
import type { AdministratorContact } from "@/lib/auth/administrator-contacts";
import {
  AUTH_ENTRY_PATHS,
  RESUMED_SESSION_ENTRY_PATHS,
  clearSignInBounces,
  destinationAfterAuth,
} from "@/lib/auth/return-path";
import { useIdleLogout, clearIdleActivity } from "@/hooks/useIdleLogout";

/**
 * The administrators a 404 body named, narrowed to what may be printed.
 *
 * Anything off the wire is `unknown` (rule 12): this is a list of names this
 * app is about to put on screen beside "contact the Administrator", so an entry
 * without a usable name and address is dropped rather than rendered as a blank
 * link. Narrowed in the browser as well as built on the server because the two
 * ends of a fetch are not one function, and only one of them renders.
 */
function readAdministratorList(raw: unknown): AdministratorContact[] {
  if (!Array.isArray(raw)) return [];
  const contacts: AdministratorContact[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { name, email } = entry as { name?: unknown; email?: unknown };
    const contact = {
      name: typeof name === "string" ? name.trim() : "",
      email: typeof email === "string" ? email.trim() : "",
    };
    if (!contact.email) continue;
    contacts.push({ name: contact.name || contact.email.split("@")[0], email: contact.email });
  }
  return contacts;
}

/** This page, path and query - what `destinationAfterAuth` compares against. */
function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** The `redirectTo` middleware put on the sign-in URL, if there is one. */
function requestedReturnPath(): string | null {
  return new URLSearchParams(window.location.search).get("redirectTo");
}

/**
 * MSAL error handler - checks if an error should be suppressed
 */
function shouldSuppressMsalError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as { errorCode?: string; code?: string; message?: string; name?: string };
    const errorCode = err.errorCode || err.code || "";
    const errorName = err.name || "";
    const errorMessage = err.message || "";

    // Suppress known MSAL errors that are handled gracefully
    const suppressedCodes = [
      "timed_out",
      "monitor_window_timeout",
      "hash_empty_error",
      "interaction_in_progress",
      "interaction_required",
      "consent_required",
      "login_required",
      "invalid_grant",
      "block_iframe_reload",
      "user_cancelled",
    ];

    /* **By code, not by class.** `errorName === "BrowserAuthError"` was here
       and swallowed the whole class - `redirect_uri_not_set`,
       `empty_navigate_uri`, `no_network_connectivity`, every reason a sign-in
       redirect can fail to start - so a stuck sign-in left nothing in the
       console to find it by. The codes above are the ones that really are
       routine. */
    return (
      suppressedCodes.includes(errorCode) ||
      errorName === "InteractionRequiredAuthError" ||
      errorMessage.includes("timed_out") ||
      errorMessage.includes("interaction_in_progress") ||
      errorMessage.includes("AADSTS65001") ||
      errorMessage.includes("consent") ||
      errorMessage.includes("monitor_window_timeout")
    );
  }
  return false;
}

// Import MSAL functions only when needed (client-side)
let msalFunctions: {
  initializeMsal: () => Promise<AuthenticationResult | null>;
  loginWithRedirect: (options?: { prompt?: "login" | "select_account" }) => Promise<SignInBlock>;
  clearStaleInteraction: () => void;
  logoutWithRedirect: () => Promise<void>;
  clearLocalSession: () => void;
  isAuthenticated: () => boolean;
  isInteractionInProgress: () => boolean;
  getActiveAccount: () => AccountInfo | null;
  getDataverseAccessToken: (allowRedirect?: boolean) => Promise<string | null>;
  getGraphAccessToken: () => Promise<string | null>;
  getCurrentUser: () => {
    id: string;
    email?: string;
    userMetadata?: Record<string, unknown>;
  } | null;
} | null = null;

let azureConfigured: boolean | null = null;

async function checkAzureConfigured(): Promise<boolean> {
  if (azureConfigured !== null) return azureConfigured;
  const config = await import("@/lib/providers/dataverse/msal-config");
  azureConfigured = config.isAzureConfigured();
  return azureConfigured;
}

async function getMsalFunctions() {
  if (!msalFunctions) {
    const msal = await import("@/lib/providers/dataverse/msal-browser");
    msalFunctions = {
      initializeMsal: msal.initializeMsal,
      loginWithRedirect: msal.loginWithRedirect,
      clearStaleInteraction: msal.clearStaleInteraction,
      logoutWithRedirect: msal.logoutWithRedirect,
      clearLocalSession: msal.clearLocalSession,
      isAuthenticated: msal.isAuthenticated,
      isInteractionInProgress: msal.isInteractionInProgress,
      getActiveAccount: msal.getActiveAccount,
      getDataverseAccessToken: msal.getDataverseAccessToken,
      getGraphAccessToken: msal.getGraphAccessToken,
      getCurrentUser: msal.getCurrentUser,
    };
  }
  return msalFunctions;
}

// User type
export interface AuthUser {
  id: string;
  email?: string;
  userMetadata?: {
    displayName?: string;
    [key: string]: unknown;
  };
}

/**
 * How often an open tab asks MSAL whether it has renewed the Dataverse token.
 *
 * A cache read, not a network call: `acquireTokenSilent` hands back the cached
 * token until it is within five minutes of expiry (MSAL's
 * `tokenRenewalOffsetSeconds`) and only then renews it. Asking every minute
 * means the cookie never carries a bearer with less than about four minutes
 * left - see `syncCookieToken`.
 */
const COOKIE_TOKEN_CHECK_MS = 60 * 1000;

/**
 * Where the profile check stands. Exported because `AccessDenied`'s reasons
 * are derived from it - one closed set, not two lists kept in step by hand.
 *
 * **`"not_in_environment"` is not `"error"`.** It is Dataverse answering that
 * it does not know this account (`NOT_IN_ENVIRONMENT` from `/api/auth/profile`),
 * a fact; `"error"` is everything that could not be established - a lapsed
 * token, a timeout, a role without Read on the profiles table - and is let
 * through by `AccountGate`, because gating it locks registered people out.
 */
export type ProfileStatus =
  | "loading"
  | "authorized"
  | "no_profile"
  | "deactivated"
  | "not_in_environment"
  | "table_not_found"
  | "error";

interface AuthContextType {
  isInitialized: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  account: AccountInfo | null;
  userProfile: UserProfile | null;
  profileStatus: ProfileStatus;
  /**
   * Who to ask when `profileStatus` is `"no_profile"` - the people holding the
   * Admin role, as `/api/auth/profile` answered them.
   *
   * **Empty means "nobody to name here", never "this tenant has no admin".**
   * The response leaves the field out when the list could not be read, and the
   * screen that prints it says the same thing for both, because the reader's
   * next move is identical - but nothing here may claim there is no
   * administrator (rule 6).
   */
  administrators: AdministratorContact[];
  isAdmin: boolean;
  /**
   * The caller's effective role - the profile's, but "admin" for a super admin.
   *
   * Exported because there are now three roles and screens have to tell them
   * apart: `isAdmin` alone reads an F&A-Admin as an ordinary user, which is how
   * the header badge spent a while calling one. Derived here rather than in
   * each screen so they cannot disagree (rule 5).
   */
  role: UserRole;
  /**
   * Start a sign-in. **A returned value means it did not start** - the browser
   * is still here and the caller has to say so (rule 10).
   *
   * `prompt: "login"` makes Microsoft ask for credentials; nothing uses it
   * today (the idle timeout returns through the picker). `force` forgets a sign-in that was started and never finished,
   * and is only ever for a retry somebody asked for.
   */
  login: (options?: {
    prompt?: "login" | "select_account";
    force?: boolean;
  }) => Promise<SignInBlock>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getGraphAccessToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isInitialized: false,
  isAuthenticated: false,
  isLoading: true,
  user: null,
  account: null,
  userProfile: null,
  profileStatus: "loading",
  administrators: [],
  isAdmin: false,
  role: "user",
  login: async () => "not_configured" as SignInBlock,
  logout: async () => {},
  getAccessToken: async () => null,
  getGraphAccessToken: async () => null,
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}


export function AuthProvider({ children }: AuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const [administrators, setAdministrators] = useState<AdministratorContact[]>([]);
  /** The bearer last written into the dv_* cookies - see syncCookieToken. */
  const cookieTokenRef = useRef<string | null>(null);
  const initializingRef = useRef(false);

  // Check user profile authorization
  const checkProfile = useCallback(async (): Promise<void> => {
    setProfileStatus("loading");
    /* Cleared here rather than per branch: a stale list beside a *different*
       refusal would name somebody for a reason that no longer applies. */
    setAdministrators([]);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.profile);
        setProfileStatus("authorized");
        /**
         * **The one thing that proves the browser kept the session** - so it is
         * what forgets the sign-in count.
         *
         * The count exists for a circle nothing breaks out of: middleware
         * bounces a page to `/sign-in`, MSAL signs in from its own cache, the
         * `dv_*` cookies are refused, and the return trip meets the same check.
         * Four arrivals in one tab is taken as proof of that and the screen
         * says cookies are blocked.
         *
         * It was never cleared on the way OUT. `clearSignInBounces()` sat in
         * the two branches that decide to *stay* on the page, and a sign-in
         * that works does the opposite - it navigates - so a tab that signed in
         * four times over a morning accused the browser of blocking cookies it
         * had just accepted (reported 2026-09-19, after an idle timeout, which
         * costs an arrival every time it fires). A confident wrong answer, and
         * one that sends somebody into their browser settings (rule 32).
         *
         * Here rather than beside the cookie write, and that is the whole
         * point: `storeTokenInCookies()` only knows the POST answered 200. This
         * 200 came back from a request that **carried the cookie**, which is
         * the exact opposite of the thing the count is looking for - and a
         * browser that really is refusing them never reaches this line.
         */
        clearSignInBounces();
        console.log("[AuthProvider] Profile authorized:", data.profile.email);
      } else if (response.status === 404) {
        const data = await response.json();
        setUserProfile(null);
        if (data.code === "NO_PROFILE") {
          setProfileStatus("no_profile");
          /* Whatever the server could read, narrowed here: this arrives as JSON
             and is about to be printed, so it is `unknown` until it has been
             checked, not an `AdministratorContact[]` because a cast said so
             (rule 12). */
          setAdministrators(readAdministratorList(data.administrators));
          console.log("[AuthProvider] No profile found");
        } else {
          // Falls through deliberately. These branches used to set nothing when
          // the code did not match, leaving profileStatus on "loading" - a
          // spinner that never resolves and never says why. Since a Dataverse
          // refusal now arrives here as a real 401/403 rather than a 500, that
          // silent case became reachable.
          setProfileStatus("error");
          console.error("[AuthProvider] Profile check failed 404:", data.code, data.error);
        }
      } else if (response.status === 403) {
        const data = await response.json();
        setUserProfile(null);
        if (data.code === "ACCOUNT_DEACTIVATED") {
          setProfileStatus("deactivated");
          /* Same list, same narrowing: this refusal is printed by the same
             screen, and it asks the reader to go to the same person. */
          setAdministrators(readAdministratorList(data.administrators));
          console.log("[AuthProvider] Account deactivated");
        } else if (data.code === "NOT_IN_ENVIRONMENT") {
          /* No list: an account Dataverse does not know cannot read the
             profiles table, so the server has nobody to name. */
          setProfileStatus("not_in_environment");
          console.log("[AuthProvider] Account not in the Dataverse environment");
        } else {
          setProfileStatus("error");
          console.error("[AuthProvider] Profile check failed 403:", data.code, data.error);
        }
      } else if (response.status === 401) {
        // The account signed in but Dataverse will not talk to it - no user
        // record in the environment, or a token that has lapsed. Distinct from
        // "no profile": registering one in Admin would not help.
        const data = await response.json().catch(() => ({}));
        setUserProfile(null);
        setProfileStatus("error");
        console.error("[AuthProvider] Dataverse rejected the account:", data.error);
      } else if (response.status === 503) {
        setUserProfile(null);
        setProfileStatus("table_not_found");
        console.warn("[AuthProvider] User profile table not configured");
      } else {
        setUserProfile(null);
        setProfileStatus("error");
        console.error("[AuthProvider] Profile check failed:", response.status);
      }
    } catch (error) {
      console.error("[AuthProvider] Profile check error:", error);
      setUserProfile(null);
      setProfileStatus("error");
    }
  }, []);

  // Set up MSAL error suppression with proper cleanup to prevent memory leaks
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalHandler = window.onunhandledrejection;

    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      if (shouldSuppressMsalError(event.reason)) {
        event.preventDefault();
        return;
      }
      if (originalHandler) {
        originalHandler.call(window, event);
      }
    };

    // Cleanup: restore original handler
    return () => {
      window.onunhandledrejection = originalHandler;
    };
  }, []);

  // Define initializeAuth before using it in useEffect
  async function initializeAuth() {
    try {
      // Check if Azure AD is properly configured
      const isConfigured = await checkAzureConfigured();
      if (!isConfigured) {
        console.warn("[AuthProvider] Azure AD not configured (using placeholder values). Authentication disabled.");
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }

      const msal = await getMsalFunctions();
      const response = await msal.initializeMsal();

      if (response) {
        // User just logged in via redirect
        setAccount(response.account);
        setIsAuthenticated(true);

        const currentUser = msal.getCurrentUser();
        setUser(currentUser);

        // Store token in cookies for middleware authentication
        if (response.account) {
          const stored = await storeTokenInCookies(
            response.accessToken,
            response.account.localAccountId || response.account.homeAccountId,
            getEmailFromAccount(response.account),
            response.account.name,
            response.expiresOn
          );
          if (stored === "stored") cookieTokenRef.current = response.accessToken;

          // Check user profile authorization
          await checkProfile();
        }

        /*
         * **Not "initialised" until it is staying.**
         *
         * These two used to be set here, before the decision below, and the
         * pair `isInitialized && !isLoading` is what `/sign-in` reads as "this
         * screen is now a sign-in screen". So a caller who had just come back
         * from Microsoft *successfully* - token acquired, cookies written,
         * profile authorized - was shown **"Redirecting to sign in..."** while
         * being sent to the dashboard, and if that navigation did not take (a
         * `replace()` issued as a machine goes to sleep is cancelled, and the
         * old document stays), the sentence was all that was left. Reported
         * 2026-09-19 as a spinner that never ended.
         *
         * Below the branch now, which also makes this path the same shape as
         * the resumed-session one: `isLoading` is cleared by the `finally`
         * either way, so **`!isLoading` means initializeAuth has finished** -
         * including by returning early to navigate - and that is the signal
         * `/sign-in` waits on before deciding it has been left behind.
         */
        const destination = destinationAfterAuth(currentUrl(), requestedReturnPath());
        if (destination) {
          window.location.replace(destination);
          return;
        }
        // No destination means stay: MSAL has already navigated back to the
        // page sign-in started from, which for mail is the ringi itself.
        clearSignInBounces();
        setIsInitialized(true);
      } else {
        // Check existing authentication
        const authenticated = msal.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          const activeAccount = msal.getActiveAccount();
          setAccount(activeAccount);
          const currentUser = msal.getCurrentUser();
          setUser(currentUser);

          /* **Did the session actually come back?** Not "is there an account in
             localStorage" - MSAL keeps one of those for a long time after the
             refresh token behind it has lapsed. What middleware asks for is the
             `dv_*` cookies, so what counts is a token acquired *and* written.
             See the branch below for what happens when it is false. */
          let sessionRestored = false;

          // Ensure token is stored in cookies for API routes
          if (activeAccount) {
            try {
              // Pass allowRedirect=true to trigger re-login if token is expired
              const accessToken = await msal.getDataverseAccessToken();
              if (accessToken) {
                sessionRestored = "stored" === await storeTokenInCookies(
                  accessToken,
                  activeAccount.localAccountId || activeAccount.homeAccountId,
                  getEmailFromAccount(activeAccount),
                  activeAccount.name,
                  /*
                   * **No expiry, which means an hour** - not "parsed from the
                   * JWT", as this said until 2026-08-30. `storeTokenInCookies`
                   * turns a null into `Date.now() + 1h`, and that is what makes
                   * this path work: the token here comes from MSAL's cache and
                   * may have minutes left, while the cookie has to outlive the
                   * next navigation. A cookie that expires on arrival is a
                   * **sign-in loop**, because the middleware reads
                   * `dv_expires_at` with a five-minute buffer and bounces the
                   * page it just authenticated.
                   *
                   * The bearer inside it is kept live by `syncCookieToken`, not
                   * by this hour. This used to say "a request with a lapsed
                   * bearer answers 401 and `getAccessToken()` refreshes it",
                   * and nothing did that for a read: `getAccessToken()` ran
                   * before saves only, so once MSAL's cached token lapsed every
                   * GET on every screen answered 401 until the hour was up -
                   * reported 2026-10-29 as "Failed to load schedule / API
                   * error: 401" on a link from Meeting in MD.
                   */
                  null
                );
                if (sessionRestored) cookieTokenRef.current = accessToken;

                // Check user profile authorization
                if (sessionRestored) await checkProfile();
              } else {
                // Token acquisition returned null - might be redirecting for re-auth
                console.log("[AuthProvider] Token not available, may be redirecting for re-auth");
              }
            } catch (tokenError) {
              console.warn("[AuthProvider] Could not refresh token for API:", tokenError);
              // If token refresh fails completely, user needs to re-login
              // The MSAL function will handle redirect if allowRedirect is true
            }
          }

          // Signed in already - MSAL had the account in localStorage, so this
          // path never showed a prompt. It is how a link from mail gets
          // somebody to the ringi without them doing anything: middleware sent
          // them to /sign-in with the ringi in `redirectTo`, and this puts them
          // there. Same decision as after a real redirect, deliberately.
          const destination = destinationAfterAuth(
            currentUrl(),
            requestedReturnPath(),
            RESUMED_SESSION_ENTRY_PATHS
          );

          if (destination && !sessionRestored) {
            /**
             * **The loop that ate the resume.**
             *
             * This navigated regardless, and `destination` is the page
             * middleware had *just* bounced for having no `dv_*` cookies. With
             * none written, it meets the same check and comes straight back
             * here - round and round, with nothing on screen but the sign-in
             * spinner, which is what a person coming back to a day-old tab was
             * looking at. The only thing that stopped it was the bounce counter,
             * whose message blames blocked cookies: a confident wrong answer
             * (rule 32).
             *
             * So: drop the local session and fall through signed out. The
             * sign-in screen then does the one thing that can actually fix this
             * - ask Microsoft, out loud. Narrowed to `destination`, which is
             * only ever set on `/sign-in` or `/auth/callback`: a transient token
             * failure on an ordinary page must not throw somebody out of a
             * session that is otherwise fine.
             */
            console.warn(
              "[AuthProvider] MSAL still holds an account but the session could not be restored - signing out locally"
            );
            msal.clearLocalSession();
            setIsAuthenticated(false);
            setAccount(null);
            setUser(null);
            setUserProfile(null);
            setProfileStatus("loading");
            setAdministrators([]);
          } else if (destination) {
            window.location.replace(destination);
            return;
          } else {
            clearSignInBounces();
          }
        }
      }

      setIsInitialized(true);
    } catch (error) {
      console.error("[AuthProvider] Initialization error:", error);
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }

  // Call initializeAuth once on mount
  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (options?: {
      prompt?: "login" | "select_account";
      force?: boolean;
    }): Promise<SignInBlock> => {
      const isConfigured = await checkAzureConfigured();
      if (!isConfigured) {
        console.warn("[AuthProvider] Cannot login: Azure AD not configured. Please set NEXT_PUBLIC_AZURE_TENANT_ID in .env.local");
        return "not_configured";
      }
      const msal = await getMsalFunctions();

      // Only on a retry somebody asked for - see clearStaleInteraction.
      if (options?.force) msal.clearStaleInteraction();

      // Check if interaction is already in progress
      if (msal.isInteractionInProgress()) {
        console.warn("[AuthProvider] Login not started - interaction already in progress");
        return "interaction_in_progress";
      }

      /* Returned, never swallowed. Both guards above and both inside
         `loginWithRedirect` used to be a bare `return`, which left `/sign-in`
         spinning on "Redirecting to sign in..." with nothing to redirect. */
      return msal.loginWithRedirect(options);
    },
    []
  );

  /**
   * **Signed out for being away**, and taken somewhere that says so.
   *
   * Not `logout()`: that lands on the home page, where a person who left a tab
   * open overnight would find themselves signed out with nothing explaining it.
   * This clears the same two things - the `dv_*` cookies here and MSAL's own
   * cache, which lives in `localStorage` and would otherwise sign them straight
   * back in - and then goes to the sign-in screen with the reason in the query,
   * carrying the page they were on so signing in returns them to it.
   *
   * `window.location`, not the router: every scrap of client state is about to
   * be wrong, and a full load is the honest way to drop it.
   */
  const signOutIdle = useCallback(async () => {
    clearIdleActivity();
    await clearTokenCookies();
    try {
      const msal = await getMsalFunctions();
      msal.clearLocalSession();
    } catch (error) {
      // The cookies are already gone, so the session is over either way.
      console.warn("[AuthProvider] Could not clear the MSAL cache on idle:", error);
    }

    const url = new URL("/sign-in", window.location.origin);
    const here = window.location.pathname + window.location.search;
    // Not the sign-in screen itself, and not the landing page - "return me to
    // where I was" has to mean somewhere worth returning to.
    if (!AUTH_ENTRY_PATHS.includes(window.location.pathname)) {
      url.searchParams.set("redirectTo", here);
    }
    url.searchParams.set("message", "idle");
    window.location.href = url.toString();
  }, []);

  /* Only while there is a session to end. The hook does nothing at all when
     this is false, so a signed-out tab keeps no timers and writes no stamps. */
  useIdleLogout(isAuthenticated, signOutIdle);

  const logout = useCallback(async () => {
    // Wait for initialization to complete
    if (!isInitialized) {
      console.warn("[AuthProvider] Waiting for initialization before logout...");
      return;
    }

    clearIdleActivity();
    await clearTokenCookies();
    const isConfigured = await checkAzureConfigured();
    if (!isConfigured) {
      setIsAuthenticated(false);
      setUser(null);
      setAccount(null);
      setUserProfile(null);
      setProfileStatus("loading");
      setAdministrators([]);
      return;
    }
    const msal = await getMsalFunctions();
    await msal.logoutWithRedirect();
  }, [isInitialized]);

  /**
   * A live Dataverse token, with the server-side cookie kept in step.
   *
   * MSAL refreshes its own token silently, but the `dv_*` cookies are written
   * only when AuthProvider initialises. In a session left open past the token's
   * hour, every API route that reads those cookies then fails - a forwarded call
   * gets 401 from Dataverse, and `requireSignedIn()` reports the caller as not
   * signed in at all, which surfaced as an unexplained 403 on the admin setup
   * endpoints. Re-storing the fresh token here fixes all of them at once.
   *
   * **Written when the token changes, not on a clock.** This was throttled to
   * one write per five minutes, which could not tell a renewed token from the
   * one already in the cookie; asking "is this the bearer I last wrote" is the
   * whole test, and it costs a cookie write about once an hour.
   *
   * `allowRedirect` is the caller's: a save may send somebody to Microsoft to
   * sign in again, the minute check below never does - a page must not
   * navigate away from under somebody because a timer fired.
   */
  const syncCookieToken = useCallback(
    async (allowRedirect: boolean): Promise<string | null> => {
      const isConfigured = await checkAzureConfigured();
      if (!isConfigured) return null;
      const msal = await getMsalFunctions();
      const token = await msal.getDataverseAccessToken(allowRedirect);
      if (!token) return null;

      const account = msal.getActiveAccount();
      if (account && token !== cookieTokenRef.current) {
        const stored = await storeTokenInCookies(
          token,
          account.localAccountId || account.homeAccountId,
          getEmailFromAccount(account),
          account.name,
          null,
          { refresh: true }
        );
        /* The server says the session ran out while this tab slept: end it here
           too, with the message, rather than hand the save a token the server
           has just refused to keep (rule 0). */
        if (stored === "idle") {
          void signOutIdle();
          return null;
        }
        // Only a write that landed counts, or a failed one is never retried
        // and the session stays broken until a reload.
        if (stored === "stored") cookieTokenRef.current = token;
      }

      return token;
    },
    [signOutIdle]
  );

  const getAccessToken = useCallback(() => syncCookieToken(true), [syncCookieToken]);

  /*
   * **Keep the cookie's bearer live while the tab is open** - every minute, and
   * the moment the tab is looked at again. Reads never pass through
   * `getAccessToken()`, so without this the dv_* cookies held whatever token
   * the page loaded with, and MSAL's cached token can have minutes left when
   * it is read: every screen then answered 401 while the middleware, reading
   * the hour `dv_expires_at` claims, still let the pages render.
   *
   * It does not hold an idle session open: a refresh write is refused once the
   * session has run out (`/api/auth/dataverse/token`, which then signs this
   * tab out with the message), and it no longer counts as presence there.
   * A background tab's interval is throttled by the browser to about once a
   * minute, which is all this asks for.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    const check = () => {
      void syncCookieToken(false);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = window.setInterval(check, COOKIE_TOKEN_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [isAuthenticated, syncCookieToken]);

  const getGraphAccessToken = useCallback(async () => {
    const isConfigured = await checkAzureConfigured();
    if (!isConfigured) return null;
    const msal = await getMsalFunctions();
    return msal.getGraphAccessToken();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (isAuthenticated) {
      await checkProfile();
    }
  }, [isAuthenticated, checkProfile]);

  // Compute isAdmin from profile OR super admin emails
  const isAdmin = useMemo(() => {
    // Check if user's email is in super admin list
    const userEmail = user?.email?.toLowerCase() || "";
    const isSuperAdmin = SUPER_ADMIN_EMAILS.some(
      (email) => email.toLowerCase() === userEmail
    );

    // Admin if super admin OR profile has admin role
    return isSuperAdmin || userProfile?.role === "admin";
  }, [user?.email, userProfile?.role]);

  // A super admin outranks whatever the profile says; otherwise the profile
  // decides, and a caller with no profile yet is an ordinary user.
  const role: UserRole = useMemo(
    () => (isAdmin ? "admin" : userProfile?.role ?? "user"),
    [isAdmin, userProfile?.role]
  );

  const contextValue = useMemo(
    () => ({
      isInitialized,
      isAuthenticated,
      isLoading,
      user,
      account,
      userProfile,
      profileStatus,
      administrators,
      isAdmin,
      role,
      login,
      logout,
      getAccessToken,
      getGraphAccessToken,
      refreshProfile,
    }),
    [
      isInitialized,
      isAuthenticated,
      isLoading,
      user,
      account,
      userProfile,
      profileStatus,
      administrators,
      isAdmin,
      role,
      login,
      logout,
      getAccessToken,
      getGraphAccessToken,
      refreshProfile,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

/**
 * Extract the actual email from Azure AD account
 */
function getEmailFromAccount(account: AccountInfo): string {
  const claims = account.idTokenClaims || {};
  return (
    (claims.email as string) ||
    (claims.preferred_username as string) ||
    account.username
  );
}

/**
 * Store token in cookies for middleware authentication
 */
/**
 * `"idle"` only for `refresh: true` - the server refused to revive a session
 * that ran out (`/api/auth/dataverse/token`). A sign-in never sends it.
 */
async function storeTokenInCookies(
  accessToken: string,
  userId: string,
  userEmail: string,
  userName?: string,
  expiresOn?: Date | null,
  options: { refresh?: boolean } = {}
): Promise<"stored" | "failed" | "idle"> {
  try {
    const expiresAt = expiresOn ? expiresOn.getTime() : Date.now() + 3600000;

    const response = await fetch("/api/auth/dataverse/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        accessToken,
        userId,
        userEmail,
        userName,
        expiresAt,
        ...(options.refresh ? { refresh: true } : {}),
      }),
    });

    if (!response.ok) {
      if (response.status === 401 && options.refresh) {
        const answer = (await response.json().catch(() => null)) as { idle?: unknown } | null;
        if (answer?.idle === true) return "idle";
      }
      console.error("[AuthProvider] Failed to store token, status:", response.status);
      return "failed";
    }

    return "stored";
  } catch (error) {
    console.error("[AuthProvider] Failed to store token:", error);
    return "failed";
  }
}

/**
 * Clear token cookies on logout
 */
async function clearTokenCookies() {
  try {
    await fetch("/api/auth/dataverse/token", {
      method: "DELETE",
    });
  } catch (error) {
    console.error("[AuthProvider] Failed to clear token:", error);
  }
}

export default AuthProvider;
