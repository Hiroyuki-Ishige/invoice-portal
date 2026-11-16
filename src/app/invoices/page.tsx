"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { GlassCard } from "@/components/ui/GlassCard";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { formatAmount } from "@/lib/utils/format";
import { ClaimSheetError, parseClaimSheet, type ParsedClaim } from "@/lib/invoice/claim-sheet";
import type { Customer } from "@/lib/invoice/customer-record";
import { formatInvoiceDate, formatMonthLabel, lastDayOfMonth, type YearMonthDay } from "@/lib/invoice/dates";
import { invoiceNumberFor } from "@/lib/invoice/invoice-number";
import type { DocumentTitle } from "@/lib/invoice/build-pdf";

const TITLES: DocumentTitle[] = ["INVOICE", "DEBIT NOTE"];
const DESCRIPTION = "Reimbursement for the expense";

interface Built {
  url: string;
  fileName: string;
}

async function customersFetcher(url: string): Promise<{ customers: Customer[] }> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The customers could not be read (${response.status}).`);
  return data;
}

const FIELD =
  "rounded-md border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm";

/** `2026-10-31` from the date input, as the parts the document needs. */
function parseDateInput(value: string): YearMonthDay | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

function toDateInput({ year, month, day }: YearMonthDay): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Upload the monthly claim sheet, choose INVOICE / DEBIT NOTE per company, and get one PDF each.
 *
 * **Stage 1: nothing is saved yet.** The documents are made in the browser and handed back;
 * keeping them and their data in Dataverse waits for the sign-in approval, and the invoice
 * number is typed for the same reason (it will come from the table's highest number + 1).
 */
export default function Page() {
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: customerData, error: customerError } = useSWR("/api/customers", customersFetcher, {
    revalidateOnFocus: false,
  });
  const customerByCode = new Map((customerData?.customers ?? []).map((c) => [c.code.toLowerCase(), c]));
  const [fileName, setFileName] = useState("");
  const [claim, setClaim] = useState<ParsedClaim | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dateText, setDateText] = useState("");
  const [firstNumber, setFirstNumber] = useState("");
  const [titles, setTitles] = useState<Record<string, DocumentTitle | "">>({});
  const [building, setBuilding] = useState(false);
  const [built, setBuilt] = useState<Record<string, Built>>({});

  // Object URLs hold the file in memory until they are let go.
  const builtRef = useRef(built);
  useEffect(() => {
    builtRef.current = built;
  }, [built]);
  useEffect(() => () => Object.values(builtRef.current).forEach((b) => URL.revokeObjectURL(b.url)), []);

  function clearBuilt() {
    Object.values(builtRef.current).forEach((b) => URL.revokeObjectURL(b.url));
    setBuilt({});
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setClaim(null);
    clearBuilt();
    setFileName(file.name);
    setReading(true);
    try {
      const parsed = await parseClaimSheet(await file.arrayBuffer());
      setClaim(parsed);
      setDateText(toDateInput(lastDayOfMonth(parsed.claimMonth)));
      setTitles({});
    } catch (e) {
      setError(e instanceof ClaimSheetError ? e.message : "Something went wrong while reading the file.");
    } finally {
      setReading(false);
      // Choosing the same file again must still fire a change.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const date = parseDateInput(dateText);
  const first = Number(firstNumber);
  const numberOk = Number.isInteger(first) && first > 0;

  const rows = (claim?.lines ?? []).map((line) => ({ line, customer: customerByCode.get(line.claimTo.toLowerCase()) }));
  const creatable = rows.filter((r) => r.customer);
  const allTitled = creatable.every((r) => titles[r.line.claimTo]);
  const canBuild = !!claim && !!date && numberOk && creatable.length > 0 && allTitled && !building;
  const sum = claim ? claim.lines.reduce((a, l) => a + l.amount, 0) : 0;

  async function build() {
    if (!claim || !date || !numberOk) return;
    setBuilding(true);
    setError("");
    clearBuilt();
    try {
      const { buildInvoicePdf } = await import("@/lib/invoice/build-pdf");
      const logoPng = new Uint8Array(await (await fetch("/hoya-logo.png")).arrayBuffer());
      const next: Record<string, Built> = {};
      let seq = first;
      for (const { line, customer } of creatable) {
        const title = titles[line.claimTo] as DocumentTitle;
        const invoiceNumber = invoiceNumberFor(date, seq++);
        const bytes = await buildInvoicePdf({
          title,
          invoiceNumber,
          invoiceDate: formatInvoiceDate(date),
          customer: {
            name: customer!.name,
            addressLines: customer!.addressLines,
            tradingPartnerId: customer!.tradingPartnerId,
          },
          paymentTerms: customer!.paymentTerms,
          description: DESCRIPTION,
          monthLabel: formatMonthLabel(claim.claimMonth),
          amount: line.amount,
          logoPng,
        });
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
        next[line.claimTo] = { url: URL.createObjectURL(blob), fileName: `${invoiceNumber}.pdf` };
      }
      setBuilt(next);
    } catch {
      setError("Something went wrong while creating the PDF. Please try again.");
    } finally {
      setBuilding(false);
    }
  }

  // The number each creatable row will get, in the order it will be made.
  const numberOf = (code: string): string => {
    if (!date || !numberOk) return "";
    const i = creatable.findIndex((r) => r.line.claimTo === code);
    return i < 0 ? "" : invoiceNumberFor(date, first + i);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-6 md:py-8 px-3 md:px-6">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
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
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              id="claim-file"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="claim-file"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors duration-300 ease-in-out ${PRIMARY_ACTION_FILL}`}
              >
                {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {reading ? "Reading..." : "Choose Excel file"}
              </label>
              {fileName && <span className="text-sm text-slate-600 dark:text-slate-300 break-all">{fileName}</span>}
            </div>
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
                  <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                    First number (e.g. 182)
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={FIELD}
                      value={firstNumber}
                      onChange={(e) => {
                        setFirstNumber(e.target.value);
                        clearBuilt();
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Until this is connected to the store (Dataverse), the running number is typed by hand. Once connected, it will continue from the last number automatically.
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
                                value={titles[line.claimTo] ?? ""}
                                onChange={(e) => {
                                  setTitles((t) => ({ ...t, [line.claimTo]: e.target.value as DocumentTitle | "" }));
                                  clearBuilt();
                                }}
                              >
                                <option value="">Choose...</option>
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
                          <td className="py-2">
                            {built[line.claimTo] && (
                              <a
                                href={built[line.claimTo].url}
                                download={built[line.claimTo].fileName}
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
                  {building ? "Creating..." : "Create invoices"}
                </button>
                {!canBuild && !building && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {!numberOk
                      ? "Enter the first number."
                      : !date
                        ? "Enter the invoice date."
                        : creatable.length === 0
                          ? "No row has a registered customer."
                          : "Choose a title for every row."}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
