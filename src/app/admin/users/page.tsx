"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  User,
  Shield,
  AlertCircle,
  Trash2,
  Mail,
  Calendar,
  Send,
  Eye,
  Copy,
  Check,
  UserPlus,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { sendInvitation } from "@/lib/notify/send-mail";
import { Header } from "@/components/ui/Header";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserSearchSelect, type Office365User } from "@/components/ui/UserSearchSelect";
import { useAuth } from "@/components/providers/AuthProvider";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { InvitePreviewModal, type InvitePreviewInput } from "@/components/admin/InvitePreviewModal";
import { CompaniesDialog, CompanyPicker, accessFromCodes, codesFromAccess } from "@/components/admin/CompanyAccess";
import { customersFetcher } from "@/components/invoices/shared";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { BusyRing, LoadingBlock } from "@/components/ui/Loading";
import {
  countGrantedEntities,
  ROLE_HINTS,
  ROLE_LABELS,
  USER_ROLES,
  isSuperAdmin,
  type EntityAccess,
  type UserProfile,
  type UserRole,
} from "@/lib/types/user-profile";

/**
 * Admin User Management Page
 *
 * One column, two cards (redesigned 2026-11-23): **Invite New User** and **All Users**.
 * Administrators can:
 * - Invite a person picked from Office 365 with one of three roles (Admin / F&A Admin / User)
 * - Change a role in place, from the chip on the row
 * - Re-send the app link, deactivate or delete a profile
 */

interface InviteForm {
  email: string;
  displayName: string;
  /** From the directory at pick time, stored so it survives a reload. */
  jobTitle: string;
  role: UserRole;
  /** For a User: the customer codes whose invoices they may see. Admin and F&A Admin see every company. */
  companies: string[];
}

const EMPTY_FORM: InviteForm = { email: "", displayName: "", jobTitle: "", role: "user", companies: [] };

/** Nobody invited here has any CAPEX entity access to start with; the column is kept empty. */
const NO_ENTITY_ACCESS: EntityAccess = {};

/**
 * Roles, in the order they are offered - least to most.
 *
 * The words come from `ROLE_LABELS` / `ROLE_HINTS`, so the card that grants a role and
 * the chip that reports one cannot describe it differently.
 */
const ROLE_OPTIONS: Array<{ role: UserRole; label: string; hint: string }> = USER_ROLES.map((role) => ({
  role,
  label: ROLE_LABELS[role],
  hint: ROLE_HINTS[role],
}));

const joinedDate = (iso: string): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

const subscribeNever = () => () => {};

/**
 * The app's address (its landing page), with a button that copies it - for pasting into a chat or a
 * mail of your own. Read from the browser, so it is the deployment in use (production in production);
 * the server snapshot is empty, which keeps the first paint the same on both sides.
 */
function CopyAppUrl() {
  const url = useSyncExternalStore(subscribeNever, () => `${window.location.origin}/`, () => "");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (permissions, an insecure page): say so, and the address
      // is on screen to select by hand.
      setFailed(true);
    }
  };

  if (!url) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">App link</span>
      <code className="min-w-0 break-all rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm text-[#2D2A28] dark:text-white select-all">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border border-[#0057BC] text-[#0057BC] dark:border-[#00A3DE] dark:text-[#00A3DE] hover:bg-[#0057BC]/5 dark:hover:bg-[#00A3DE]/10 transition-all duration-300 ease-in-out"
      >
        {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
        <span role="status">{copied ? "Copied" : "Copy"}</span>
      </button>
      {failed && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not copy - select the address and copy it by hand.
        </span>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const {
    isAdmin,
    userProfile,
    isLoading: authLoading,
    getAccessToken,
    getGraphAccessToken,
  } = useAuth();
  const access = useAdminAccess("admin-users");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<InviteForm>(EMPTY_FORM);
  /** The row whose role is being saved, so only its own chip is busy. */
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  /** The profile the delete dialog is asking about, if it is open. */
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** The row whose invitation is in flight, so only its own button spins. */
  const [invitingId, setInvitingId] = useState<string | null>(null);
  /**
   * "Invitation sent to ...", kept separate from `notice`.
   *
   * `notice` is the amber panel for something that went partly wrong. A message
   * that was delivered is not that, and colouring it amber teaches an admin to
   * read the one panel that matters as decoration.
   */
  const [sent, setSent] = useState<string | null>(null);
  /** The invitation mail being previewed (nothing is sent), if the dialog is open. */
  const [preview, setPreview] = useState<InvitePreviewInput | null>(null);
  /** The user whose companies are being edited, if the dialog is open. */
  const [companiesFor, setCompaniesFor] = useState<UserProfile | null>(null);
  const { data: customerData, error: customerError, isLoading: customersLoading } = useSWR(
    isAdmin ? "/api/customers" : null,
    customersFetcher,
    { revalidateOnFocus: false }
  );

  /**
   * The `dv_*` cookies are written when AuthProvider initialises, while MSAL
   * keeps refreshing its own token silently - so a tab left open past the hour
   * sends an expired cookie and these routes report the caller as not signed in
   * at all. Refreshing first is what keeps a long admin session working.
   */
  const withFreshSession = useCallback(
    async (input: string, init?: RequestInit) => {
      await getAccessToken();
      return fetch(input, init);
    },
    [getAccessToken]
  );

  // Fetch users
  /* The list is blanked for the first load only: a re-read after a role change must not throw
     the reader back to a loader and lose their place in the list. */
  const hasLoaded = useRef(false);
  const fetchUsers = useCallback(async () => {
    if (!hasLoaded.current) setIsLoading(true);
    setError(null);
    try {
      const response = await withFreshSession("/api/admin/users");
      if (!response.ok) {
        if (response.status === 401) {
          setError("Your session expired. Sign in again.");
          return;
        }
        if (response.status === 403) {
          setError("Access denied. Admin privileges required.");
          return;
        }
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [withFreshSession]);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchUsers();
    }
  }, [authLoading, isAdmin, fetchUsers]);

  // Filter users by search
  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const searchLower = search.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(searchLower) ||
        u.displayName.toLowerCase().includes(searchLower)
    );
  }, [users, search]);

  /**
   * A person picked from Office 365 - the name and the email land together.
   *
   * `mail` is empty for accounts with no mailbox of their own, so it falls back
   * to `email` then the UPN, as the ringi's own people pickers do. Storing
   * `mail` alone left profiles with a name and no address beside it.
   */
  const handlePickDirectoryUser = (picked: Office365User | null) => {
    if (!picked) {
      setFormData((form) => ({ ...form, displayName: "", email: "", jobTitle: "" }));
      return;
    }
    const email = (picked.mail || picked.email || picked.userPrincipalName || "").toLowerCase();
    setFormData((form) => ({
      ...form,
      displayName: picked.displayName,
      jobTitle: picked.jobTitle || "",
      email,
    }));
  };

  /**
   * Mail the invitation, and say what happened. **Never throws.**
   *
   * Every failure comes back as a sentence, for the reason the route
   * notifications give: a profile that exists but was not announced is a
   * nuisance, while a create that appears to fail because a mailbox was missing
   * is a broken screen, and the admin would press the button again and hit the
   * "already exists" refusal.
   *
   * The token is the admin's own delegated `Mail.Send` - so this arrives from a
   * colleague, not a no-reply address - and is `null` until that scope is
   * consented in Azure AD, which `sendGraphMail` reports in those words.
   *
   * Named for what it does here rather than `sendInvite`, which would sit one
   * letter from the `sendInvitation` it calls. `announce()` on the approval
   * screen is the same wrapper around `sendRouteNotification`, named the same
   * way and for the same reason.
   */
  const announceInvite = useCallback(
    async (user: {
      displayName: string;
      email: string;
      role: UserRole;
    }): Promise<{ ok: boolean; message: string }> => {
      try {
        const msal = await import("@/lib/providers/dataverse/msal-browser");
        const graphToken = await msal.getGraphMailToken();
        const outcome = await sendInvitation(
          {
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            invitedBy: userProfile?.displayName || userProfile?.email || "",
          },
          graphToken
        );
        // `sent`, not `problem` - `sendGraphMail` can report both at once, and
        // reading `problem` alone turns a delivered message into a failure.
        if (outcome.sent === 0) {
          return { ok: false, message: outcome.problem ?? "The invitation was not sent." };
        }
        return { ok: true, message: `Invitation sent to ${user.email}.` };
      } catch {
        // `user?.email`, not `user.email`: this catch runs for anything the try
        // threw, and a `user` that arrived without the fields would throw here
        // too - turning "the invitation did not go" into a raw TypeError in the
        // red panel, about a profile that was created successfully.
        return { ok: false, message: `Could not send an invitation to ${user?.email ?? "that address"}.` };
      }
    },
    [userProfile]
  );

  /**
   * The Invite button on a row - and the retry when the one on create failed.
   *
   * One at a time, across the whole list: `invitingId` disables every row's
   * button, not just this one. Sending several at once would mean several
   * `/me/sendMail` calls racing on one token, and the panel below can only
   * report one outcome - so the second result would silently replace the first.
   */
  const handleInvite = async (user: UserProfile) => {
    setInvitingId(user.id);
    setSent(null);
    setNotice(null);
    const result = await announceInvite(user);
    if (result.ok) setSent(result.message);
    else setNotice(result.message);
    setInvitingId(null);
  };

  /**
   * Create the profile, and - when `sendMail` is true - mail the invitation.
   *
   * Register (`false`) only creates the profile; the mail can be sent later from the row's Send App Link.
   *
   * The invitation goes out from the browser: the POST runs on the server, where there is
   * no delegated Graph token to send `/me/mail` with. Its outcome is waited for so it can be
   * reported - but its failure is a notice, never an error, because the profile already
   * exists and pressing Register & Send Invitation again would be refused as a duplicate.
   */
  const handleInvitePerson = async (sendMail: boolean) => {
    setIsSaving(true);
    setNotice(null);
    setSent(null);
    setError(null);
    try {
      const response = await withFreshSession("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          displayName: formData.displayName,
          jobTitle: formData.jobTitle,
          role: formData.role,
          // The companies a User may see; Admin and F&A Admin see all, so nothing is stored for them.
          entityAccess: formData.role === "user" ? accessFromCodes(formData.companies) : NO_ENTITY_ACCESS,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create user");

      // Alongside the re-read rather than before it: they share nothing.
      if (!sendMail) {
        // Registered only: the mail can be sent later from the row's Send App Link.
        await fetchUsers();
        setNotice(data.warning || null);
        setSent(`${formData.email} is registered. No invitation was sent - use Send App Link on their row when you are ready.`);
        setFormData(EMPTY_FORM);
        return;
      }
      const [invite] = await Promise.all([announceInvite(data.user), fetchUsers()]);
      const warnings = [data.warning, invite.ok ? null : invite.message].filter(Boolean) as string[];
      setNotice(warnings.length > 0 ? warnings.join(" ") : null);
      setSent(invite.ok ? invite.message : null);
      setFormData(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Save the companies a User may see (their `hi_entityaccess` map), and re-read the list.
   * **Throws on failure**, so the dialog stays open with what was ticked and shows the reason.
   */
  const handleSaveCompanies = async (codes: string[]) => {
    if (!companiesFor) return;
    const response = await withFreshSession(`/api/admin/users/${companiesFor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityAccess: accessFromCodes(codes) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to save the companies");
    if (data.warning) setNotice(data.warning);
    setCompaniesFor(null);
    await fetchUsers();
  };

  /** A role chosen on a row: saved at once, and the list re-read so it shows what is stored. */
  const handleChangeRole = async (user: UserProfile, role: UserRole) => {
    if (role === user.role) return;
    setSavingRoleId(user.id);
    setError(null);
    setNotice(null);
    setSent(null);
    try {
      const response = await withFreshSession(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to change the role");
      if (data.warning) setNotice(data.warning);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change the role");
    } finally {
      setSavingRoleId(null);
    }
  };

  // Toggle user active status
  const handleToggleActive = async (user: UserProfile) => {
    try {
      const response = await withFreshSession(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update user");
      }
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  /**
   * Remove the profile record.
   *
   * Distinct from the Active toggle above it, which revokes access and leaves
   * the row: this is for a record that should not exist - a duplicate, or
   * somebody registered by mistake. The server refuses your own profile, so the
   * button is not offered for it either.
   */
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await withFreshSession(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to delete the profile");

      // Said only when it is true, and the server is the one that knows -
      // it asked Dataverse whether this address is really an account's own,
      // which is the only address a sign-in can re-create a profile under.
      setNotice(
        data.willBeRecreatedOnNextSignIn
          ? `${userToDelete.email} is the address Dataverse holds for a super admin's account, so this profile will be created again the next time that account signs in. Its entity access has been cleared.`
          : null
      );
      setUserToDelete(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the profile");
      setUserToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Check if current user can edit this user
  const canEdit = (user: UserProfile) => {
    // Can't edit yourself; and until the signed-in profile is known, nobody is editable.
    if (!userProfile) return false;
    return userProfile.email.toLowerCase() !== user.email.toLowerCase();
  };

  // Admin only. This page used to draw its own refusal, which is how the Admin
  // area came to have several of them saying different things - it is the
  // shared one now, and the same one guards every other screen in the area.
  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-users" />;

  const canInvite = !!formData.email && !!formData.displayName && !isSaving;
  /** What the preview shows: the picked person, or a stand-in until somebody is picked. */
  const previewOf = (displayName: string, email: string, role: UserRole): InvitePreviewInput => ({
    displayName: displayName || "Taro Yamada",
    email: email || "taro.yamada@example.com",
    role,
    invitedBy: userProfile?.displayName || userProfile?.email || "",
  });
  const pickedPerson: Office365User | null = formData.displayName
    ? { id: "", displayName: formData.displayName, mail: formData.email || null, jobTitle: formData.jobTitle || null }
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />

      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] mb-4 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#0057BC]/10 dark:bg-[#00A3DE]/15 flex items-center justify-center">
                <Shield className="w-6 h-6 md:w-7 md:h-7 text-[#0057BC] dark:text-[#00A3DE]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">User Management</h1>
                <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-0.5">
                  Invite new users and manage roles
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div role="alert" className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss"
                className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* A column that could not be written - saved, but not all of it. */}
          {notice && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{notice}</span>
              <button
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="ml-auto p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* A message that actually left the building. HOYA Blue, not amber: the
              panel above it means "read this, something is off". */}
          {sent && (
            <div className="mb-4 p-4 bg-[#0057BC]/5 dark:bg-[#00A3DE]/10 border border-[#0057BC]/30 dark:border-[#00A3DE]/40 rounded-lg text-[#0057BC] dark:text-[#00A3DE] flex items-center gap-2">
              <Mail className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{sent}</span>
              <button
                onClick={() => setSent(null)}
                aria-label="Dismiss"
                className="ml-auto p-1 hover:bg-[#0057BC]/10 dark:hover:bg-[#00A3DE]/15 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Invite New User */}
          <GlassCard className="p-4 md:p-8 mb-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <h2 className="text-lg md:text-xl font-semibold text-[#2D2A28] dark:text-white">Invite New User</h2>
              <CopyAppUrl />
            </div>

            {/* Both boxes search the same directory and fill the same person, so the
                name, the email and the title can never belong to different people. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <UserSearchSelect
                  selectedUser={pickedPerson}
                  onSelect={handlePickDirectoryUser}
                  getAccessToken={getGraphAccessToken}
                  placeholder="Start typing to search..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1.5">Full Name</label>
                <UserSearchSelect
                  selectedUser={pickedPerson}
                  onSelect={handlePickDirectoryUser}
                  getAccessToken={getGraphAccessToken}
                  placeholder="Start typing to search..."
                  nameOnly
                />
              </div>
            </div>

            <fieldset className="mt-6">
              <legend className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-2">
                Role <span className="text-red-500">*</span>
              </legend>
              <div role="radiogroup" aria-label="Role" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ROLE_OPTIONS.map(({ role, label, hint }) => {
                  const selected = formData.role === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setFormData({ ...formData, role })}
                      className={`text-left p-4 rounded-xl border-2 transition-all duration-300 ease-in-out ${
                        selected
                          ? "border-[#0057BC] bg-[#0057BC]/10 dark:border-[#00A3DE] dark:bg-[#00A3DE]/15"
                          : "border-transparent bg-slate-50 dark:bg-slate-800 hover:border-[#0057BC]/30 dark:hover:border-[#00A3DE]/40"
                      }`}
                    >
                      <span
                        className={`block font-semibold ${
                          selected ? "text-[#0057BC] dark:text-[#00A3DE]" : "text-[#2D2A28] dark:text-white"
                        }`}
                      >
                        {label}
                      </span>
                      <span className="block mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {formData.role === "user" && (
              <div className="mt-6">
                <p className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1">Companies this user may see</p>
                <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                  A User sees only the invoices of the companies ticked here. With none ticked they see no invoice. Admin and F&amp;A Admin see every company.
                </p>
                <CompanyPicker
                  customers={customerData?.customers}
                  loading={customersLoading}
                  error={customerError?.message}
                  value={formData.companies}
                  onChange={(companies) => setFormData((form) => ({ ...form, companies }))}
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setPreview(previewOf(formData.displayName, formData.email, formData.role))}
                className="flex items-center gap-2 px-5 py-3 rounded-full font-semibold border border-[#0057BC] text-[#0057BC] dark:border-[#00A3DE] dark:text-[#00A3DE] hover:bg-[#0057BC]/5 dark:hover:bg-[#00A3DE]/10 transition-all duration-300 ease-in-out"
              >
                <Eye className="w-5 h-5" aria-hidden="true" />
                Preview Invitation
              </button>
              <button
                type="button"
                onClick={() => handleInvitePerson(false)}
                disabled={!canInvite}
                title="Create the profile only; no mail is sent"
                className="flex items-center gap-2 px-5 py-3 rounded-full font-semibold border border-[#0057BC] text-[#0057BC] dark:border-[#00A3DE] dark:text-[#00A3DE] hover:bg-[#0057BC]/5 dark:hover:bg-[#00A3DE]/10 transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-5 h-5" aria-hidden="true" />
                Register
              </button>
              <button
                type="button"
                onClick={() => handleInvitePerson(true)}
                disabled={!canInvite}
                title="Create the profile and email the invitation"
                className="flex items-center gap-2 px-6 py-3 bg-[#0057BC] text-white rounded-full font-semibold hover:bg-[#004494] transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSaving ? <BusyRing size={22} /> : <Send className="w-5 h-5" aria-hidden="true" />}
                {isSaving ? "Working..." : "Register & Send Invitation"}
              </button>
            </div>
          </GlassCard>

          {/* All Users */}
          <GlassCard className="p-4 md:p-8">
            <h2 className="text-lg md:text-xl font-semibold text-[#2D2A28] dark:text-white mb-5">
              All Users ({users.length})
            </h2>

            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search by name or email..."
                aria-label="Search users by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm md:text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0057BC]"
              />
            </div>

            {/* Column heads: from md, where the row is a grid. Below it each row
                stacks and says what each part is by its icon and place. */}
            <div className="hidden md:grid grid-cols-[minmax(0,1.7fr)_150px_140px_minmax(0,1.1fr)] gap-4 px-3 pb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              <span>User</span>
              <span>Role</span>
              <span>Joined</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {isLoading ? (
                <LoadingBlock text="Loading users..." size={32} row={false} className="py-10" />
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-slate-500 dark:text-slate-400">No users found</div>
              ) : (
                filteredUsers.map((user) => {
                  const editable = canEdit(user);
                  const roleChoices = ROLE_OPTIONS.some((option) => option.role === user.role)
                    ? ROLE_OPTIONS
                    : [...ROLE_OPTIONS, { role: user.role, label: ROLE_LABELS[user.role], hint: ROLE_HINTS[user.role] }];
                  return (
                    <div
                      key={user.id}
                      className={`flex flex-col gap-3 py-4 px-3 md:grid md:grid-cols-[minmax(0,1.7fr)_150px_140px_minmax(0,1.1fr)] md:items-center md:gap-4 ${
                        !user.isActive ? "opacity-60" : ""
                      }`}
                    >
                      {/* User */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-400" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-[#2D2A28] dark:text-white truncate">
                              {user.displayName || user.email.split("@")[0]}
                            </span>
                            {!user.isActive && (
                              <span className="shrink-0 px-2 py-0.5 text-[11px] rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 min-w-0">
                            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                      </div>

                      {/* Role - a menu for somebody else's row, a plain chip for your own
                          (the server refuses to change the role of the account you are in). */}
                      <div>
                        {editable ? (
                          <div className="relative inline-flex items-center">
                            <select
                              value={user.role}
                              disabled={savingRoleId !== null}
                              onChange={(e) => handleChangeRole(user, e.target.value as UserRole)}
                              aria-label={`Role of ${user.displayName || user.email}`}
                              title={ROLE_HINTS[user.role]}
                              className="appearance-none cursor-pointer pl-3 pr-8 py-1.5 text-sm font-medium rounded-full border border-[#0057BC]/30 bg-[#0057BC]/10 text-[#0057BC] dark:border-[#00A3DE]/40 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] focus:outline-none focus:ring-2 focus:ring-[#0057BC] disabled:opacity-60 disabled:cursor-wait"
                            >
                              {roleChoices.map(({ role, label }) => (
                                <option key={role} value={role} className="text-[#2D2A28]">
                                  {label}
                                </option>
                              ))}
                            </select>
                            {savingRoleId === user.id ? (
                              <span className="absolute right-2 pointer-events-none">
                                <BusyRing size={14} />
                              </span>
                            ) : (
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 20 20"
                                className="absolute right-2.5 w-3.5 h-3.5 pointer-events-none text-[#0057BC] dark:text-[#00A3DE]"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          <RoleBadge role={user.role} className="!text-sm !px-3 !py-1 !rounded-full" />
                        )}
                      </div>

                      {/* Joined */}
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Calendar className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
                        {joinedDate(user.createdAt)}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
                        {user.role === "user" && (
                          <button
                            type="button"
                            onClick={() => setCompaniesFor(user)}
                            disabled={!customerData}
                            title="The companies whose invoices this user may see"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Companies ({countGrantedEntities(user.entityAccess)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreview(previewOf(user.displayName, user.email, user.role))}
                          title="See the invitation mail this person gets"
                          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-[#0057BC] dark:hover:text-[#00A3DE] transition-colors duration-300 ease-in-out"
                        >
                          <Eye className="w-4 h-4" aria-hidden="true" />
                          Preview
                        </button>
                        {user.isActive && (
                          <button
                            type="button"
                            onClick={() => handleInvite(user)}
                            disabled={invitingId !== null}
                            title={`Email the app link to ${user.email}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            {invitingId === user.id ? <BusyRing size={16} /> : <Send className="w-4 h-4" aria-hidden="true" />}
                            Send App Link
                          </button>
                        )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(user)}
                            title={user.isActive ? "Revoke access and keep the record" : "Give access back"}
                            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-[#0057BC] dark:hover:text-[#00A3DE]"
                          >
                            {user.isActive ? (
                              <ToggleRight className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" aria-hidden="true" />
                            )}
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {/* Delete is only offered for a profile that is not yours - the server
                            refuses your own either way, and a button that exists to be refused
                            is just a worse error message. */}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(user)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 hover:underline"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>
      </main>

      {companiesFor && customerData && (
        <CompaniesDialog
          key={companiesFor.id}
          name={companiesFor.displayName || companiesFor.email}
          customers={customerData?.customers}
          loading={customersLoading}
          error={customerError?.message}
          initial={codesFromAccess(companiesFor.entityAccess, customerData?.customers ?? [])}
          onSave={handleSaveCompanies}
          onClose={() => setCompaniesFor(null)}
        />
      )}
      {preview && <InvitePreviewModal input={preview} onClose={() => setPreview(null)} />}

      {/* The app's one delete dialog - the record's name has to be typed.
          Warned about here rather than after the fact. The screen cannot ask
          Dataverse mid-dialog whether this address is really some account's
          own, so it states the condition instead of guessing the outcome; the
          server answers it for certain afterwards, in the notice above. Saying
          "this comes back" flatly would be wrong for the very row this button
          exists to clear - a leftover under a person's sign-in ID. */}
      {userToDelete && (
        <ConfirmDeleteModal
          title="Delete this profile?"
          recordName={userToDelete.displayName || userToDelete.email}
          recordSubtitle={userToDelete.email}
          warning={
            isSuperAdmin(userToDelete.email)
              ? "This address is on the super-admin list. If it is the address Dataverse holds for that account, a fresh profile is created the next time it signs in - with no entity access. If it is that person's second address - a sign-in ID beside their mailbox address - it will not come back. Either way, deleting clears a duplicate rather than revoking access; for that, use Deactivate."
              : "The profile and its entity access are removed. Ringis and routes that name this person keep their own copy of the name and address, so nothing already circulated changes. To revoke access without losing the record, use Deactivate instead."
          }
          isDeleting={isDeleting}
          onCancel={() => setUserToDelete(null)}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}
