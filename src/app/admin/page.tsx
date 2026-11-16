"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import { ADMIN_DESTINATIONS } from "@/components/admin/destinations";

/** Admin Tools index - Admin only; every admin screen, from the one list. */
export default function AdminPage() {
  const access = useAdminAccess("admin");
  if (access !== "allowed") return <AdminScreenGate state={access} need="admin" />;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-8 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] mb-4 text-sm md:text-base">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white mb-4">Admin Tools</h1>
          <ul className="space-y-2">
            {ADMIN_DESTINATIONS.map(({ href, label, description }) => (
              <li key={href}>
                <Link href={href} className="block rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-[#0057BC]">
                  <span className="font-semibold text-[#2D2A28] dark:text-white">{label}</span>
                  <span className="block text-sm text-[#B0B5B5]">{description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
