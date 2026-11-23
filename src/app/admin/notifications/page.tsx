"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingBlock } from "@/components/ui/Loading";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import { RecipientPicker } from "@/components/admin/RecipientPicker";
import { customersFetcher } from "@/components/invoices/shared";
import type { Customer } from "@/lib/invoice/customer-record";

interface Draft {
  to: string[];
  cc: string[];
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Admin > Mail Notifications: for each company an invoice is addressed to, who is mailed (the
 * site's accounting) and who is copied when its invoices are issued.
 *
 * Open to Admin and F&A-Admin (the `admin-notifications` row of Role Permissions). The mail
 * itself is sent from the Invoices screens, by the person issuing, after they have seen the
 * recipients listed there.
 */
export default function AdminNotificationsPage() {
  const access = useAdminAccess("admin-notifications");
  const { data, error, isLoading, mutate } = useSWR(access === "allowed" ? "/api/customers" : null, customersFetcher, {
    revalidateOnFocus: false,
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-notifications" />;

  const customers = data?.customers ?? [];
  const draftOf = (c: Customer): Draft => drafts[c.id] ?? { to: c.notifyTo, cc: c.notifyCc };
  const dirty = (c: Customer): boolean => {
    const d = draftOf(c);
    return !same(d.to, c.notifyTo) || !same(d.cc, c.notifyCc);
  };

  async function save(c: Customer) {
    const d = draftOf(c);
    setBusyId(c.id);
    setSavedId(null);
    setErrors((e) => ({ ...e, [c.id]: "" }));
    try {
      const response = await fetch(`/api/admin/notifications/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: d.to, cc: d.cc }),
      });
      const detail = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors((e) => ({ ...e, [c.id]: detail.error || `Could not save (${response.status}).` }));
        return;
      }
      await mutate();
      setDrafts((all) => {
        const next = { ...all };
        delete next[c.id];
        return next;
      });
      setSavedId(c.id);
    } catch {
      setErrors((e) => ({ ...e, [c.id]: "Network error. Try again." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] text-sm md:text-base">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Mail Notifications</h1>
            <p className="text-sm md:text-base text-[#B0B5B5] mt-1">
              Who is told when an invoice is issued: each site&apos;s accounting (To) and who is copied (Cc). Search the Microsoft 365 users to add
              them, or type an address the directory does not list.
            </p>
          </div>

          {isLoading && <LoadingBlock text="Loading customers..." size={32} className="py-6" />}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error.message}
            </p>
          )}
          {!isLoading && !error && customers.length === 0 && (
            <GlassCard className="p-4 md:p-6 text-sm text-slate-600 dark:text-slate-300">
              No customers yet. Register them in{" "}
              <Link href="/admin/customers" className="text-[#0057BC] dark:text-[#00A3DE] underline">
                Admin &gt; Customers
              </Link>{" "}
              first.
            </GlassCard>
          )}

          {customers.map((c) => {
            const d = draftOf(c);
            const isDirty = dirty(c);
            return (
              <GlassCard key={c.id} className="p-4 md:p-6 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">
                    {c.code} <span className="font-normal text-slate-600 dark:text-slate-300">- {c.name}</span>
                  </h2>
                  {c.notifyTo.length === 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">No recipient yet - no mail is sent for this company.</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <RecipientPicker
                    label="To (the site's accounting)"
                    addresses={d.to}
                    onChange={(to) => setDrafts((all) => ({ ...all, [c.id]: { ...draftOf(c), to } }))}
                  />
                  <RecipientPicker
                    label="Cc"
                    addresses={d.cc}
                    onChange={(cc) => setDrafts((all) => ({ ...all, [c.id]: { ...draftOf(c), cc } }))}
                  />
                </div>
                {errors[c.id] && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {errors[c.id]}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!isDirty || busyId !== null}
                    onClick={() => save(c)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed ${PRIMARY_ACTION_FILL}`}
                  >
                    {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                  {savedId === c.id && !isDirty && (
                    <span className="inline-flex items-center gap-1 text-sm text-[#0057BC] dark:text-[#00A3DE]">
                      <Check className="w-4 h-4" /> Saved
                    </span>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </main>
    </div>
  );
}
