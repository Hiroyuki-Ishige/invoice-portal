"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Archive, Ban, ChevronDown, Download, FileSearch, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { mayCancelInvoices } from "@/lib/types/user-profile";
import { STATUS_LABELS, type SavedInvoice } from "@/lib/invoice/invoice-record";
import { formatAmount, localStamp } from "@/lib/utils/format";
import { renderPdf, saveBlob } from "@/lib/invoice/render-pdf";
import { FIELD, customersFetcher } from "./shared";
import { NotifyPanel, type NotifyItem } from "./NotifyPanel";

/** What the PDF prints when a saved invoice has no line to read the description from. */
const FALLBACK_DESCRIPTION = "Reimbursement for the expense";

interface InvoiceListResponse {
  invoices: SavedInvoice[];
  truncated: boolean;
  limit: number;
}

async function invoicesFetcher(url: string): Promise<InvoiceListResponse> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The invoices could not be read (${response.status}).`);
  return data;
}

/** The two lists, read apart so neither can crowd the other out of the newest-N cap. */
const ISSUED_KEY = "/api/invoices?status=issued";
const CANCELLED_KEY = "/api/invoices?status=cancelled";

/** Saved invoices: find one, download its PDF again, cancel it. Cancelled ones are put away in their own box below. */
export function SavedInvoices() {
  const { role, user } = useAuth();
  const canCancel = mayCancelInvoices(role, user?.email);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState<SavedInvoice | null>(null);
  const [reason, setReason] = useState("");
  /** Cancelling the ticked invoices together: the dialog is open, and how far the run has got. */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const { data, error, isLoading } = useSWR(ISSUED_KEY, invoicesFetcher, { revalidateOnFocus: false });
  const { data: cancelledData, error: cancelledError } = useSWR(CANCELLED_KEY, invoicesFetcher, { revalidateOnFocus: false });
  const { data: customerData } = useSWR("/api/customers", customersFetcher, { revalidateOnFocus: false });
  /** Invoices ticked for a completion notice, and what the notice panel was prepared with. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [notifyItems, setNotifyItems] = useState<NotifyItem[] | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = (i: SavedInvoice) =>
    !needle || i.number.toLowerCase().includes(needle) || i.customerName.toLowerCase().includes(needle) || i.customerCode.toLowerCase().includes(needle);
  const shown = (data?.invoices ?? []).filter(matches);
  const cancelledShown = (cancelledData?.invoices ?? []).filter(matches);

  const notifiable = shown.filter((i) => i.status === "issued");
  const allTicked = notifiable.length > 0 && notifiable.every((i) => selected.has(i.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Read each ticked invoice's line, so the mail can say what it was for and its PDF can be rebuilt. */
  async function prepareNotice() {
    const picked = (data?.invoices ?? []).filter((i) => selected.has(i.id) && i.status === "issued");
    if (picked.length === 0) return;
    setPreparing(true);
    setMessage("");
    try {
      const items = await Promise.all(
        picked.map(async (invoice): Promise<NotifyItem> => {
          const response = await fetch(`/api/invoices/${invoice.id}`);
          const detail = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(detail.error || `${invoice.number} could not be read.`);
          const description = (detail.lines?.[0]?.description as string | undefined) || FALLBACK_DESCRIPTION;
          return { invoice, description, fileName: `${invoice.number}.pdf`, makePdf: () => renderPdf(invoice, description) };
        })
      );
      // In the order of the numbers, the way the list reads from the bottom up.
      setNotifyItems(items.sort((a, b) => a.invoice.number.localeCompare(b.invoice.number)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The invoices could not be read.");
    } finally {
      setPreparing(false);
    }
  }

  /** `save` downloads the PDF; `preview` shows it in a new tab. */
  async function download(invoice: SavedInvoice, mode: "save" | "preview" = "save") {
    // The tab is opened now, inside the click, or the browser's pop-up blocker refuses it later.
    const tab = mode === "preview" ? window.open("", "_blank") : null;
    setBusyId(invoice.id);
    setMessage("");
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`);
      const detail = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail.error || "The invoice could not be read.");
      const description = (detail.lines?.[0]?.description as string | undefined) || FALLBACK_DESCRIPTION;
      const blob = await renderPdf(invoice, description);
      if (mode === "preview" && tab) {
        const url = URL.createObjectURL(blob);
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        saveBlob(blob, `${invoice.number}.pdf`);
      }
    } catch (e) {
      tab?.close();
      setMessage(e instanceof Error ? e.message : "The PDF could not be created.");
    } finally {
      setBusyId(null);
    }
  }

  /** The ticked invoices that can still be cancelled, in number order. */
  const pickedIssued = (data?.invoices ?? [])
    .filter((i) => selected.has(i.id) && i.status === "issued")
    .sort((a, b) => a.number.localeCompare(b.number));

  /**
   * Cancel every ticked invoice with the one reason, **one request each** (the same endpoint, the same checks and
   * the same "only an issued invoice" rule as a single cancel). A failure does not stop the rest; the ones that
   * failed stay ticked and are named, so the person can see what is left and try again.
   */
  async function confirmBulkCancel() {
    if (!reason.trim() || pickedIssued.length === 0) return;
    const targets = pickedIssued;
    setMessage("");
    setBulkProgress({ done: 0, total: targets.length });
    const failed: string[] = [];
    const cancelled = new Set<string>();
    for (const [index, invoice] of targets.entries()) {
      try {
        const response = await fetch(`/api/invoices/${invoice.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `status ${response.status}`);
        cancelled.add(invoice.id);
      } catch (e) {
        failed.push(`${invoice.number}: ${e instanceof Error ? e.message : "could not be cancelled"}`);
      }
      setBulkProgress({ done: index + 1, total: targets.length });
    }
    try {
      await Promise.all([mutate(ISSUED_KEY), mutate(CANCELLED_KEY)]);
    } finally {
      // Whatever the re-read did, the dialog must come back: it is locked while a run is in progress.
      setSelected((current) => new Set([...current].filter((id) => !cancelled.has(id))));
      if (cancelled.size > 0) setNotifyItems(null);
      setBulkProgress(null);
      setBulkOpen(false);
      setReason("");
      if (failed.length > 0) {
        setMessage(`${cancelled.size} cancelled, ${failed.length} could not be: ${failed.join("; ")}`);
      }
    }
  }

  async function confirmCancel() {
    if (!cancelling || !reason.trim()) return;
    setBusyId(cancelling.id);
    setMessage("");
    try {
      const response = await fetch(`/api/invoices/${cancelling.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The invoice could not be cancelled.");
      setCancelling(null);
      setReason("");
      // It leaves the issued list and joins the cancelled box.
      await Promise.all([mutate(ISSUED_KEY), mutate(CANCELLED_KEY)]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The invoice could not be cancelled.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GlassCard className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">Saved invoices</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={FIELD}
            placeholder="Search number or customer"
            aria-label="Search invoices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error.message}
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#0057BC]/30 dark:border-[#00A3DE]/40 bg-[#0057BC]/5 dark:bg-[#00A3DE]/10 px-3 py-2 text-sm">
          <span className="text-[#2D2A28] dark:text-white">{selected.size} selected</span>
          <button
            type="button"
            onClick={prepareNotice}
            disabled={preparing}
            className="inline-flex items-center gap-1.5 text-[#0057BC] dark:text-[#00A3DE] font-medium hover:underline disabled:opacity-50"
          >
            {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send completion notice
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => {
                setBulkOpen(true);
                setReason("");
                setMessage("");
              }}
              disabled={pickedIssued.length === 0}
              className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <Ban className="w-4 h-4" />
              Cancel selected
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setNotifyItems(null);
            }}
            className="ml-auto text-slate-500 dark:text-slate-400 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-2 w-8">
                {canCancel && <input
                  type="checkbox"
                  aria-label="Select every issued invoice shown"
                  className="w-4 h-4 accent-[#0057BC]"
                  checked={allTicked}
                  disabled={notifiable.length === 0}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      for (const i of notifiable) {
                        if (allTicked) next.delete(i.id);
                        else next.add(i.id);
                      }
                      return next;
                    })
                  }
                />}
              </th>
              <th className="py-2 pr-3 font-semibold">Number</th>
              <th className="py-2 pr-3 font-semibold">Title</th>
              <th className="py-2 pr-3 font-semibold">Customer</th>
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold whitespace-nowrap">Created</th>
              <th className="py-2 pr-3 font-semibold text-right">Amount (JPY)</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((invoice) => (
              <tr key={invoice.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                <td className="py-2 pr-2">
                  {canCancel && invoice.status === "issued" && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${invoice.number}`}
                      className="w-4 h-4 accent-[#0057BC]"
                      checked={selected.has(invoice.id)}
                      onChange={() => toggle(invoice.id)}
                    />
                  )}
                </td>
                <td className="py-2 pr-3 font-medium tabular-nums text-[#2D2A28] dark:text-white">{invoice.number}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{invoice.title}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{invoice.customerName}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{invoice.invoiceDate}</td>
                <td className="py-2 pr-3 tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300" title={invoice.createdBy ? `Created by ${invoice.createdBy}` : undefined}>
                  {localStamp(invoice.createdOn) || "-"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">¥{formatAmount(invoice.total, 0)}</td>
                <td className="py-2 pr-3" title={invoice.status === "cancelled" ? invoice.cancelReason : undefined}>
                  {/* Filled when it stands, outlined when it does not - one hue (rule 33). */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      invoice.status === "issued"
                        ? "bg-[#0057BC]/10 text-[#0057BC] border-[#0057BC]/30 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] dark:border-[#00A3DE]/40"
                        : "bg-white text-[#2D2A28] border-[#2D2A28]/40 dark:bg-transparent dark:text-slate-300 dark:border-slate-500"
                    }`}
                  >
                    {STATUS_LABELS[invoice.status]}
                  </span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => download(invoice, "preview")}
                    disabled={busyId === invoice.id}
                    className="inline-flex items-center gap-1 mr-3 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-50"
                  >
                    <FileSearch className="w-4 h-4" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => download(invoice)}
                    disabled={busyId === invoice.id}
                    className="inline-flex items-center gap-1 mr-3 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-50"
                  >
                    {busyId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    PDF
                  </button>
                  {canCancel && invoice.status === "issued" && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelling(invoice);
                        setReason("");
                        setMessage("");
                      }}
                      className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
                    >
                      <Ban className="w-4 h-4" />
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !error && shown.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-500 dark:text-slate-400">
                  {data?.invoices.length ? "No invoice matches the search." : "No invoice has been issued yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {notifyItems && (
        <NotifyPanel
          key={notifyItems.map((i) => i.invoice.id).join()}
          title="Send completion notice"
          items={notifyItems}
          customers={customerData?.customers ?? []}
          onClose={() => setNotifyItems(null)}
        />
      )}
      {data?.truncated && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing the newest {data.limit} issued invoices. Search by number or customer to find an older one.
        </p>
      )}

      {/* Cancelled invoices, put away: closed until asked for. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setShowCancelled((open) => !open)}
          aria-expanded={showCancelled}
          aria-controls="cancelled-invoices"
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[#2D2A28] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors duration-300 ease-in-out rounded-xl"
        >
          <Archive className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          Cancelled invoices
          <span className="rounded-full border border-[#2D2A28]/40 dark:border-slate-500 px-2 py-0.5 text-xs font-medium text-[#2D2A28] dark:text-slate-300">
            {cancelledData ? (needle ? `${cancelledShown.length} of ${cancelledData.invoices.length}` : cancelledData.invoices.length) : "..."}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`ml-auto w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-300 ease-in-out ${showCancelled ? "rotate-180" : ""}`}
          />
        </button>
        {showCancelled && (
          <div id="cancelled-invoices" className="px-4 pb-4 animate-[fadeIn_0.3s_ease-in-out]">
            {cancelledError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {cancelledError.message}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-3 font-semibold">Number</th>
                    <th className="py-2 pr-3 font-semibold">Title</th>
                    <th className="py-2 pr-3 font-semibold">Customer</th>
                    <th className="py-2 pr-3 font-semibold">Date</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Created</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Cancelled</th>
                    <th className="py-2 pr-3 font-semibold text-right">Amount (JPY)</th>
                    <th className="py-2 pr-3 font-semibold">Reason</th>
                    <th className="py-2 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cancelledShown.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                      <td className="py-2 pr-3 font-medium tabular-nums text-[#2D2A28] dark:text-white">{invoice.number}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{invoice.title}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{invoice.customerName}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{invoice.invoiceDate}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300" title={invoice.createdBy ? `Created by ${invoice.createdBy}` : undefined}>
                        {localStamp(invoice.createdOn) || "-"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">{localStamp(invoice.modifiedOn) || "-"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">¥{formatAmount(invoice.total, 0)}</td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 max-w-[16rem] break-words">{invoice.cancelReason || "-"}</td>
                      <td className="py-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => download(invoice, "preview")}
                          disabled={busyId === invoice.id}
                          className="inline-flex items-center gap-1 mr-3 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-50"
                        >
                          <FileSearch className="w-4 h-4" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => download(invoice)}
                          disabled={busyId === invoice.id}
                          className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-50"
                        >
                          {busyId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cancelledData && cancelledShown.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500 dark:text-slate-400">
                        {cancelledData.invoices.length ? "No cancelled invoice matches the search." : "No invoice has been cancelled."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {cancelledData?.truncated && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Showing the newest {cancelledData.limit} cancelled invoices.</p>
            )}
          </div>
        )}
      </div>

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.3s_ease-in-out] px-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cancel the selected invoices"
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-3 animate-[popIn_0.3s_ease-in-out]"
          >
            <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">
              Cancel {bulkProgress?.total ?? pickedIssued.length} {(bulkProgress?.total ?? pickedIssued.length) === 1 ? "invoice" : "invoices"}?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Each number stays on record as Cancelled and is not used again. One reason is recorded for all of them.
            </p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm tabular-nums text-slate-700 dark:text-slate-200 space-y-0.5">
              {pickedIssued.map((invoice) => (
                <li key={invoice.id}>
                  {invoice.number} <span className="text-slate-500 dark:text-slate-400">- {invoice.customerName}, ¥{formatAmount(invoice.total, 0)}</span>
                </li>
              ))}
            </ul>
            <textarea
              className={`${FIELD} w-full`}
              rows={3}
              maxLength={1000}
              aria-label="Reason for cancelling"
              autoFocus
              value={reason}
              disabled={bulkProgress !== null}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex items-center justify-end gap-3">
              {bulkProgress && (
                <span className="mr-auto text-sm text-slate-500 dark:text-slate-400">
                  Cancelling {bulkProgress.done} of {bulkProgress.total}...
                </span>
              )}
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                disabled={bulkProgress !== null}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50"
              >
                Keep invoices
              </button>
              <button
                type="button"
                onClick={confirmBulkCancel}
                disabled={!reason.trim() || pickedIssued.length === 0 || bulkProgress !== null}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                {bulkProgress && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel {bulkProgress?.total ?? pickedIssued.length} {(bulkProgress?.total ?? pickedIssued.length) === 1 ? "invoice" : "invoices"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.3s_ease-in-out] px-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3 animate-[popIn_0.3s_ease-in-out]">
            <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">Cancel {cancelling.number}?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              The number stays on record as Cancelled and is not used again. Enter the reason.
            </p>
            <textarea
              className={`${FIELD} w-full`}
              rows={3}
              maxLength={1000}
              aria-label="Reason for cancelling"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setCancelling(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600">
                Keep invoice
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={!reason.trim() || busyId === cancelling.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                {busyId === cancelling.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
