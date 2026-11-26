"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingBlock } from "@/components/ui/Loading";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { AdminScreenGate, useAdminAccess } from "@/components/admin/AdminScreenGate";
import {
  CUSTOMER_LIMITS,
  DEFAULT_PAYMENT_TERMS,
  MAX_ADDRESS_LINES,
  validateCustomerInput,
  TITLE_CHOICES,
  parseDefaultTitles,
  titleOrDefault,
  type DefaultTitles,
  type Customer,
} from "@/lib/invoice/customer-record";
import { STARTER_CUSTOMERS } from "@/lib/invoice/customers-seed";
import { customerFromPdfLines } from "@/lib/invoice/customer-from-pdf";
import { INVOICE_TYPES, INVOICE_TYPE_KEYS } from "@/lib/invoice/invoice-record";

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
  defaultTitles: DefaultTitles;
}

const blankDraft = (): Draft => ({
  id: null,
  code: "",
  name: "",
  lines: Array.from({ length: MAX_ADDRESS_LINES }, () => ""),
  tradingPartnerId: "",
  paymentTerms: DEFAULT_PAYMENT_TERMS,
  defaultTitles: parseDefaultTitles(null),
});

const draftOf = (c: Customer): Draft => ({
  id: c.id,
  code: c.code,
  name: c.name,
  lines: Array.from({ length: MAX_ADDRESS_LINES }, (_, i) => c.addressLines[i] ?? ""),
  tradingPartnerId: c.tradingPartnerId,
  paymentTerms: c.paymentTerms,
  defaultTitles: c.defaultTitles,
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
  /** What the form was filled from, and what to check - shown above the form, not as a refusal. */
  const [pdfNotes, setPdfNotes] = useState<string[]>([]);
  const [readingPdf, setReadingPdf] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);

  if (access !== "allowed") return <AdminScreenGate state={access} need="admin-customers" />;

  const customers = data?.customers ?? [];
  // The known customers not registered yet - by code, the way the Excel sheets name them.
  const registered = new Set(customers.map((c) => c.code.toLowerCase()));
  const missingStarters = STARTER_CUSTOMERS.filter((c) => !registered.has(c.code.toLowerCase()));

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
      defaultTitles: draft.defaultTitles,
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
      setPdfNotes([]);
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
      for (const customer of missingStarters) {
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

  /**
   * Fill the Add form from an issued invoice PDF (read in this browser only). Nothing is saved
   * until Save is pressed. A company already in the master - same Trading Partner ID or name -
   * opens its own row instead, because the code on the PDF is not always the "Claim to" label.
   */
  async function addFromPdf(file: File) {
    setReadingPdf(true);
    setNotice("");
    setFormError("");
    setPdfNotes([]);
    try {
      const { readPdfLines } = await import("@/lib/invoice/customer-from-pdf-browser");
      const result = customerFromPdfLines(await readPdfLines(file));
      if (!result.ok) {
        setNotice(`${file.name}: ${result.error}`);
        return;
      }
      const read = result.value;
      const source = read.invoiceNumber ?? file.name;
      const same = (a: string, b: string) => a.trim() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();
      const existing = customers.find(
        (c) => same(c.tradingPartnerId, read.customer.tradingPartnerId) || same(c.name, read.customer.name)
      );
      if (existing) {
        setDraft(draftOf(existing));
        const pdfTitle = read.invoiceType ? read.customer.defaultTitles[read.invoiceType] : null;
        setPdfNotes([
          `${source} is addressed to ${read.customer.name}, which is already registered as ${existing.code}. Its record is open below; nothing was changed.`,
          ...(read.invoiceType && pdfTitle !== existing.defaultTitles[read.invoiceType]
            ? [`The PDF is a ${pdfTitle}; the default title for ${INVOICE_TYPES[read.invoiceType].label} here is ${existing.defaultTitles[read.invoiceType]}.`]
            : []),
        ]);
        return;
      }
      setDraft({
        id: null,
        code: read.customer.code,
        name: read.customer.name,
        lines: Array.from({ length: MAX_ADDRESS_LINES }, (_, i) => read.customer.addressLines[i] ?? ""),
        tradingPartnerId: read.customer.tradingPartnerId,
        paymentTerms: read.customer.paymentTerms,
        defaultTitles: read.customer.defaultTitles,
      });
      setPdfNotes([
        `Filled in from ${source}. Check every field, then Save.`,
        `The code "${read.customer.code}" is taken from the Trading Partner ID. It must be the label in the Excel sheet's "Claim to" column, which can differ (HMSJ is HOMS-J there).`,
        ...(read.invoiceType
          ? [`Default title for ${INVOICE_TYPES[read.invoiceType].label}: ${read.customer.defaultTitles[read.invoiceType]}, as on the PDF. The other kind starts as INVOICE.`]
          : []),
        ...read.warnings,
      ]);
    } catch {
      setNotice(`${file.name} could not be read as a PDF.`);
    } finally {
      setReadingPdf(false);
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
              <div className="flex flex-wrap gap-2">
              <input
                ref={pdfInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void addFromPdf(file);
                }}
              />
              <button
                type="button"
                disabled={readingPdf || isLoading}
                onClick={() => pdfInput.current?.click()}
                title="Fill the form from an invoice or debit note already issued to the company. The file is read in this browser and not uploaded."
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#0057BC] text-[#0057BC] dark:border-[#00A3DE] dark:text-[#00A3DE] hover:bg-[#0057BC]/10 transition-colors duration-300 ease-in-out disabled:opacity-40"
              >
                {readingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} Add from invoice PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(blankDraft());
                  setPdfNotes([]);
                  setFormError("");
                  setNotice("");
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-300 ease-in-out ${PRIMARY_ACTION_FILL}`}
              >
                <Plus className="w-4 h-4" /> Add customer
              </button>
              </div>
            )}
          </div>

          {notice && <p className="text-sm text-[#2D2A28] dark:text-white">{notice}</p>}

          {draft && (
            <GlassCard className="p-4 md:p-6 space-y-4">
              <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">
                {draft.id ? `Edit ${draft.code}` : "Add customer"}
              </h2>
              {pdfNotes.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-[#0057BC]/30 bg-[#0057BC]/10 dark:border-[#00A3DE]/40 dark:bg-[#00A3DE]/15 px-3 py-2 text-sm text-[#2D2A28] dark:text-white list-disc pl-7">
                  {pdfNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
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
              <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 md:p-4">
                <legend className="px-1 text-sm font-semibold text-[#2D2A28] dark:text-white">Default title</legend>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  What the title is set to for this customer when each kind of invoice is prepared. It can still be changed per document.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  {INVOICE_TYPE_KEYS.map((type) => (
                    <label key={type} className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                      {INVOICE_TYPES[type].label}
                      <select
                        className={FIELD}
                        value={draft.defaultTitles[type]}
                        onChange={(e) => set({ defaultTitles: { ...draft.defaultTitles, [type]: titleOrDefault(e.target.value) } })}
                      >
                        {TITLE_CHOICES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
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
                  onClick={() => {
                    setDraft(null);
                    setPdfNotes([]);
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-medium border border-[#B0B5B5]/50 text-[#2D2A28] dark:text-white hover:border-[#0057BC]/50 transition-colors duration-300 ease-in-out"
                >
                  Cancel
                </button>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4 md:p-6">
            {isLoading ? (
              <LoadingBlock text="Loading customers..." size={32} className="py-6" />
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
                  Add the {missingStarters.length} known customers ({missingStarters.map((c) => c.code).join(", ")})
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {missingStarters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span>Known customers not registered yet: {missingStarters.map((c) => c.code).join(", ")}.</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={addStarter}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-300 ease-in-out disabled:opacity-40 ${PRIMARY_ACTION_FILL}`}
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Add them
                    </button>
                  </div>
                )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 pr-3 font-semibold">Code</th>
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">Trading Partner ID</th>
                      {INVOICE_TYPE_KEYS.map((type) => (
                        <th key={type} className="py-2 pr-3 font-semibold whitespace-nowrap">
                          Title: {INVOICE_TYPES[type].label}
                        </th>
                      ))}
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
                        {INVOICE_TYPE_KEYS.map((type) => (
                          <td key={type} className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {c.defaultTitles[type]}
                          </td>
                        ))}
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`Edit ${c.code}`}
                            onClick={() => {
                              setDraft(draftOf(c));
                              setPdfNotes([]);
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
