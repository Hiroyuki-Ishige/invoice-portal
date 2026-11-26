"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { FIELD, ISSUED_INVOICES_KEY, customersFetcher, type Built } from "@/components/invoices/shared";
import type { Customer } from "@/lib/invoice/customer-record";
import type { SavedInvoice } from "@/lib/invoice/invoice-record";
import { formatAmount } from "@/lib/utils/format";
import { CLAIM_SHEET_NAME, ClaimSheetError, parseClaimSheet, statementFor, type ParsedClaim } from "@/lib/invoice/claim-sheet";
import { RD_DESCRIPTION, RD_SHEET_NAME, parseRdReimbursementSheet, type ParsedRdReimbursement } from "@/lib/invoice/rd-reimbursement-sheet";
import type { Statement } from "@/lib/invoice/statement-record";
import { formatMonthLabel, lastDayOfMonth, parseDateInput, toDateInput } from "@/lib/invoice/dates";
import { openPdfInTab, renderDraftPdf, renderPdf } from "@/lib/invoice/render-pdf";
import type { DocumentTitle } from "@/lib/invoice/build-pdf";

const TITLES: DocumentTitle[] = ["INVOICE", "DEBIT NOTE"];
const DESCRIPTION = "Reimbursement for the expense";

/**
 * One document to issue. The expense rows come first and the R&D reimbursement (sheet 請求_立替研究,
 * with its statement as page 2) last, so the numbers run as they always have: 182-184, then 185.
 * Keyed by kind and code - a company can be on both sheets.
 */
interface Row {
  key: string;
  claimTo: string;
  amount: number;
  description: string;
  statement: Statement | null;
  customer?: Customer;
}

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
  const [rd, setRd] = useState<ParsedRdReimbursement | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dateText, setDateText] = useState("");
  const [titles, setTitles] = useState<Record<string, DocumentTitle>>({});
  const [building, setBuilding] = useState(false);
  /** Set once something has been issued from the file on screen; a new file starts over. The Issue button stays off until then (a second press would take new numbers for the same documents). */
  const [issuedDone, setIssuedDone] = useState(false);
  const [issueFailures, setIssueFailures] = useState<string[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [built, setBuilt] = useState<Record<string, Built>>({});
  /** What was just issued, for the notification mails. */
  const [notifyItems, setNotifyItems] = useState<NotifyItem[]>([]);

  // Object URLs hold the file in memory until they are let go.
  const builtRef = useRef(built);
  /** The mail step that appears below after issuing - scrolled to, because issuing sends nothing by itself. */
  const notifyRef = useRef<HTMLDivElement>(null);
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
    setIssuedDone(false);
    setClaim(null);
    setRd(null);
    clearBuilt();
    setFileName(file.name);
    setReading(true);
    try {
      const workbook = await openWorkbook(file);
      const parsed = await parseClaimSheet(workbook);
      // The same workbook may carry 請求_立替研究; without it (or with 0 to claim) only the expenses are issued.
      // Its own problem does not stop the expenses: the R&D row is left out and the reason shown.
      let parsedRd: ParsedRdReimbursement | null = null;
      try {
        parsedRd = await parseRdReimbursementSheet(workbook);
      } catch (e) {
        if (!(e instanceof ClaimSheetError)) throw e;
        parsed.warnings.push(`${e.message} The R&D reimbursement invoice is not made until this is fixed.`);
      }
      setClaim(parsed);
      setRd(parsedRd);
      setDateText(toDateInput(lastDayOfMonth(parsed.claimMonth)));
      setTitles({});
    } catch (e) {
      setError(e instanceof ClaimSheetError ? e.message : "Something went wrong while reading the file.");
    } finally {
      setReading(false);
    }
  }

  const date = parseDateInput(dateText);

  const rows: Row[] = [
    ...(claim?.lines ?? []).map((line) => ({
      key: `expense:${line.claimTo.toLowerCase()}`,
      claimTo: line.claimTo,
      amount: line.amount,
      description: DESCRIPTION,
      // The month's expenses page, made this company's: page 2 of each expense invoice.
      statement: claim?.statement ? statementFor(claim.statement, line) : null,
    })),
    ...(rd
      ? [{ key: `rd:${rd.claimTo.toLowerCase()}`, claimTo: rd.claimTo, amount: rd.amount, description: RD_DESCRIPTION, statement: rd.statement }]
      : []),
  ].map((row) => ({ ...row, customer: customerByCode.get(row.claimTo.toLowerCase()) }));
  const creatable = rows.filter((r) => r.customer);
  // What was chosen on this screen, else the customer's default (Admin > Customers) - both kinds come from the expenses workbook.
  const titleOf = (row: Row): DocumentTitle => titles[row.key] || row.customer?.defaultTitles.expense || "INVOICE";
  const sum = claim ? claim.lines.reduce((a, l) => a + l.amount, 0) : 0;
  /** The review table in one block per sheet, each with its own total and the check against that sheet. */
  const groups = [
    {
      key: "expense",
      sheet: CLAIM_SHEET_NAME,
      rows: rows.filter((r) => !r.key.startsWith("rd:")),
      total: sum,
      check:
        claim?.sheetTotal == null
          ? "The Excel has no total, so nothing was cross-checked."
          : claim.sheetTotal === sum
            ? "Matches the total in the Excel."
            : `Does not match the Excel total of ¥${formatAmount(claim.sheetTotal, 0)}.`,
    },
    ...(rd
      ? [
          {
            key: "rd",
            sheet: RD_SHEET_NAME,
            rows: rows.filter((r) => r.key.startsWith("rd:")),
            total: rd.amount,
            check: "Matches the Claim amount and the A/C table in the Excel.",
          },
        ]
      : []),
  ];
  const sheetWarnings = [
    ...(claim?.warnings ?? []),
    ...(rd?.warnings ?? []),
    ...(claim && rd && formatMonthLabel(claim.claimMonth) !== formatMonthLabel(rd.claimMonth)
      ? [`${RD_SHEET_NAME} is for ${formatMonthLabel(rd.claimMonth)}, but the expenses are for ${formatMonthLabel(claim.claimMonth)}. Both are issued with the claim month ${formatMonthLabel(claim.claimMonth)}.`]
      : []),
  ];
  const canBuild = !!claim && !!date && creatable.length > 0 && !building && !issuedDone;

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
          items: creatable.map((row) => ({
            claimTo: row.claimTo,
            title: titleOf(row),
            description: row.description,
            amount: row.amount,
            ...(row.statement ? { statement: row.statement } : {}),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        setError(data.error || "The invoices could not be issued.");
        return;
      }
      const issued = (data.invoices ?? []) as SavedInvoice[];
      if (issued.length > 0) setIssuedDone(true);
      setIssueFailures(((data.failed ?? []) as Array<{ claimTo: string; error: string }>).map((f) => `${f.claimTo}: ${f.error}`));

      // Which row each saved invoice came from: the route says, by the index of the item posted.
      const itemIndexes = (data.itemIndexes ?? []) as number[];
      const rowOf = (i: number): Row | undefined => creatable[itemIndexes[i]];
      const next: Record<string, Built> = {};
      for (const [i, invoice] of issued.entries()) {
        const row = rowOf(i);
        if (!row) continue;
        const blob = await renderPdf(invoice, row.description);
        next[row.key] = { url: URL.createObjectURL(blob), fileName: `${invoice.number}.pdf` };
      }
      setBuilt(next);
      const nextNotify: NotifyItem[] = issued.map((invoice, i) => {
        const row = rowOf(i);
        const file = row ? next[row.key] : undefined;
        return { invoice, description: row?.description ?? DESCRIPTION, fileUrl: file?.url, fileName: file?.fileName };
      });
      flushSync(() => setNotifyItems(nextNotify));
      if (nextNotify.length > 0) notifyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setNumbers(Object.fromEntries(issued.flatMap((invoice, i) => (rowOf(i) ? [[rowOf(i)!.key, invoice.number]] : []))));
      await mutate(ISSUED_INVOICES_KEY);
    } catch {
      setError("Something went wrong while issuing the invoices. Check the list below before trying again.");
    } finally {
      setBuilding(false);
    }
  }

  /** Preview one row: the issued document once there is one, otherwise a draft (no number taken). */
  async function preview(row: Row) {
    const { customer } = row;
    if (!claim || !date || !customer) return;
    setError("");
    const issued = built[row.key];
    if (issued) {
      // Already issued: show that document, with its number, not a draft.
      window.open(issued.url, "_blank");
      return;
    }
    try {
      await openPdfInTab(() =>
        renderDraftPdf({
          title: titleOf(row),
          invoiceDate: date,
          monthLabel: formatMonthLabel(claim.claimMonth),
          customer,
          description: row.description,
          amount: row.amount,
          statement: row.statement,
        })
      );
    } catch {
      setError("The preview could not be made.");
    }
  }

  // Numbers are taken when the invoice is issued, never before.
  const numberOf = (key: string): string => numbers[key] ?? "";

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
              Choose the .xlsm / .xlsx of 立替研究・出向者立替費用計算. The sheets read are 請求_出向者立替費用 and, when it is there, {RD_SHEET_NAME} (one invoice with its statement as page 2).
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
                <SheetWarnings warnings={sheetWarnings} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                    Invoice date (Claim month: {formatMonthLabel(claim.claimMonth)})
                    <input
                      type="date"
                      className={`${FIELD} disabled:opacity-50`}
                      disabled={issuedDone}
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
                    {/*
                      One block per sheet, each with its own total checked against its own sheet: the
                      expenses against the total under the Claim to list, the R&D reimbursement against
                      its Claim amount (the reader refuses that sheet when its A/C table does not add up
                      to it). One sum over both would match neither.
                    */}
                    {groups.map((group, groupIndex) => (
                      <tbody key={group.key}>
                        {groups.length > 1 && (
                          <tr>
                            <th
                              colSpan={6}
                              scope="colgroup"
                              className={`pb-1 text-left text-xs font-semibold text-[#0057BC] dark:text-[#00A3DE] ${groupIndex > 0 ? "pt-6" : "pt-3"}`}
                            >
                              {group.sheet}
                            </th>
                          </tr>
                        )}
                        {group.rows.map((row) => {
                        const { customer } = row;
                        return (
                        <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                          <td className="py-2 pr-3 font-medium text-[#2D2A28] dark:text-white">
                            {row.claimTo}
                            {row.statement && (
                              <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                                {row.key.startsWith("rd:") ? "R&D reimbursement - 2 pages" : "2 pages (with the A/C table)"}
                              </span>
                            )}
                          </td>
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
                          <td className="py-2 pr-3 text-right tabular-nums">¥{formatAmount(row.amount, 0)}</td>
                          <td className="py-2 pr-3">
                            {customer && (
                              <select
                                className={`${FIELD} disabled:opacity-50`}
                                disabled={issuedDone}
                                aria-label={`Title for ${row.claimTo}`}
                                value={titleOf(row)}
                                onChange={(e) => {
                                  setTitles((t) => ({ ...t, [row.key]: e.target.value as DocumentTitle }));
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
                            {numberOf(row.key)}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {customer && (
                              <button
                                type="button"
                                onClick={() => preview(row)}
                                disabled={!date}
                                title={numberOf(row.key) ? "Open the issued invoice" : "Preview - no number is taken until it is issued"}
                                className="inline-flex items-center gap-1 mr-3 text-[#0057BC] dark:text-[#00A3DE] hover:underline disabled:opacity-40"
                              >
                                <FileSearch className="w-4 h-4" />
                                Preview
                              </button>
                            )}
                            {built[row.key] && (
                              <a
                                href={built[row.key].url}
                                download={built[row.key].fileName}
                                className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE] hover:underline"
                              >
                                <Download className="w-4 h-4" />
                                Save
                              </a>
                            )}
                          </td>
                        </tr>
                        );
                        })}
                        <tr>
                          <td className="pt-3 font-semibold text-[#2D2A28] dark:text-white" colSpan={2}>
                            {groups.length > 1 ? `Total - ${group.sheet}` : "Total"}
                          </td>
                          <td className="pt-3 text-right font-semibold tabular-nums text-[#2D2A28] dark:text-white">
                            ¥{formatAmount(group.total, 0)}
                          </td>
                          <td colSpan={3} className="pt-3 pl-3 text-xs text-slate-500 dark:text-slate-400">
                            {group.check}
                          </td>
                        </tr>
                      </tbody>
                    ))}
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
                  {building ? "Issuing..." : issuedDone ? "Issued" : "Issue invoices"}
                </button>
                {issueFailures.length > 0 && (
                  <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
                    Some could not be saved: {issueFailures.join("; ")}. Check the list below before issuing them again.
                  </p>
                )}
                {!canBuild && !building && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {issuedDone
                      ? "Issued. No mail has been sent yet - send the notices in step 3 below."
                      : !date
                      ? "Enter the invoice date."
                      : "No row has a registered customer."}
                  </span>
                )}
              </div>
            </>
          )}

          {notifyItems.length > 0 && (
            <div ref={notifyRef} className="scroll-mt-20">
              <NotifyPanel key={notifyItems.map((i) => i.invoice.id).join()} items={notifyItems} customers={customerData?.customers ?? []} />
            </div>
          )}

          <SavedInvoices />
        </div>
      </main>
    </div>
  );
}
