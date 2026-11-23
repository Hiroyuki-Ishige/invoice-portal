"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";

const H2 = "text-lg font-semibold text-[#2D2A28] dark:text-white";
const P = "text-sm md:text-base text-slate-600 dark:text-slate-300";
const TH = "px-3 py-2 text-left font-semibold text-[#2D2A28] dark:text-white";
const TD = "px-3 py-2 align-top text-slate-600 dark:text-slate-300";
const ROW = "border-t border-slate-200 dark:border-slate-700";
const CODE = "rounded bg-[#0057BC]/10 px-1 py-0.5 text-[0.85em] dark:bg-[#00A3DE]/15";

/**
 * Admin > Admin Guide: how a person is given access. Static text - the same steps as
 * `docs/admin-manual.md`, kept short enough to read beside the screens it describes.
 * Admin only (the `admin-guide` row of Role Permissions).
 */
export default function AdminGuidePage() {
  const access = useAdminAccess("admin-guide");
  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-guide" />;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] text-sm md:text-base">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Admin Guide</h1>
            <p className="text-sm md:text-base text-[#B0B5B5] mt-1">How to add a user and set what they can do.</p>
          </div>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className={H2}>How access works: two places</h2>
            <p className={P}>
              A person needs <strong>both</strong>. Either one alone is not enough: the app calls Dataverse as the signed-in person, so an
              Admin in the app is still refused (403) if Dataverse does not let them write.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th className={TH}>Layer</th>
                    <th className={TH}>Decides</th>
                    <th className={TH}>Set in</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={ROW}>
                    <td className={TD}>Dataverse security role</td>
                    <td className={TD}>Whether they can read or write the tables</td>
                    <td className={TD}>Entra group (Power Platform admin center team)</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>App role</td>
                    <td className={TD}>What they can do in the app</td>
                    <td className={TD}>
                      <Link href="/admin/users" className="text-[#0057BC] dark:text-[#00A3DE] underline">
                        Admin &gt; User Management
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className={H2}>The Entra groups</h2>
            <p className={P}>
              Dataverse access is given by two Entra groups. Each is a Dataverse team (environment MD-MGD-env3-PAYG) that carries a security
              role plus <span className={CODE}>Basic User</span>. Add or remove people in the group; nothing needs changing in Dataverse.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className={TH}>Entra group</th>
                    <th className={TH}>Security role</th>
                    <th className={TH}>Put in it</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={ROW}>
                    <td className={TD}><span className={CODE}>Invoice Portal Editors</span></td>
                    <td className={TD}><span className={CODE}>Invoice Portal Editor</span> - read and write</td>
                    <td className={TD}>People whose app role is Admin or F&amp;A Admin</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}><span className={CODE}>Invoice Portal Readers</span></td>
                    <td className={TD}><span className={CODE}>Invoice Portal Reader</span> - read only</td>
                    <td className={TD}>People whose app role is User</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={P}>Never put one person in both groups: the rights add up and the read-only limit is lost.</p>
          </GlassCard>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className={H2}>Add a user</h2>
            <ol className={`${P} list-decimal pl-5 space-y-2`}>
              <li>
                <strong>Entra:</strong> open entra.microsoft.com &gt; Groups and add the person to <span className={CODE}>Invoice Portal Editors</span>{" "}
                (Admin or F&amp;A Admin) or <span className={CODE}>Invoice Portal Readers</span> (User). Editing a group needs the Groups Administrator
                role; ask IT if you do not have it.
              </li>
              <li>Wait a few minutes. The person appears in the Dataverse environment the first time they sign in.</li>
              <li>
                <strong>App:</strong> open{" "}
                <Link href="/admin/users" className="text-[#0057BC] dark:text-[#00A3DE] underline">
                  User Management
                </Link>
                , search the person in Invite New User, pick the role to match the group, and use Preview Invitation to see the mail. Then press Register &amp; Send
                Invitation (registers and mails), or Register (registers only; send the mail later with Send App Link on their row).
                If a mail fails, the person is still registered: use Send App Link.
              </li>
              <li>
                <strong>Companies (for a User):</strong> a User sees only the invoices of the companies ticked for them. Tick them when you
                register the person, or later with Companies on their row. Admin and F&amp;A Admin see every company. A User with none ticked
                sees no invoice.
              </li>
              <li>
                The invitation mail links to the sign-in (MFA) guide with pictures, in English and Japanese. You can open it yourself:{" "}
                <Link href="/guide/mfa" className="text-[#0057BC] dark:text-[#00A3DE] underline">
                  English
                </Link>{" "}
                |{" "}
                <Link href="/guide/mfa?lang=ja" className="text-[#0057BC] dark:text-[#00A3DE] underline">
                  日本語
                </Link>
                .
              </li>
              <li>Ask them to sign in (sign out and in again if the rights have not arrived). A User cannot save an invoice - a 403 there is correct.</li>
            </ol>
          </GlassCard>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className={H2}>Change, pause or remove a user</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <tbody>
                  <tr className={ROW}>
                    <td className={TD}>Change the role</td>
                    <td className={TD}>Pick the new role on their row in All Users, and move them to the other Entra group.</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>Pause</td>
                    <td className={TD}>Deactivate on their row (Activate brings them back).</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>Remove</td>
                    <td className={TD}>Delete on their row, and remove them from the Entra group.</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>Leaver</td>
                    <td className={TD}>Remove from the Entra group (this ends the Dataverse rights), then Deactivate or Delete in the app.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className={H2}>When it does not work</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className={TH}>What you see</th>
                    <th className={TH}>Check</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={ROW}>
                    <td className={TD}>Signs in, but no data</td>
                    <td className={TD}>Is the person in an Entra group, and do both teams carry Basic User and the Invoice Portal role?</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>403 naming a table</td>
                    <td className={TD}>The security role lacks that table&apos;s right. Check Invoice Portal Editor / Reader in the Power Platform admin center.</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>&quot;Not registered&quot;</td>
                    <td className={TD}>The person is not yet in User Management.</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>An Admin cannot save</td>
                    <td className={TD}>They are in Readers or in no group. Put them in Editors.</td>
                  </tr>
                  <tr className={ROW}>
                    <td className={TD}>Just added, still refused</td>
                    <td className={TD}>Wait a few minutes, then sign out and in again.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={P}>The full version is in the repository: docs/admin-manual.md.</p>
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
