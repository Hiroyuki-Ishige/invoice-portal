"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, Loader2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";

/**
 * Setup (prototype): the User Profile table is the only table this app needs
 * to sign anybody in. Invoice tables are added here as they are designed -
 * tables come only from Admin > Setup (CLAUDE.md).
 */
interface TableStatus { exists: boolean; tableName: string }

export default function AdminSetupPage() {
  const access = useAdminAccess("admin-setup");
  const [status, setStatus] = useState<TableStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/setup/userprofile-table");
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Could not check the table."); return; }
      setStatus(data);
    } catch {
      setMessage("Network error. Could not check the table.");
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-setup" />;

  const create = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/setup/userprofile-table", { method: "POST" });
      const data = await response.json();
      setMessage(response.ok ? data.message || "Done." : data.error || "Failed.");
      await check();
    } catch {
      setMessage("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-8 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/admin" className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] mb-4 text-sm md:text-base">
            <ArrowLeft className="w-4 h-4" /> Admin Tools
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white mb-4">Setup</h1>
          <GlassCard className="p-5">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-[#0057BC] dark:text-[#00A3DE]" />
              <div className="flex-1">
                <p className="font-semibold text-[#2D2A28] dark:text-white">User Profile table</p>
                <p className="text-sm text-[#B0B5B5]">
                  {status === null ? "Checking..." : status.exists ? `${status.tableName} exists` : `${status.tableName} does not exist yet`}
                </p>
              </div>
              <button
                onClick={create}
                disabled={busy || status === null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0057BC] text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {status?.exists ? "Top up columns" : "Create table"}
              </button>
            </div>
            {message && <p className="mt-3 text-sm text-[#2D2A28] dark:text-white">{message}</p>}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
