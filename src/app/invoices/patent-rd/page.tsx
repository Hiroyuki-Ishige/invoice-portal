"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Download, Loader2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { InvoiceTabs } from "@/components/invoices/InvoiceTabs";
import { ExcelDropZone } from "@/components/invoices/ExcelDropZone";
import { NotifyPanel, type NotifyItem } from "@/components/invoices/NotifyPanel";
import { SavedInvoices } from "@/components/invoices/SavedInvoices";
import { SheetWarnings } from "@/components/invoices/SheetWarnings";
import { useOpenWorkbook } from "@/components/invoices/WorkbookPassword";
import { FIELD, customersFetcher, type Built } from "@/components/invoices/shared";
import type { Customer } from "@/lib/invoice/customer-record";
import type { SavedInvoice } from "@/lib/invoice/invoice-record";
import { formatAmount } from "@/lib/utils/format";
import { PATENT_RD_KINDS, PATENT_SHEET_NAME, RD_SHEET_NAME, parsePatentRdWorkbook, type ParsedPatentRd } from "@/lib/invoice/patent-sheet";
import { SheetReadError } from "@/lib/invoice/xlsx-sheet";
import { formatMonthLabel, lastDayOfMonth, parseDateInput, toDateInput } from "@/lib/invoice/dates";
import { renderPdf } from "@/lib/invoice/render-pdf";
import type { DocumentTitle } from "@/lib/invoice/build-pdf";

const TITLES: DocumentTitle[] = ["INVOICE", "DEBIT NOTE"];

/**
 * Upload the monthly Patent & R&D workbook, choose INVOICE / DEBIT NOTE per document, and get
 * one PDF each - R&D and Patent, each with its New Business part.
 *
 * Same flow as the expense invoices (`/invoices`): issuing saves the invoice in Dataverse and
 * takes the next number automatically; the PDF is made from what was saved. A company can be
 * charged twice in a month (HOGV: patent and patent for new business), so everything here is
 * keyed by the row, never by the company code.
 */
export default function Page() {
  const { openWorkbook, passwordDialog } = useOpenWorkbook();
  const { data: customerData, error: customerError } = useSWR("/api/customers", customersFetcher, {
    revalidateOnFocus: false,
  });
  const customerByCode = new Map((customerData?.customers ?? []).map((c) => [c.code.toLowerCase(), c]));
  const [fileName, setFileName] = useState("");
  const [claim, setClaim] = useState<ParsedPatentRd | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dateText, setDateText] = useState("");
  const [titles, setTitles] = useState<Record<number, DocumentTitle>>({});
  const [building, setBuilding] = useState(false);
  const [issueFailures, setIssueFailures] = useState<string[]>([]);
  const [numbers, setNumbers] = useState<Record<number, string>>({});
  const [built, setBuilt] = useState<Record<number, Built>>({});
  /** What was just issued, for the notification mails. */
  const [notifyItems, setNotifyItems] = useState<NotifyItem[]>([]);

  // Object URLs hold the file in memory until they are let go.
  const builtRef = useRef(built);
  useEffect(() => {
    builtRef.current = built;
  }, [built]);
  useEffect(() => () => Object.values(builtRef.current).forEach((b) => URL.revokeObjectURL(b.url)), []);

  function clearBuilt() {
    Object.values(builtRef.current).forEach((b) => URL.revokeObjectURL(b.url));
    setBuilt({});
    setNumbers({});
    setNotifyItems([]);
  }

  async function onFile(file: File) {
    setError("");
    setClaim(null);
    clearBuilt();
    setFileName(file.name);
    setReading(true);
    try {
      const parsed = await parsePatentRdWorkbook(await openWorkbook(file));
      setClaim(parsed);
      setDateText(toDateInput(lastDayOfMonth(parsed.claimMonth)));
      setTitles({});
    } catch (e) {
      setError(e instanceof SheetReadError ? e.message : "Something went wrong while reading the file.");
    } finally {
      setReading(false);
    }
  }

  const date = parseDateInput(dateText);

  const rows = (claim?.lines ?? []).map((line, index) => ({ line, index, customer: customerByCode.get(line.claimTo.toLowerCase()) }));
  const creatable = rows.filter((r) => r.customer);
  // What was chosen on this screen, else the customer's default (Admin > Customers).
  const titleOf = (row: { index: number; customer?: Customer }): DocumentTitle =>
    titles[row.index] || row.customer?.defaultTitles["patent-rd"] || "INVOICE";
  const canBuild = !!claim && !!date && creatable.length > 0 && !building;
  const sum = claim ? claim.lines.reduce((a, l) => a + l.amount, 0) : 0;
  const mismatches = (claim?.checks ?? []).filter((c) => c.sum !== c.sheetTotal);

  async function build() {
    if (!claim || !date) return;
    setBuilding(true);
    setError("");
    setIssueFailures([]);
    clearBuilt();
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceDate: dateText,
          monthLabel: formatMonthLabel(claim.claimMonth),
          items: creatable.map(({ line, index, customer }) => ({
            claimTo: line.claimTo,
            title: titleOf({ index, customer }),
            description: line.description,
            amount: line.amount,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        setError(data.error || "The invoices could not be issued.");
        return;
      }
      const issued = (data.invoices ?? []) as SavedInvoice[];
      const itemIndexes = (data.itemIndexes ?? []) as number[];
      setIssueFailures(
        ((data.failed ?? []) as Array<{ claimTo: string; index: number; error: string }>).map((f) => {
          const row = creatable[f.index];
          return `${f.claimTo} (${row ? PATENT_RD_KINDS[row.line.kind].label : "?"}): ${f.error}`;
        })
      );

      const nextBuilt: Record<number, Built> = {};
      const nextNumbers: Record<number, string> = {};
      const nextNotify: NotifyItem[] = [];
      for (const [n, invoice] of issued.entries()) {
        const row = creatable[itemIndexes[n]];
        if (!row) continue;
        const blob = await renderPdf(invoice, row.line.description);
        nextBuilt[row.index] = { url: URL.createObjectURL(blob), fileName: `${invoice.number}.pdf` };
        nextNumbers[row.index] = invoice.number;
        nextNotify.push({ invoice, description: row.line.description, fileUrl: nextBuilt[row.index].url, fileName: `${invoice.number}.pdf` });
      }
      setBuilt(nextBuilt);
      setNumbers(nextNumbers);
      setNotifyItems(nextNotify);
      await mutate("/api/invoices?status=");
    } catch {
      setError("Something went wrong while issuing the invoices. Check the list below before trying again.");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      {passwordDialog}
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          <InvoiceTabs />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Patent &amp; R&amp;D invoices</h1>
            <p className="text-sm md:text-base text-[#B0B5B5] mt-1">
              Upload the monthly Patent &amp; R&amp;D Excel file to create invoices (PDF).
            </p>
          </div>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">1. Upload the Excel file</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose the .xlsm / .xlsx of 特許・研究費用計算. The sheets that are read are {RD_SHEET_NAME} and {PATENT_SHEET_NAME}.
            </p>
            <ExcelDropZone id="patent-rd-file" fileName={fileName} reading={reading} onFile={onFile} />
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {customerError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                The customer list could not be loaded: {customerError.message}
              </p>
            )}
          </GlassCard>

          {claim && (
            <>
              <GlassCard className="p-4 md:p-6 space-y-4">
                <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">2. Review</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                    Invoice date (Claim month: {formatMonthLabel(claim.claimMonth)})
                    <input
                      type="date"
                      className={FIELD}
                      value={dateText}
                      onChange={(e) => {
                        setDateText(e.target.value);
                        clearBuilt();
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Numbers are assigned automatically when the invoices are issued (HYM1AC{"{fiscal year}"}-{"{number}"}). Issuing saves them.
                </p>

                <SheetWarnings warnings={claim.warnings} />

                {claim.lines.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">Nothing to claim this month (every amount is 0).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 pr-3 font-semibold">Fee</th>
                          <th className="py-2 pr-3 font-semibold">Claim to</th>
                          <th className="py-2 pr-3 font-semibold">Customer</th>
                          <th className="py-2 pr-3 font-semibold text-right">Amount (JPY)</th>
                          <th className="py-2 pr-3 font-semibold">Title</th>
                          <th className="py-2 pr-3 font-semibold">Number</th>
                          <th className="py-2 font-semibold">PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ line, index, customer }) => (
                          <tr key={index} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                            <td className="py-2 pr-3 text-slate-700 dark:text-slate-200" title={line.description}>
                              {PATENT_RD_KINDS[line.kind].label}
                            </td>
                            <td className="py-2 pr-3 font-medium text-[#2D2A28] dark:text-white">{line.claimTo}</td>
                            <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
                              {customer ? (
                                customer.name
                              ) : !customerData ? (
                                // Not yet loaded, or could not be: neither is "not registered" (rule 6).
                                <span className="text-slate-500 dark:text-slate-400">
                                  {customerError ? "Customer list unavailable" : "Loading customers..."}
                                </span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400">
                                  No customer registered with this code.{" "}
                                  <Link href="/admin/customers" className="underline">
                                    Register it in Admin &gt; Customers
                                  </Link>
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">¥{formatAmount(line.amount, 0)}</td>
                            <td className="py-2 pr-3">
                              {customer && (
                                <select
                                  className={FIELD}
                                  aria-label={`Title for ${line.claimTo} (${PATENT_RD_KINDS[line.kind].label})`}
                                  value={titleOf({ index, customer })}
                                  onChange={(e) => {
                                    setTitles((t) => ({ ...t, [index]: e.target.value as DocumentTitle }));
                                    clearBuilt();
                                  }}
                                >
                                  {TITLES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">{numbers[index] ?? ""}</td>
                            <td className="py-2">
                              {built[index] && (
                                <a
                                  href={built[index].url}
                                  download={built[index].fileName}
                                  className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE] hover:underline"
                                >
                                  <Download className="w-4 h-4" />
                                  Save
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="pt-3 font-semibold text-[#2D2A28] dark:text-white" colSpan={3}>
                            Total
                          </td>
                          <td className="pt-3 text-right font-semibold tabular-nums text-[#2D2A28] dark:text-white">
                            ¥{formatAmount(sum, 0)}
                          </td>
                          <td colSpan={3} className="pt-3 pl-3 text-xs text-slate-500 dark:text-slate-400">
                            {claim.checks.length === 0
                              ? "The Excel has no totals to cross-check."
                              : mismatches.length === 0
                                ? "The patent totals match the Excel."
                                : mismatches
                                    .map(
                                      (c) =>
                                        `${PATENT_RD_KINDS[c.kind].label}: the rows add up to ¥${formatAmount(c.sum, 0)} but the Excel total is ¥${formatAmount(c.sheetTotal, 0)}.`
                                    )
                                    .join(" ")}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </GlassCard>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canBuild}
                  onClick={build}
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed ${PRIMARY_ACTION_FILL}`}
                >
                  {building && <Loader2 className="w-4 h-4 animate-spin" />}
                  {building ? "Issuing..." : "Issue invoices"}
                </button>
                {issueFailures.length > 0 && (
                  <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
                    Some could not be saved: {issueFailures.join("; ")}. Check the list below before issuing them again.
                  </p>
                )}
                {!canBuild && !building && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {!date
                      ? "Enter the invoice date."
                      : "No row has a registered customer."}
                  </span>
                )}
              </div>
            </>
          )}

          {notifyItems.length > 0 && (
            <NotifyPanel key={notifyItems.map((i) => i.invoice.id).join()} items={notifyItems} customers={customerData?.customers ?? []} />
          )}

          <SavedInvoices />
        </div>
      </main>
    </div>
  );
}
