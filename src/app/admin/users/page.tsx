"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Plus,
  User,
  Shield,
  ShieldCheck,
  ShieldPlus,
  ToggleLeft,
  ToggleRight,
  Save,
  X,
  RefreshCw,
  AlertCircle,
  Trash2,
  Mail,
  FlaskConical,
  Check,
} from "lucide-react";
import { useRingiPreview } from "@/hooks/useRingiPreview";
import { sendInvitation } from "@/lib/notify/send-mail";
import { Header } from "@/components/ui/Header";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserSearchSelect, type Office365User } from "@/components/ui/UserSearchSelect";
import { useAuth } from "@/components/providers/AuthProvider";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { LoadingBlock } from "@/components/ui/Loading";
import {
  ENTITY_ACCESS_LABELS,
  ENTITY_ACCESS_LEVELS,
  ROLE_HINTS,
  ROLE_LABELS,
  USER_ROLES,
  countGrantedEntities,
  isSuperAdmin,
  entityAccessLevel,
  type EntityAccess,
  type EntityAccessLevel,
  type UserProfile,
  type UserRole,
} from "@/lib/types/user-profile";

/**
 * Admin User Management Page
 *
 * Allows administrators to:
 * - Register new users and view every profile
 * - Edit user roles (Admin / F&A-Admin / User)
 * - Grant access per CAPEX entity (None / View / Edit)
 * - Activate/deactivate users
 */

interface UserFormData {
  email: string;
  displayName: string;
  /** From the directory at pick time, stored so it survives a reload. */
  jobTitle: string;
  role: UserRole;
  /** Per entity code. An entity that is absent means no access. */
  entityAccess: EntityAccess;
}

interface CapexEntity {
  id: string;
  name: string;
}

const EMPTY_FORM: UserFormData = {
  email: "",
  displayName: "",
  jobTitle: "",
  role: "user",
  entityAccess: {},
};

/**
 * Roles, in the order they are offered - least to most.
 *
 * The words come from `ROLE_LABELS` / `ROLE_HINTS`, so the button that grants a
 * role and the chip that reports one cannot describe it differently.
 */
/**
 * The Ringi trial pill on a list row: HOYA Blue tint when the person is a
 * member, the white / Warm Black outline when not - one hue, filled or
 * outlined (rule 33). `#0057BC` on its 10% tint is 6.0:1; Warm Black on white
 * 14:1.
 */
const trialPillClass = (member: boolean): string =>
  `px-2 py-0.5 rounded-full text-xs font-medium border ${
    member
      ? "bg-[#0057BC]/10 text-[#0057BC] border-[#0057BC]/30 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] dark:border-[#00A3DE]/40"
      : "bg-white text-[#2D2A28] border-[#2D2A28]/40 hover:border-[#0057BC] dark:bg-transparent dark:text-slate-300 dark:border-slate-500"
  }`;

const ROLE_OPTIONS: Array<{ role: UserRole; label: string; hint: string }> = USER_ROLES.map((role) => ({
  role,
  label: ROLE_LABELS[role],
  hint: ROLE_HINTS[role],
}));

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
  const [entities, setEntities] = useState<CapexEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);
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
  /**
   * **The Ringi preview** (`lib/auth/ringi-preview`): the switch above the
   * list and the "Ringi trial member" tick on each profile. Admins are members
   * whatever the list says, so their tick is not offered.
   */
  const ringiPreview = useRingiPreview();
  /** The write in flight - `"switch"` or a profile id - so only its control waits. */
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const isRingiMember = (user: UserProfile) =>
    user.role === "admin" || isSuperAdmin(user.email) || (ringiPreview.memberIds ?? []).includes(user.id.toLowerCase());

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
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [withFreshSession]);

  /**
   * The entities to offer a right for, read from Dataverse rather than listed
   * here - a copy would stop tracking the table the moment one is added.
   */
  const fetchEntities = useCallback(async () => {
    try {
      const response = await withFreshSession("/api/dataverse/entities");
      if (!response.ok) return;
      const data = await response.json();
      setEntities(data.entities || []);
    } catch {
      // Not fatal: the rest of the screen still edits roles and status, and the
      // access card says the list could not be loaded.
    }
  }, [withFreshSession]);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchUsers();
      fetchEntities();
    }
  }, [authLoading, isAdmin, fetchUsers, fetchEntities]);

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

  // Handle user selection
  const handleSelectUser = (user: UserProfile) => {
    setSelectedUser(user);
    setIsCreating(false);
    setNotice(null);
    setSent(null);
    setFormData({
      email: user.email,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      role: user.role,
      entityAccess: { ...user.entityAccess },
    });
  };

  // Handle create new
  const handleCreateNew = () => {
    setSelectedUser(null);
    setIsCreating(true);
    setNotice(null);
    setSent(null);
    setFormData(EMPTY_FORM);
  };

  /**
   * Close the form.
   *
   * Deliberately does **not** clear `notice` or `sent`, unlike the two handlers
   * above: the successful path through Create User ends by calling this, and
   * the whole point of "Invitation sent to ..." is that it survives the form
   * closing. Opening a form again does clear them, because by then the message
   * is about a record the admin has stopped looking at.
   */
  const handleCancel = () => {
    setSelectedUser(null);
    setIsCreating(false);
    setFormData(EMPTY_FORM);
  };

  /**
   * A person picked from Office 365 - the name and the email land together.
   *
   * `mail` is empty for accounts with no mailbox of their own, so it falls back
   * to `email` then the UPN, as the ringi's own people pickers do. Storing
   * `mail` alone left profiles with a name and no address beside it.
   */
  const handlePickDirectoryUser = (picked: Office365User | null) => {
    if (!picked) {
      // Clearing the field on an existing profile would only unpair the name
      // from an email that cannot change, so the name is left alone there.
      if (isCreating) setFormData({ ...formData, displayName: "", email: "", jobTitle: "" });
      return;
    }

    const email = (picked.mail || picked.email || picked.userPrincipalName || "").toLowerCase();

    if (!isCreating && selectedUser && email && email !== selectedUser.email.toLowerCase()) {
      setNotice(
        `${picked.displayName} signs in as ${email}, and the email on a profile is the account itself - it cannot be reassigned. Register them as a new user instead.`
      );
      return;
    }

    setFormData({
      ...formData,
      displayName: picked.displayName,
      jobTitle: picked.jobTitle || "",
      // Left as it is when editing: the email is the key this profile was
      // created under, and the API refuses to change it.
      email: isCreating ? email : formData.email,
    });
  };

  /** One entity's level. "none" is removed, so the map holds what was granted. */
  const setEntityLevel = (entity: string, level: EntityAccessLevel) => {
    setFormData((prev) => {
      const next = { ...prev.entityAccess };
      if (level === "none") delete next[entity];
      else next[entity] = level;
      return { ...prev, entityAccess: next };
    });
  };

  /** The same level for every entity - the usual case is all or nothing. */
  const setAllEntityLevels = (level: EntityAccessLevel) => {
    setFormData((prev) => ({
      ...prev,
      entityAccess:
        level === "none"
          ? {}
          : Object.fromEntries(entities.map((entity) => [entity.name, level])),
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
      entityAccess: EntityAccess;
    }): Promise<{ ok: boolean; message: string }> => {
      try {
        const msal = await import("@/lib/providers/dataverse/msal-browser");
        const graphToken = await msal.getGraphMailToken();
        const outcome = await sendInvitation(
          {
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            entityAccess: user.entityAccess,
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

  // Save user (create or update)
  const handleSave = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      if (isCreating) {
        // Create new user
        const response = await withFreshSession("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to create user");
        }
        // The invitation goes out here, from the browser: the POST above runs on
        // the server, where there is no delegated Graph token to send `/me/mail`
        // with. Its outcome is waited for, so it can be reported - but its
        // failure is a notice, never an error, because the profile is already
        // created and re-pressing Create would be refused as a duplicate.
        //
        // Alongside the re-read rather than before it. They share nothing: the
        // list comes back from Dataverse, the mail goes out through Graph, and
        // neither needs the other's answer. Run in sequence, a Save that
        // already cost one round trip sat spinning through two more, the middle
        // one being a token acquisition and a send.
        const [invite] = await Promise.all([announceInvite(data.user), fetchUsers()]);

        // A column this environment does not have yet is a notice, not a
        // failure: everything else was saved.
        const warnings = [data.warning, invite.ok ? null : invite.message].filter(
          Boolean
        ) as string[];
        setNotice(warnings.length > 0 ? warnings.join(" ") : null);
        setSent(invite.ok ? invite.message : null);
        if (!data.warning) handleCancel();
      } else if (selectedUser) {
        // Update existing user
        const response = await withFreshSession(`/api/admin/users/${selectedUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: formData.displayName,
            jobTitle: formData.jobTitle,
            role: formData.role,
            entityAccess: formData.entityAccess,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to update user");
        }
        if (data.warning) setNotice(data.warning);
        await fetchUsers();
        // Update selected user
        setSelectedUser(data.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
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
      // Update selected user if it's the same
      if (selectedUser?.id === user.id) {
        const data = await response.json();
        setSelectedUser(data.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  /**
   * One write to the Ringi preview - the switch, or one person's tick - saved
   * at once, as the Account Status toggle is. The answer is the setting as
   * saved, and the hook re-reads it so the menu and the ticks agree.
   */
  const savePreview = async (busy: string, payload: { enabled: boolean } | { profileId: string; member: boolean }) => {
    setPreviewBusy(busy);
    setError(null);
    try {
      const response = await withFreshSession("/api/settings/ringi-preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The Ringi preview setting was not saved");
      await ringiPreview.mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Ringi preview setting was not saved");
    } finally {
      setPreviewBusy(null);
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
      if (selectedUser?.id === userToDelete.id) handleCancel();
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
    // Can't edit yourself (except display name)
    return userProfile?.email.toLowerCase() !== user.email.toLowerCase();
  };

  // Admin only. This page used to draw its own refusal, which is how the Admin
  // area came to have several of them saying different things - it is the
  // shared one now, and the same one guards every other screen in the area.
  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-users" />;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />

      <main className="flex-1 py-6 md:py-8 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] mb-3 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">
                  User Management
                </h1>
                <p className="text-sm md:text-base text-[#B0B5B5] mt-1">
                  Manage user access and permissions
                </p>
              </div>
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-2 px-4 py-2 bg-[#0057BC] text-white rounded-lg hover:bg-[#004494] transition-colors text-sm md:text-base"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add User</span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
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
                className="ml-auto p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* A message that actually left the building. Green, not amber: the
              panel above it means "read this, something is off". */}
          {sent && (
            <div className="mb-4 p-4 bg-[#0057BC]/5 dark:bg-[#00A3DE]/10 border border-[#0057BC]/30 dark:border-[#00A3DE]/40 rounded-lg text-[#0057BC] dark:text-[#00A3DE] flex items-center gap-2">
              <Mail className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{sent}</span>
              <button
                onClick={() => setSent(null)}
                className="ml-auto p-1 hover:bg-[#0057BC]/10 dark:hover:bg-[#00A3DE]/15 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* **The Ringi preview switch.** While it is on, only trial members
              (ticked below, on each profile) and admins can open Ringi
              application, and its mail to anybody else is marked [TEST]. The
              first switch-on ticks everybody registered at that moment. */}
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-[#0057BC]/30 dark:border-[#00A3DE]/40">
            <FlaskConical className="hidden sm:block w-5 h-5 shrink-0 text-[#0057BC] dark:text-[#00A3DE]" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-[#2D2A28] dark:text-white">
                Ringi application preview: {ringiPreview.enabled ? "On" : "Off"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {ringiPreview.enabled
                  ? `Only trial members (${users.filter((user) => user.isActive && isRingiMember(user)).length} active, admins included) can open it. Its mail to anybody else is marked [TEST]. Switch a person with the Ringi trial button on their row.`
                  : "Everybody the Role Permissions table allows can open it, and its mail is not marked. Turning the preview on makes every user registered now a trial member."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => savePreview("switch", { enabled: !ringiPreview.enabled })}
              disabled={previewBusy !== null || ringiPreview.isLoading || !ringiPreview.readable}
              className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {previewBusy === "switch" && <RefreshCw className="w-4 h-4 animate-spin" />}
              {ringiPreview.enabled ? "Turn preview off" : "Turn preview on"}
            </button>
          </div>

          {/* Main Content - Split View. 40 / 60 (ui-design 0.2), not 33 / 67:
              at a third the rows wrapped their budget line and cut names short,
              while the form beside it had room to spare (asked 2026-10-02). */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            {/* Left Panel - User List */}
            <div className="lg:col-span-2 order-2 lg:order-1">
              <GlassCard className="p-4">
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B5B5]" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057BC]"
                  />
                </div>

                {/* Refresh Button */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[#B0B5B5]">
                    {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={fetchUsers}
                    disabled={isLoading}
                    className="p-1.5 text-[#B0B5B5] hover:text-[#0057BC] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {/* User List */}
                <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {isLoading ? (
                    <LoadingBlock text="Loading users..." size={24} row={false} className="py-8" />
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-8 text-center text-[#B0B5B5]">
                      No users found
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      // A div, not a button: the row now carries an Invite
                      // button of its own, and a button inside a button is
                      // invalid HTML - the browser closes the outer one early
                      // and the row stops being clickable below the split.
                      <div
                        key={user.id}
                        className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                          selectedUser?.id === user.id
                            ? "border-[#0057BC] bg-[#0057BC]/5"
                            : "border-slate-200 dark:border-slate-700 hover:border-[#0057BC]/50 hover:bg-slate-50 dark:hover:bg-slate-800"
                        } ${!user.isActive ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectUser(user)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate text-[#2D2A28] dark:text-white">
                                {user.displayName || user.email.split("@")[0]}
                              </span>
                              {/* Every row says its role, an ordinary User
                                  included. A shield for the admin and nothing
                                  for anybody else left the commonest role
                                  looking like a row that had not finished
                                  loading, and made "who can approve at IIR?"
                                  a question about a missing icon. */}
                              <RoleBadge role={user.role} />
                            </div>
                            <div className="text-xs text-[#B0B5B5] truncate">
                              {user.email}
                            </div>
                            {/* How much of the estate this account can reach,
                                without opening it. */}
                            <div className="text-xs text-[#B0B5B5] mt-0.5">
                              {countGrantedEntities(user.entityAccess) === 0
                                ? "No budget plan access"
                                : `Budget plan: ${countGrantedEntities(user.entityAccess)} of ${
                                    entities.length || countGrantedEntities(user.entityAccess)
                                  } entities`}
                            </div>
                          </button>
                          <div className="flex-shrink-0 flex items-center gap-1.5">
                            {user.isActive ? (
                              <span className="px-2 py-0.5 text-xs bg-[#0057BC]/10 text-[#0057BC] dark:text-[#00A3DE] rounded-full">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs bg-slate-200 text-slate-600 rounded-full">
                                Inactive
                              </span>
                            )}
                            {/* Offered on every active row, not only on new
                                ones: the commonest reason to press it is that
                                the first message was deleted or never arrived,
                                and nothing here records that one was sent. An
                                inactive profile has no access to invite anybody
                                to, so it is not offered for one. */}
                            {user.isActive && (
                              <button
                                type="button"
                                onClick={() => handleInvite(user)}
                                disabled={invitingId !== null}
                                title={`Email an invitation to ${user.email}`}
                                aria-label={`Email an invitation to ${user.email}`}
                                className="p-1.5 text-[#B0B5B5] hover:text-[#0057BC] hover:bg-[#0057BC]/10 rounded-md transition-colors disabled:opacity-40 disabled:hover:text-[#B0B5B5] disabled:hover:bg-transparent"
                              >
                                {invitingId === user.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Mail className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* **Ringi trial, said and switched on the row** (asked
                            2026-10-02) - the same write as the tick in the form,
                            through `savePreview`. Outside the row's select
                            button, which a button may not sit inside. Filled
                            when a member, outlined when not: one hue, two
                            weights (rule 33). An admin is a member by role, so
                            theirs is a statement, not a switch (rule 25). */}
                        {ringiPreview.enabled && (
                          <div className="mt-2">
                            {user.role === "admin" || isSuperAdmin(user.email) ? (
                              <span
                                title="Admins can always open Ringi application - no tick needed."
                                className={`inline-flex items-center gap-1 ${trialPillClass(true)}`}
                              >
                                <Check className="w-3 h-3" />
                                Ringi trial (admin)
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  savePreview(user.id, { profileId: user.id, member: !isRingiMember(user) })
                                }
                                disabled={previewBusy !== null}
                                aria-pressed={isRingiMember(user)}
                                title={
                                  isRingiMember(user)
                                    ? `Remove ${user.displayName || user.email} from the Ringi trial`
                                    : `Add ${user.displayName || user.email} to the Ringi trial`
                                }
                                className={`inline-flex items-center gap-1 transition-colors duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${trialPillClass(isRingiMember(user))}`}
                              >
                                {previewBusy === user.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : isRingiMember(user) ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Plus className="w-3 h-3" />
                                )}
                                {isRingiMember(user) ? "Ringi trial" : "Add to Ringi trial"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Right Panel - Edit Form */}
            <div className="lg:col-span-3 order-1 lg:order-2">
              <GlassCard className="p-6">
                {!selectedUser && !isCreating ? (
                  // Empty State
                  <div className="py-12 text-center">
                    <User className="w-16 h-16 mx-auto mb-4 text-[#B0B5B5]" />
                    <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white mb-2">
                      Select a User
                    </h3>
                    {/* No "Add New User" button here on purpose - the header's
                        "Add User" is the one way to create, and a second blue
                        button competes with the instruction above it. */}
                    <p className="text-[#B0B5B5]">
                      Choose a user from the list to edit their details
                    </p>
                  </div>
                ) : (
                  // Edit Form
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-[#2D2A28] dark:text-white">
                        {isCreating ? "Add New User" : "Edit User"}
                      </h2>
                      <button
                        onClick={handleCancel}
                        className="p-2 text-[#B0B5B5] hover:text-[#2D2A28] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* User Name - the whole identity in one control: the pick
                          carries the name, the email and the title together, so
                          none of the three can end up belonging to somebody
                          else. No separate email field: the control shows it. */}
                      <div>
                        <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1">
                          User Name <span className="text-red-500">*</span>
                        </label>
                        <UserSearchSelect
                          selectedUser={
                            formData.displayName
                              ? {
                                  id: "",
                                  displayName: formData.displayName,
                                  mail: formData.email || null,
                                  jobTitle: formData.jobTitle || null,
                                }
                              : null
                          }
                          onSelect={handlePickDirectoryUser}
                          getAccessToken={getGraphAccessToken}
                          disabled={!!(selectedUser && !canEdit(selectedUser))}
                          placeholder="Search Office 365 users..."
                        />
                        {!isCreating && selectedUser && isSuperAdmin(selectedUser.email) && (
                          <p className="mt-1 text-xs text-[#0057BC]">
                            Super admin account (cannot be modified by others)
                          </p>
                        )}
                      </div>

                      {/* Role */}
                      <div>
                        <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1">
                          Role
                        </label>
                        {/* Four roles: two by two on a phone, one row from `sm` -
                            and two by two again at `lg`, where the form shares
                            the row with the list: at 1024 a button gets 125px and
                            "CAPEX-Admin" needed 132 (measured 2026-10-02; it is the
                            shorter "IIR-Admin" since 2026-10-17). */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2">
                          {ROLE_OPTIONS.map(({ role, label, hint }) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setFormData({ ...formData, role })}
                              disabled={!!(selectedUser && !canEdit(selectedUser))}
                              title={hint}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 transition-colors ${
                                formData.role === role
                                  ? "border-[#0057BC] bg-[#0057BC]/10 text-[#0057BC]"
                                  : "border-slate-300 dark:border-slate-600 hover:border-[#0057BC]/50"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {role === "admin" ? (
                                <Shield className="w-4 h-4" />
                              ) : role === "faadmin" ? (
                                <ShieldCheck className="w-4 h-4" />
                              ) : role === "capexadmin" ? (
                                <ShieldPlus className="w-4 h-4" />
                              ) : (
                                <User className="w-4 h-4" />
                              )}
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* **Budget plan access, per entity.** Titled "Entity access"
                          until 2026-09-21, which named the axis and not the right:
                          it was read as governing the ringi too, and a V2 Edit was
                          expected to open the HOGV2x applications. It governs the
                          budget plan only (`lib/auth/entity-access.ts`), so the
                          heading says so, and the line under it says what it does
                          not do (rule 10). Not "Budget assignment" - that is
                          ringi Step 3, which this does not touch either. */}
                      <div>
                        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 mb-1">
                          <div className="min-w-0">
                            <label className="block text-sm font-medium text-[#2D2A28] dark:text-white">
                              Budget plan access (Schedule &amp; Amount), per entity
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Not the ringi - who may edit an application is set by its routes and
                              Admin &gt; Circulation Route.
                            </p>
                          </div>
                          {entities.length > 0 && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-[#B0B5B5] mr-1 whitespace-nowrap">Set all</span>
                              {ENTITY_ACCESS_LEVELS.map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  onClick={() => setAllEntityLevels(level)}
                                  disabled={!!(selectedUser && !canEdit(selectedUser))}
                                  className="px-2 py-0.5 text-xs rounded-full border border-slate-300 dark:border-slate-600 text-[#2D2A28] dark:text-white hover:border-[#0057BC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {ENTITY_ACCESS_LABELS[level]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {entities.length === 0 ? (
                          <p className="text-sm text-[#B0B5B5] py-3">
                            Could not load the entity list from Dataverse. Roles and status can
                            still be saved.
                          </p>
                        ) : (
                          <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                            {entities.map((entity) => {
                              const level = entityAccessLevel(formData.entityAccess, entity.name);
                              return (
                                <div
                                  key={entity.id || entity.name}
                                  className="flex items-center justify-between gap-3 px-3 py-2"
                                >
                                  <span className="text-sm font-medium text-[#2D2A28] dark:text-white truncate">
                                    {entity.name}
                                  </span>
                                  <div className="flex gap-1 shrink-0">
                                    {ENTITY_ACCESS_LEVELS.map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => setEntityLevel(entity.name, option)}
                                        disabled={!!(selectedUser && !canEdit(selectedUser))}
                                        aria-pressed={level === option}
                                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors duration-300 ease-in-out ${
                                          level === option
                                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                                            : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 hover:border-slate-900 dark:hover:border-slate-300"
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                      >
                                        {ENTITY_ACCESS_LABELS[option]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Said plainly, because a rights screen that is only
                            half wired is worse than one that says which half. */}
                        <p className="mt-2 text-xs text-[#B0B5B5]">
                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                            Edit is enforced; View is not yet.
                          </span>{" "}
                          Without Edit on an entity, this user cannot change its schedule
                          amounts, delete its rows, add it to a schedule, or set its IIR
                          mark - the server refuses each one. Reading is still open: they
                          can see every entity&apos;s figures on the summaries, in the PDF
                          and through the chatbot, whatever is set here. Admins are not
                          narrowed by any of it.
                        </p>
                      </div>

                      {/* **Ringi trial member** - only while the preview is on,
                          where it means something. Saved at once, like Account
                          Status below. An admin is a member by role, so there
                          is nothing to tick (rule 25). */}
                      {!isCreating && selectedUser && ringiPreview.enabled && (
                        <div>
                          <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1">
                            Ringi application (preview)
                          </label>
                          {selectedUser.role === "admin" || isSuperAdmin(selectedUser.email) ? (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              Admins can always open it - no tick needed.
                            </p>
                          ) : (
                            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                              <input
                                type="checkbox"
                                checked={isRingiMember(selectedUser)}
                                disabled={previewBusy !== null}
                                onChange={(event) =>
                                  savePreview(selectedUser.id, { profileId: selectedUser.id, member: event.target.checked })
                                }
                                className="w-4 h-4 accent-[#0057BC]"
                              />
                              <span className="text-sm text-[#2D2A28] dark:text-white">Ringi trial member</span>
                              <span className="text-xs text-[#B0B5B5] ml-auto">
                                {previewBusy === selectedUser.id ? "Saving..." : "Saved as soon as it is ticked"}
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Active Status (only for existing users) */}
                      {!isCreating && selectedUser && canEdit(selectedUser) && (
                        <div>
                          <label className="block text-sm font-medium text-[#2D2A28] dark:text-white mb-1">
                            Account Status
                          </label>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(selectedUser)}
                            className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-colors ${
                              selectedUser.isActive
                                ? "border-[#0057BC]/30 bg-[#0057BC]/5 dark:bg-[#00A3DE]/10"
                                : "border-slate-300 bg-slate-50 dark:bg-slate-800"
                            }`}
                          >
                            {selectedUser.isActive ? (
                              <>
                                <ToggleRight className="w-6 h-6 text-[#0057BC] dark:text-[#00A3DE]" />
                                <span className="text-[#0057BC] dark:text-[#00A3DE] font-medium">
                                  Active
                                </span>
                                <span className="text-sm text-[#B0B5B5] ml-auto">
                                  Click to deactivate
                                </span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-6 h-6 text-slate-400" />
                                <span className="text-slate-600 dark:text-slate-400 font-medium">
                                  Inactive
                                </span>
                                <span className="text-sm text-[#B0B5B5] ml-auto">
                                  Click to activate
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Last Login (read-only) */}
                      {!isCreating && selectedUser?.lastLoginAt && (
                        <div>
                          <label className="block text-sm font-medium text-[#B0B5B5] mb-1">
                            Last Login
                          </label>
                          <p className="text-sm text-[#2D2A28] dark:text-white">
                            {new Date(selectedUser.lastLoginAt).toLocaleString("en-US")}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                      {/* Delete sits apart from Cancel and Save, and only for a
                          profile that is not yours - the server refuses your own
                          either way, and a button that exists to be refused is
                          just a worse error message. */}
                      {!isCreating && selectedUser && canEdit(selectedUser) && (
                        <button
                          onClick={() => setUserToDelete(selectedUser)}
                          className="flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mr-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete profile
                        </button>
                      )}
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 text-[#B0B5B5] hover:text-[#2D2A28] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        // A registration needs both, and the directory pick
                        // supplies them together - so this only ever bites on
                        // the manual fallback.
                        disabled={
                          isSaving || (isCreating && (!formData.email || !formData.displayName))
                        }
                        className="flex items-center gap-2 px-6 py-2 bg-[#0057BC] text-white rounded-lg hover:bg-[#004494] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            {isCreating ? "Create User" : "Save Changes"}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      </main>

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
              ? "This address is on the super-admin list. If it is the address Dataverse holds for that account, a fresh profile is created the next time it signs in - with no entity access. If it is that person's second address - a sign-in ID beside their mailbox address - it will not come back. Either way, deleting clears a duplicate rather than revoking access; for that, use Account Status."
              : "The profile and its entity access are removed. Ringis and routes that name this person keep their own copy of the name and address, so nothing already circulated changes. To revoke access without losing the record, use Account Status instead."
          }
          isDeleting={isDeleting}
          onCancel={() => setUserToDelete(null)}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}
