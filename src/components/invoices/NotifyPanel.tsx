"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Customer } from "@/lib/invoice/customer-record";
import type { SavedInvoice } from "@/lib/invoice/invoice-record";
import { sendInvoiceNotice } from "@/lib/notify/send-mail";
import type { GraphFileAttachment } from "@/lib/notify/attachments";

/** One invoice just issued, with what the mail needs of it. */
export interface NotifyItem {
  invoice: SavedInvoice;
  /** What the invoice prints in its Description column. */
  description: string;
  /** The PDF made from the saved invoice (an object URL), when there is one. */
  fileUrl?: string;
  fileName?: string;
  /** Makes the PDF when there is none yet - an invoice picked from the saved list, rebuilt from its saved data. */
  makePdf?: () => Promise<Blob>;
}

type Status = { state: "idle" } | { state: "sending" } | { state: "sent"; note?: string } | { state: "failed"; message: string };

/** A file's bytes as base64, the way Graph takes an attachment. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/**
 * After issuing: tell each site's accounting by mail, one message per company listing all of
 * its invoices of this batch.
 *
 * **Not sent by issuing.** The mail leaves the company, so the person sees who it goes to
 * (To and Cc, kept in Admin > Mail Notifications) and presses Send. It goes from their own
 * mailbox, like the invitation. A company with no recipient set is listed and skipped.
 */
export function NotifyPanel({
  items,
  customers,
  title = "3. Tell each site's accounting",
  onClose,
}: {
  items: NotifyItem[];
  customers: Customer[];
  title?: string;
  /** Given, the panel can be closed - from the saved list it is a step, not the end of an issue. */
  onClose?: () => void;
}) {
  const { user, getGraphAccessToken } = useAuth();
  const [attach, setAttach] = useState(true);
  const [status, setStatus] = useState<Record<string, Status>>({});

  const groups = new Map<string, NotifyItem[]>();
  for (const item of items) {
    const key = item.invoice.customerCode.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rows = [...groups.entries()].map(([key, list]) => {
    const customer = customers.find((c) => c.code.toLowerCase() === key);
    return { key, list, customer, to: customer?.notifyTo ?? [], cc: customer?.notifyCc ?? [] };
  });
  const sendable = rows.filter((r) => r.to.length > 0 && status[r.key]?.state !== "sent");

  async function sendAll() {
    const token = await getGraphAccessToken();
    const senderName = user?.userMetadata?.displayName || user?.email || "Invoice Portal";
    for (const row of sendable) {
      setStatus((s) => ({ ...s, [row.key]: { state: "sending" } }));
      try {
        const pdfs: GraphFileAttachment[] = [];
        if (attach) {
          for (const item of row.list) {
            const blob = item.fileUrl ? await (await fetch(item.fileUrl)).blob() : item.makePdf ? await item.makePdf() : null;
            if (!blob) continue;
            pdfs.push({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: item.fileName ?? `${item.invoice.number}.pdf`,
              contentType: "application/pdf",
              contentBytes: await toBase64(blob),
            });
          }
        }
        const first = row.list[0].invoice;
        const outcome = await sendInvoiceNotice(
          {
            customerName: first.customerName,
            invoiceDate: first.invoiceDate,
            monthLabel: first.monthLabel,
            senderName,
            invoices: row.list.map(({ invoice, description }) => ({
              number: invoice.number,
              title: invoice.title,
              description,
              amount: invoice.total,
            })),
          },
          row.to,
          row.cc,
          pdfs,
          token
        );
        setStatus((s) => ({
          ...s,
          [row.key]: outcome.sent > 0 ? { state: "sent", note: outcome.problem } : { state: "failed", message: outcome.problem ?? "It could not be sent." },
        }));
      } catch {
        setStatus((s) => ({ ...s, [row.key]: { state: "failed", message: "It could not be sent." } }));
      }
    }
  }

  const sending = rows.some((r) => status[r.key]?.state === "sending");

  return (
    <GlassCard className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-[#0057BC] dark:text-[#00A3DE]" />
        <h2 className="text-base font-semibold text-[#2D2A28] dark:text-white">{title}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-slate-500 dark:text-slate-400 hover:underline"
          >
            Close
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        One mail per company, from your own mailbox. Recipients are kept in{" "}
        <Link href="/admin/notifications" className="underline">
          Admin &gt; Mail Notifications
        </Link>
        .
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => {
          const st = status[row.key] ?? { state: "idle" as const };
          return (
            <li key={row.key} className="py-3 text-sm space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-[#2D2A28] dark:text-white">
                  {row.list[0].invoice.customerName}{" "}
                  <span className="font-normal text-slate-500 dark:text-slate-400">({row.list.map((i) => i.invoice.number).join(", ")})</span>
                </span>
                {st.state === "sending" && (
                  <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                  </span>
                )}
                {st.state === "sent" && (
                  <span className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE]">
                    <Check className="w-4 h-4" /> Sent
                  </span>
                )}
              </div>
              {row.to.length > 0 ? (
                <p className="text-slate-600 dark:text-slate-300 break-all">
                  To: {row.to.join("; ")}
                  {row.cc.length > 0 && <> &nbsp;·&nbsp; Cc: {row.cc.join("; ")}</>}
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  No recipient is set for {row.customer?.code ?? "this company"}, so no mail will be sent. Set it in{" "}
                  <Link href="/admin/notifications" className="underline">
                    Admin &gt; Mail Notifications
                  </Link>
                  .
                </p>
              )}
              {st.state === "sent" && st.note && <p className="text-slate-500 dark:text-slate-400">{st.note}</p>}
              {st.state === "failed" && (
                <p role="alert" className="text-red-600 dark:text-red-400">
                  {st.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={sendable.length === 0 || sending}
          onClick={sendAll}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed ${PRIMARY_ACTION_FILL}`}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {sendable.length === 0 ? "Nothing to send" : `Send ${sendable.length} ${sendable.length === 1 ? "mail" : "mails"}`}
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="w-4 h-4 accent-[#0057BC]" />
          Attach the PDFs
        </label>
      </div>
    </GlassCard>
  );
}
