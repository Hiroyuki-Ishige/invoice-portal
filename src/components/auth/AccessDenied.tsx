"use client";

/**
 * What an account sees when Microsoft signed it in and this app has no record
 * of it.
 *
 * **This file existed and nothing rendered it**, which is why somebody who had
 * never been registered in Admin > User Management arrived on the Approval
 * System with an empty list and `Error loading approvals` - a screen that reads
 * as a broken app rather than as a missing registration (rule 10). It is now
 * reached from `AccountGate`, which every page passes through.
 *
 * It also had the administrator's address written into it as a default
 * parameter. Who holds the Admin role is a list with an owner - the profiles
 * table - and a second copy in a component is one that goes stale the day the
 * role moves (rule 5). The names now arrive with the refusal itself, through
 * `useAuth().administrators`.
 *
 * Since 2026-10-24 it also asks for the reader: `RequestPanel` sends the
 * registration request from their own mailbox, and `"not_in_environment"` - an
 * account Dataverse answered it does not know - has a screen of its own. It is
 * loaded only when a refusal is drawn (`AccountGate`'s `next/dynamic`), so none
 * of this is in the JavaScript a registered person downloads.
 */

import { DatabaseZap, Mail, LogOut, RefreshCw, Send, ShieldX, Settings, UserX } from "lucide-react";
import { useState } from "react";
import { useAuth, type ProfileStatus } from "@/components/providers/AuthProvider";
import { AppName } from "@/components/ui/AppName";
import { SUPER_ADMIN_EMAILS } from "@/lib/types/user-profile";
import {
  MAX_REQUEST_NOTE,
  requestSubject,
  type RegistrationRequestReason,
} from "@/lib/notify/registration-request-terms";
import type { AdministratorContact } from "@/lib/auth/administrator-contacts";

/**
 * Every `profileStatus` that is a refusal - derived, so a status added there is
 * a reason here without anybody keeping two lists in step (rule 3).
 *
 * `"error"` is not one. It is everything that could not be established - a
 * lapsed token, a timeout, a role without Read on the profiles table - and
 * gating it locked registered people out (rule 25); `AccountGate` lets it
 * through. `"not_in_environment"` is the refusal it was standing in for.
 */
export type AccessDeniedReason = Exclude<ProfileStatus, "loading" | "authorized" | "error">;

/** The three weights of one button; the colour is the only thing that varies. */
const BUTTON_BASE =
  "flex items-center justify-center gap-2 w-full px-6 py-3 disabled:opacity-60 font-semibold rounded-xl transition-colors duration-300";
const BUTTON_FILLED = `${BUTTON_BASE} bg-[#0057BC] hover:bg-[#004494] text-white`;
const BUTTON_OUTLINED = `${BUTTON_BASE} bg-white dark:bg-transparent border border-[#0057BC]/40 dark:border-[#00A3DE]/40 text-[#0057BC] dark:text-[#00A3DE] hover:bg-[#0057BC]/5 dark:hover:bg-[#00A3DE]/10`;
const BUTTON_QUIET = `${BUTTON_BASE} bg-white dark:bg-transparent border border-[#2D2A28]/40 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-[#2D2A28] dark:text-slate-200`;

interface AccessDeniedProps {
  /** Why this screen is showing. One closed set, matching `profileStatus`. */
  reason?: AccessDeniedReason;
}

export function AccessDenied({ reason = "no_profile" }: AccessDeniedProps) {
  const { logout, user, userProfile, administrators, refreshProfile } = useAuth();
  const [isRechecking, setIsRechecking] = useState(false);

  /* The address a profile has to be registered under for this account to be
     recognised - the one thing the administrator needs from the reader. */
  const signedInAs = userProfile?.email || user?.email || "";

  /**
   * The names, as the sentence prints them.
   *
   * **Empty is "nobody to name", not "there is no administrator."** The list is
   * absent from the response when it could not be read at all, and the two are
   * not the same fact (rule 6) - so the sentence simply drops the parenthesis
   * rather than asserting either.
   */
  const names = administrators.map((admin) => admin.name).join(", ");

  const message = messageFor(reason, names);
  const Icon = ICONS[reason];

  /**
   * Who a request goes to: the Admin profiles the server named, or - when it
   * named nobody, which for `"not_in_environment"` is always, since an account
   * Dataverse does not know cannot read the profiles table - the super admins.
   * Both are lists with an owner; this picks between them, it copies neither
   * (rule 5). The two super-admin addresses are one mailbox, which Exchange
   * delivers to once.
   */
  const recipients: AdministratorContact[] =
    administrators.length > 0
      ? administrators
      : SUPER_ADMIN_EMAILS.map((email) => ({ name: email, email }));
  /** `table_not_found` is fixed by Admin > Setup, not by registering anybody. */
  const mayRequest = reason !== "table_not_found";

  async function recheck() {
    setIsRechecking(true);
    try {
      await refreshProfile();
    } finally {
      setIsRechecking(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#2D2A28] p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-[#1a1918] rounded-2xl shadow-xl p-6 md:p-8 text-center border border-[#B0B5B5]/20 dark:border-[#B0B5B5]/10">
          {/* HOYA Blue, not red: this is a registration that has not happened
              yet, and red is kept for a destructive act or a refusal the reader
              must not miss (rule 33). */}
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-5 md:mb-6 rounded-full bg-[#0057BC]/10 dark:bg-[#00A3DE]/15 flex items-center justify-center">
            <Icon className="w-8 h-8 md:w-10 md:h-10 text-[#0057BC] dark:text-[#00A3DE]" />
          </div>

          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3">
            {message.title}
          </h1>

          {/* Built as one string rather than a text line with an expression in
              it: JSX drops the space around an interpolation as soon as
              anything sits between the two halves (rule 35). */}
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mb-6">
            {message.detail}
          </p>

          {mayRequest && (
            <RequestPanel
              reason={reason}
              signedInAs={signedInAs}
              displayName={user?.userMetadata?.displayName ?? ""}
              recipients={recipients}
              names={names}
            />
          )}

          {signedInAs && (
            <div className="mb-6 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                {/* The address to quote when asking. An account has more than
                    one - the mailbox and the sign-in name - and a profile only
                    counts if it is registered under one Dataverse holds for
                    this account. */}
                Signed in as
              </p>
              <p className="text-sm text-slate-900 dark:text-white font-medium break-all">
                {signedInAs}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={recheck}
              disabled={isRechecking}
              /* The request is the filled button when there is one - one
                 primary action per screen - and Check again steps down to the
                 outlined weight of the same hue (rule 33). */
              className={mayRequest ? BUTTON_OUTLINED : BUTTON_FILLED}
            >
              {isRechecking ? (
                /* Not `BusyRing`: that ring is HOYA Blue, which is this
                   button's own background. `border-current` follows the text. */
                <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              {/* Says what it does, because nothing here changes on its own:
                  the answer is only re-read when somebody asks for it. */}
              Check again
            </button>

            <button
              onClick={logout}
              className={BUTTON_QUIET}
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          <AppName />
        </p>
      </div>
    </div>
  );
}

/**
 * **Ask from here, not from a mail client.** The request goes out on Graph
 * from the reader's own mailbox (`sendRegistrationRequest`), which needs only
 * the Microsoft 365 sign-in this screen already has - never Dataverse, which an
 * unregistered account may have no access to at all. Until 2026-10-24 the only
 * way to ask was a mailto per Admin, and it was not drawn at all when the
 * Admins could not be read.
 *
 * The mailto stays, under the button, for the two cases the send cannot cover:
 * `Mail.Send` not consented for this account, and a reader who would rather
 * write their own message.
 */
function RequestPanel({
  reason,
  signedInAs,
  displayName,
  recipients,
  names,
}: {
  reason: RegistrationRequestReason;
  signedInAs: string;
  displayName: string;
  recipients: AdministratorContact[];
  /** The Admins the server named, joined for a sentence. Empty: nobody to name. */
  names: string;
}) {
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  /** One send per visit to this screen; the form is replaced once it has gone. */
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reactivate = reason === "deactivated";
  const mailto = requestMailto(
    reason,
    recipients.map((person) => person.email),
    signedInAs,
    displayName
  );
  const whatNext = reactivate ? "switched your account back on" : "registered you";

  async function send() {
    setIsSending(true);
    setProblem(null);
    try {
      /* Dynamic, like every MSAL import in the app: it touches browser APIs
         and would break the server render (nextjs-patterns). */
      const [msal, { sendRegistrationRequest }] = await Promise.all([
        import("@/lib/providers/dataverse/msal-browser"),
        import("@/lib/notify/send-mail"),
      ]);
      const graphToken = await msal.getGraphMailToken();
      const outcome = await sendRegistrationRequest(
        { reason, displayName, signedInAs, note },
        recipients,
        graphToken
      );
      if (outcome.sent > 0) {
        setSent(true);
        /* A partial send still reached somebody; what was dropped is said. */
        setProblem(outcome.problem ?? null);
      } else {
        setProblem(outcome.problem ?? "The request could not be sent.");
      }
    } catch (error) {
      console.error("[AccessDenied] Registration request failed:", error);
      setProblem("The request could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="mb-6 text-left">
      {!sent ? (
        <>
          <label
            htmlFor="registration-request-note"
            className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
          >
            {reactivate
              ? "Anything the Administrator should know (optional)"
              : "Your site, department and what you need (optional)"}
          </label>
          <textarea
            id="registration-request-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_REQUEST_NOTE}
            rows={3}
            disabled={isSending}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-900 dark:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0057BC]/30 dark:focus:ring-[#00A3DE]/40"
          />
          <button
            onClick={send}
            disabled={isSending}
            className="mt-3 flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#0057BC] hover:bg-[#004494] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors duration-300"
          >
            {isSending ? (
              <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            {reactivate ? "Ask to reactivate my account" : "Send registration request"}
          </button>
          {/* Says who it goes to before it goes - a button that mails people
              should not leave the reader guessing whom (rule 10). */}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
            {names
              ? `Sent from your mailbox to the Administrator (${names}).`
              : "Sent from your mailbox to this app's administrators."}
          </p>
        </>
      ) : (
        <div
          role="status"
          className="p-3 rounded-lg bg-[#0057BC]/10 dark:bg-[#00A3DE]/15 border border-[#0057BC]/30 dark:border-[#00A3DE]/40 text-sm text-[#0057BC] dark:text-[#00A3DE]"
        >
          {/* What happens next is the reader's to do: nothing on this screen
              changes by itself, so it names the button that re-asks. One
              string, because JSX drops spaces around an expression (rule 35). */}
          {`Your request has been sent. Once the Administrator has ${whatNext}, press Check again.`}
        </div>
      )}

      {problem && (
        /* Warm Black and weight, not red: a send that did not go is not a
           destructive act (rule 33), and the mailto under it is the way on. */
        <p role="alert" className="mt-2 text-xs font-semibold text-[#2D2A28] dark:text-slate-200 text-center">
          {problem}
        </p>
      )}

      {/* The fallback, quieter than the button, and the one route that does
          not depend on Mail.Send. */}
      <p className="mt-3 text-xs text-center">
        <a
          href={mailto}
          className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE] underline underline-offset-2"
        >
          <Mail className="w-3.5 h-3.5" />
          Or write the request in your own mail app
        </a>
      </p>
    </div>
  );
}

const ICONS: Record<AccessDeniedReason, typeof UserX> = {
  no_profile: UserX,
  deactivated: ShieldX,
  not_in_environment: DatabaseZap,
  table_not_found: Settings,
};

/** One sentence per reason, and the names only where they are the next step. */
function messageFor(
  reason: AccessDeniedReason,
  names: string
): { title: string; detail: string } {
  const administrator = names
    ? `Please contact the Administrator (${names}).`
    : "Please contact the Administrator.";

  if (reason === "deactivated") {
    return {
      title: "Your account has been deactivated",
      detail: `Your registration still exists but has been switched off, so this app will not open. ${administrator}`,
    };
  }
  if (reason === "not_in_environment") {
    /* Dataverse *answered* that it does not know this account - not a bad
       minute, which arrives as `"error"` and is let through. Registering alone
       will not open the app, so the sentence says the other half too. */
    return {
      title: "Your account is not set up for this app yet",
      detail:
        "Dataverse, where this app keeps its data, does not recognise this account, so " +
        "nothing here can be read for it. An administrator has to add it to the " +
        "environment and register it - send a request below.",
    };
  }
  if (reason === "table_not_found") {
    return {
      title: "This app is not set up yet",
      detail:
        "The user registration table has not been created in this environment, " +
        "so nobody can be registered and nobody can be named here. An " +
        "administrator has to run Admin > Setup once.",
    };
  }
  return {
    title: "You are not registered as a user yet",
    detail: administrator,
  };
}

/**
 * A mail that already says who is asking and for what.
 *
 * Asks for the right thing per reason: an account that was switched off does
 * not need registering, and a request to "register this account" would send the
 * administrator looking for a row that is already there. The subject is the
 * one the app's own mail carries (`requestSubject`); the body is the reader's
 * voice, not the app's, so it is written here.
 */
function requestMailto(
  reason: RegistrationRequestReason,
  adminEmails: string[],
  signedInAs: string,
  displayName: string
): string {
  const subject = encodeURIComponent(requestSubject(reason, displayName || signedInAs));
  const body = encodeURIComponent(
    "Hello,\n\n" +
      MAILTO_ASKS[reason] +
      `Signed in as: ${signedInAs || "(unknown)"}\n\n` +
      "Thank you."
  );
  /* Each address encoded: they come out of a profile row, and an unencoded
     `?` or `&` in one would add a header of its own to the mail. */
  return `mailto:${adminEmails.map(encodeURIComponent).join(",")}?subject=${subject}&body=${body}`;
}

const MAILTO_ASKS: Record<RegistrationRequestReason, string> = {
  no_profile:
    "I signed in to Invoice Portal but I am not registered as a user yet.\n" +
    "Could you register this account?\n\n",
  deactivated:
    "I signed in to Invoice Portal and it says my account has been deactivated.\n" +
    "Could you switch it back on?\n\n",
  not_in_environment:
    "I signed in to Invoice Portal and it says Dataverse does not recognise my account.\n" +
    "Could you add it to the environment and register it?\n\n",
};

export default AccessDenied;
