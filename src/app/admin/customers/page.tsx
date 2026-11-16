"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import {
  CUSTOMER_LIMITS,
  DEFAULT_PAYMENT_TERMS,
  MAX_ADDRESS_LINES,
  validateCustomerInput,
  type Customer,
} from "@/lib/invoice/customer-record";
import { STARTER_CUSTOMERS } from "@/lib/invoice/customers-seed";

/** The message the route sent, so a refusal reads as what it was and not as "failed". */
async function fetcher(url: string): Promise<{ customers: Customer[] }> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The customers could not be read (${response.status}).`);
  return data;
}

const FIELD =
  "w-full rounded-md border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm";

interface Draft {
  id: string | null;
  code: string;
  name: string;
  lines: string[];
  tradingPartnerId: string;
  paymentTerms: string;
}

const blankDraft = (): Draft => ({
  id: null,
  code: "",
  name: "",
  lines: Array.from({ length: MAX_ADDRESS_LINES }, () => ""),
  tradingPartnerId: "",
  paymentTerms: DEFAULT_PAYMENT_TERMS,
});

const draftOf = (c: Customer): Draft => ({
  id: c.id,
  code: c.code,
  name: c.name,
  lines: Array.from({ length: MAX_ADDRESS_LINES }, (_, i) => c.addressLines[i] ?? ""),
  tradingPartnerId: c.tradingPartnerId,
  paymentTerms: c.paymentTerms,
});

/**
 * Admin > Customers: the companies an invoice is addressed to.
 *
 * The **code** is what ties a row to the claim sheet - it must be the label in the sheet's
 * "Claim to" column (`HLAM`, `HOMS-J`...) - so it is the one thing that cannot repeat.
 */
export default function AdminCustomersPage() {
  const access = useAdminAccess("admin-customers");
  const { data, error, isLoading, mutate } = useSWR(access === "allowed" ? "/api/customers" : null, fetcher, {
    revalidateOnFocus: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [notice, setNotice] = useState("");

  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-customers" />;

  const customers = data?.customers ?? [];

  async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.ok) return null;
    const detail = await response.json().catch(() => ({}));
    return detail.error || `The request failed (${response.status}).`;
  }

  async function save() {
    if (!draft) return;
    const input = {
      code: draft.code,
      name: draft.name,
      addressLines: draft.lines,
      tradingPartnerId: draft.tradingPartnerId,
      paymentTerms: draft.paymentTerms,
    };
    const checked = validateCustomerInput(input);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const problem = draft.id
        ? await send(`/api/admin/customers/${draft.id}`, "PATCH", checked.value)
        : await send("/api/admin/customers", "POST", checked.value);
      if (problem) {
        setFormError(problem);
        return;
      }
      setDraft(null);
      setNotice(`${checked.value.code} saved.`);
      await mutate();
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      const problem = await send(`/api/admin/customers/${toDelete.id}`, "DELETE");
      setToDelete(null);
      setNotice(problem ?? `${toDelete.code} deleted.`);
      await mutate();
    } catch {
      setNotice("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addStarter() {
    setBusy(true);
    setNotice("");
    try {
      for (const customer of STARTER_CUSTOMERS) {
        const problem = await send("/api/admin/customers", "POST", customer);
        if (problem) {
          setNotice(`${customer.code}: ${problem}`);
          break;
        }
      }
      await mutate();
    } catch {
      setNotice("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          <Link href="/admin" className="inline-flex items-center gap-2 text-[#B0B5B5] hover:text-[#0057BC] text-sm md:text-base">
            <ArrowLeft className="w-4 h-4" /> Admin Tools
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Customers</h1>
              <p className="text-sm md:text-base text-[#B0B5B5] mt-1">
                The companies invoices are addressed to. The code must match the &quot;Claim to&quot; label in the Excel sheet.
              </p>
            </div>
            {!draft && (
              <button
                type="button"
                onClick={() => {
                  setDraft(blankDraft());
                  setFormError("");
                  setNotice("");
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ease-in-out ${PRIMARY_ACTION_FILL}`}
              >
                <Plus className="w-4 h-4" /> Add customer
              </button>
            )}
          </div>

          {notice && <p className="text-sm text-[#2D2A28] dark:text-white">{notice}</p>}

          {draft && (
            <GlassCard className="p-4 md:p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">
                {draft.id ? `Edit ${draft.code}` : "Add customer"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                  Code (the sheet&apos;s &quot;Claim to&quot;)
                  <input className={FIELD} maxLength={CUSTOMER_LIMITS.code} value={draft.code} onChange={(e) => set({ code: e.target.value })} placeholder="HOMS-J" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                  Trading Partner ID
                  <input
                    className={FIELD}
                    maxLength={CUSTOMER_LIMITS.tradingPartnerId}
                    value={draft.tradingPartnerId}
                    onChange={(e) => set({ tradingPartnerId: e.target.value })}
                    placeholder="HMSJ(ex-CG12)"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
                  Name (printed after &quot;To:&quot;)
                  <input className={FIELD} maxLength={CUSTOMER_LIMITS.name} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
                </label>
                {draft.lines.map((line, i) => (
                  <label key={i} className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
                    Address line {i + 1}
                    <input
                      className={FIELD}
                      maxLength={CUSTOMER_LIMITS.addressLine}
                      value={line}
                      onChange={(e) => set({ lines: draft.lines.map((l, j) => (j === i ? e.target.value : l)) })}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                  Payment terms
                  <input className={FIELD} maxLength={CUSTOMER_LIMITS.paymentTerms} value={draft.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
                </label>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={save}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors duration-300 ease-in-out disabled:opacity-40 ${PRIMARY_ACTION_FILL}`}
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                  className="px-5 py-2 rounded-lg text-sm font-medium border border-[#B0B5B5]/50 text-[#2D2A28] dark:text-white hover:border-[#0057BC]/50 transition-colors duration-300 ease-in-out"
                >
                  Cancel
                </button>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4 md:p-6">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : error ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {error.message}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  If the table does not exist yet, create it in{" "}
                  <Link href="/admin/setup" className="text-[#0057BC] dark:text-[#00A3DE] hover:underline">
                    Admin &gt; Setup
                  </Link>
                  .
                </p>
              </div>
            ) : customers.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">No customers registered yet.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={addStarter}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ease-in-out disabled:opacity-40 ${PRIMARY_ACTION_FILL}`}
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add the {STARTER_CUSTOMERS.length} known customers ({STARTER_CUSTOMERS.map((c) => c.code).join(", ")})
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 pr-3 font-semibold">Code</th>
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">Trading Partner ID</th>
                      <th className="py-2 font-semibold text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-3 font-medium text-[#2D2A28] dark:text-white">{c.code}</td>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{c.name}</td>
                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{c.tradingPartnerId}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`Edit ${c.code}`}
                            onClick={() => {
                              setDraft(draftOf(c));
                              setFormError("");
                              setNotice("");
                            }}
                            className="p-1.5 text-slate-500 hover:text-[#0057BC] dark:hover:text-[#00A3DE]"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${c.code}`}
                            onClick={() => setToDelete(c)}
                            className="p-1.5 text-slate-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      </main>

      {toDelete && (
        <ConfirmDeleteModal
          title="Delete this customer?"
          recordName={toDelete.code}
          recordSubtitle={toDelete.name}
          warning="Invoices already issued are not changed, but the claim sheet will report this code as having no customer."
          isDeleting={busy}
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
