"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Download, FileSearch, Loader2 } from "lucide-react";
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
import { ClaimSheetError, parseClaimSheet, type ParsedClaim } from "@/lib/invoice/claim-sheet";
import { formatMonthLabel, lastDayOfMonth, parseDateInput, toDateInput } from "@/lib/invoice/dates";
import { openPdfInTab, renderDraftPdf, renderPdf } from "@/lib/invoice/render-pdf";
import type { DocumentTitle } from "@/lib/invoice/build-pdf";

const TITLES: DocumentTitle[] = ["INVOICE", "DEBIT NOTE"];
const DESCRIPTION = "Reimbursement for the expense";


/**
 * Upload the monthly claim sheet, choose INVOICE / DEBIT NOTE per company, and get one PDF each.
 *
 * **Issuing saves the invoice** (header and line, in Dataverse) and takes the next number
 * automatically; the PDF is made from what was saved. Saved invoices are listed below and can
 * be downloaded again or cancelled (the number stays, marked Cancelled).
 */
export default function Page() {
  const { openWorkbook, passwordDialog } = useOpenWorkbook();
  const { data: customerData, error: customerError } = useSWR("/api/customers", customersFetcher, {
    revalidateOnFocus: false,
  });
  const customerByCode = new Map((customerData?.customers ?? []).map((c) => [c.code.toLowerCase(), c]));
  const [fileName, setFileName] = useState("");
  const [claim, setClaim] = useState<ParsedClaim | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dateText, setDateText] = useState("");
  const [titles, setTitles] = useState<Record<string, DocumentTitle>>({});
  const [building, setBuilding] = useState(false);
  const [issueFailures, setIssueFailures] = useState<string[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [built, setBuilt] = useState<Record<string, Built>>({});
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
      const parsed = await parseClaimSheet(await openWorkbook(file));
      setClaim(parsed);
      setDateText(toDateInput(lastDayOfMonth(parsed.claimMonth)));
      setTitles({});
    } catch (e) {
      setError(e instanceof ClaimSheetError ? e.message : "Something went wrong while reading the file.");
    } finally {
      setReading(false);
    }
  }

  const date = parseDateInput(dateText);

  const rows = (claim?.lines ?? []).map((line) => ({ line, customer: customerByCode.get(line.claimTo.toLowerCase()) }));
  const creatable = rows.filter((r) => r.customer);
  // What was chosen on this screen, else the customer's default (Admin > Customers).
  const titleOf = (row: { line: { claimTo: string }; customer?: Customer }): DocumentTitle =>
    titles[row.line.claimTo] || row.customer?.defaultTitles.expense || "INVOICE";
  const canBuild = !!claim && !!date && creatable.length > 0 && !building;
  const sum = claim ? claim.lines.reduce((a, l) => a + l.amount, 0) : 0;

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
          items: creatable.map(({ line, customer }) => ({
            claimTo: line.claimTo,
            title: titleOf({ line, customer }),
            description: DESCRIPTION,
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
      setIssueFailures(((data.failed ?? []) as Array<{ claimTo: string; error: string }>).map((f) => `${f.claimTo}: ${f.error}`));

      const next: Record<string, Built> = {};
      for (const invoice of issued) {
        const blob = await renderPdf(invoice, DESCRIPTION);
        next[invoice.customerCode.toLowerCase()] = { url: URL.createObjectURL(blob), fileName: `${invoice.number}.pdf` };
      }
      setBuilt(next);
      setNotifyItems(
        issued.map((invoice) => {
          const file = next[invoice.customerCode.toLowerCase()];
          return { invoice, description: DESCRIPTION, fileUrl: file?.url, fileName: file?.fileName };
        })
      );
      setNumbers(Object.fromEntries(issued.map((i) => [i.customerCode.toLowerCase(), i.number])));
      await mutate("/api/invoices?status=");
    } catch {
      setError("Something went wrong while issuing the invoices. Check the list below before trying again.");
    } finally {
      setBuilding(false);
    }
  }

  /** Preview one row: the issued document once there is one, otherwise a draft (no number taken). */
  async function preview({ line, customer }: { line: { claimTo: string; amount: number }; customer?: Customer }) {
    if (!claim || !date || !customer) return;
    setError("");
    const issued = built[line.claimTo.toLowerCase()];
    if (issued) {
      // Already issued: show that document, with its number, not a draft.
      window.open(issued.url, "_blank");
      return;
    }
    try {
      await openPdfInTab(() =>
        renderDraftPdf({
          title: titleOf({ line, customer }),
          invoiceDate: date,
          monthLabel: formatMonthLabel(claim.claimMonth),
          customer,
          description: DESCRIPTION,
          amount: line.amount,
        })
      );
    } catch {
      setError("The preview could not be made.");
    }
  }

  // Numbers are taken when the invoice is issued, never before.
  const numberOf = (code: string): string => numbers[code.toLowerCase()] ?? "";

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      {passwordDialog}
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          <InvoiceTabs />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Invoices</h1>
            <p className="text-sm md:text-base text-[#B0B5B5] mt-1">
              Upload the monthly expense Excel file to create invoices (PDF).
            </p>
          </div>

          <GlassCard className="p-4 md:p-6 space-y-3">
            <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">1. Upload the Excel file</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose the .xlsm / .xlsx of 立替研究・出向者立替費用計算. The sheet that is read is 請求_出向者立替費用.
            </p>
            <ExcelDropZone id="claim-file" fileName={fileName} reading={reading} onFile={onFile} />
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
                <SheetWarnings warnings={claim.warnings} />
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

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2 pr-3 font-semibold">Claim to</th>
                        <th className="py-2 pr-3 font-semibold">Customer</th>
                        <th className="py-2 pr-3 font-semibold text-right">Amount (JPY)</th>
                        <th className="py-2 pr-3 font-semibold">Title</th>
                        <th className="py-2 pr-3 font-semibold">Number</th>
                        <th className="py-2 font-semibold">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ line, customer }) => (
                        <tr key={line.claimTo} className="border-b border-slate-100 dark:border-slate-800 align-middle">
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
                                aria-label={`Title for ${line.claimTo}`}
                                value={titleOf({ line, customer })}
                                onChange={(e) => {
                                  setTitles((t) => ({ ...t, [line.claimTo]: e.target.value as DocumentTitle }));
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
                          <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">
                            {numberOf(line.claimTo)}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {customer && (
                              <button
                                type="button"
                                onClick={() => preview({ line, customer })}
                                disabled={!date}
                                title={numberOf(line.claimTo) ? "Open the issued invoice" : "Preview - no number is taken until it is issued"}
                                className="inline-flex items-center gap-1 mr-3 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-40"
                              >
                                <FileSearch className="w-4 h-4" />
                                Preview
                              </button>
                            )}
                            {built[line.claimTo.toLowerCase()] && (
                              <a
                                href={built[line.claimTo.toLowerCase()].url}
                                download={built[line.claimTo.toLowerCase()].fileName}
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
                        <td className="pt-3 font-semibold text-[#2D2A28] dark:text-white" colSpan={2}>
                          Total
                        </td>
                        <td className="pt-3 text-right font-semibold tabular-nums text-[#2D2A28] dark:text-white">
                          ¥{formatAmount(sum, 0)}
                        </td>
                        <td colSpan={3} className="pt-3 pl-3 text-xs text-slate-500 dark:text-slate-400">
                          {claim.sheetTotal === null
                            ? "The Excel has no total, so nothing was cross-checked."
                            : claim.sheetTotal === sum
                              ? "Matches the total in the Excel."
                              : `Does not match the Excel total of ¥${formatAmount(claim.sheetTotal, 0)}.`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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
