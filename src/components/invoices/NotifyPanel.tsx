"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Eye, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Customer } from "@/lib/invoice/customer-record";
import type { SavedInvoice } from "@/lib/invoice/invoice-record";
import { APP_SUBJECT_PREFIX, sendInvoiceNotice } from "@/lib/notify/send-mail";
import { buildInvoiceNotice, type InvoiceNoticeInput } from "@/lib/notify/invoice-notice";
import { MailPreviewModal, type MailPreviewProps } from "@/components/ui/MailPreviewModal";
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
  /** The mail being previewed (nothing is sent), if the dialog is open. */
  const [preview, setPreview] = useState<Omit<MailPreviewProps, "onClose"> | null>(null);
  /**
   * The addresses (and so the companies) taken **out** of this send - everything is in until unticked, which is
   * the default asked for. Keyed `to|company|address` / `cc|company|address`. A company with no To left is skipped.
   */
  const [off, setOff] = useState<Set<string>>(new Set());

  const groups = new Map<string, NotifyItem[]>();
  for (const item of items) {
    const key = item.invoice.customerCode.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const addrKey = (kind: "to" | "cc", company: string, address: string) => `${kind}|${company}|${address}`;
  const rows = [...groups.entries()].map(([key, list]) => {
    const customer = customers.find((c) => c.code.toLowerCase() === key);
    const to = customer?.notifyTo ?? [];
    const cc = customer?.notifyCc ?? [];
    return {
      key,
      list,
      customer,
      to,
      cc,
      toSel: to.filter((a) => !off.has(addrKey("to", key, a))),
      ccSel: cc.filter((a) => !off.has(addrKey("cc", key, a))),
    };
  });
  type Row = (typeof rows)[number];
  /** Rows that could still be sent (a recipient exists, not sent yet) - what the ticks are about. */
  const choosable = rows.filter((r) => r.to.length > 0 && status[r.key]?.state !== "sent");
  const sendable = choosable.filter((r) => r.toSel.length > 0);

  const toggleAddress = (kind: "to" | "cc", company: string, address: string) =>
    setOff((current) => {
      const next = new Set(current);
      const key = addrKey(kind, company, address);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /** Tick or untick every address of the given companies at once. */
  const setRows = (targets: Row[], on: boolean) =>
    setOff((current) => {
      const next = new Set(current);
      for (const row of targets) {
        for (const address of row.to) (on ? next.delete(addrKey("to", row.key, address)) : next.add(addrKey("to", row.key, address)));
        for (const address of row.cc) (on ? next.delete(addrKey("cc", row.key, address)) : next.add(addrKey("cc", row.key, address)));
      }
      return next;
    });

  const senderName = user?.userMetadata?.displayName || user?.email || "Invoice Portal";

  /** What one company's mail says - the same for the preview and for the send, so they cannot differ. */
  function noticeFor(list: NotifyItem[]): Omit<InvoiceNoticeInput, "attached"> {
    const first = list[0].invoice;
    return {
      customerName: first.customerName,
      invoiceDate: first.invoiceDate,
      monthLabel: first.monthLabel,
      senderName,
      origin: window.location.origin,
      invoices: list.map(({ invoice, description }) => ({
        number: invoice.number,
        title: invoice.title,
        description,
        amount: invoice.total,
      })),
    };
  }

  function previewRow(row: Row) {
    const withPdf = row.list.filter((item) => item.fileUrl || item.makePdf);
    const { subject, html } = buildInvoiceNotice({ ...noticeFor(row.list), attached: attach && withPdf.length > 0 });
    setPreview({
      to:
        row.toSel.length > 0
          ? row.toSel.join("; ")
          : row.to.length > 0
            ? "(no recipient is ticked - no mail would be sent)"
            : `(no recipient is set for ${row.customer?.code ?? "this company"} - no mail would be sent)`,
      cc: row.ccSel.join("; "),
      subject: `${APP_SUBJECT_PREFIX} ${subject}`,
      attachments: attach ? withPdf.map((item) => item.fileName ?? `${item.invoice.number}.pdf`) : [],
      html,
    });
  }

  async function sendAll() {
    const token = await getGraphAccessToken();
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
        const outcome = await sendInvoiceNotice(
          noticeFor(row.list),
          row.toSel,
          row.ccSel,
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

      {choosable.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">
            {sendable.length} of {choosable.length} {choosable.length === 1 ? "mail" : "mails"} selected
          </span>
          <button type="button" onClick={() => setRows(choosable, true)} className="text-[#0057BC] dark:text-[#00A3DE] hover:underline">
            Select all
          </button>
          <button type="button" onClick={() => setRows(choosable, false)} className="text-slate-500 dark:text-slate-400 hover:underline">
            Select none
          </button>
        </div>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => {
          const st = status[row.key] ?? { state: "idle" as const };
          return (
            <li key={row.key} className="py-3 text-sm space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-[#2D2A28] dark:text-white">
                  {row.to.length > 0 && st.state !== "sent" && (
                    <input
                      type="checkbox"
                      aria-label={`Send the mail to ${row.list[0].invoice.customerName}`}
                      className="mr-2 w-4 h-4 align-[-2px] accent-[#0057BC]"
                      checked={row.toSel.length > 0}
                      disabled={st.state === "sending"}
                      onChange={(e) => setRows([row], e.target.checked)}
                    />
                  )}
                  {row.list[0].invoice.customerName}{" "}
                  <span className="font-normal text-slate-500 dark:text-slate-400">({row.list.map((i) => i.invoice.number).join(", ")})</span>
                </span>
                <button
                  type="button"
                  onClick={() => previewRow(row)}
                  className="inline-flex items-center gap-1 text-[#0057BC] dark:text-[#00A3DE] hover:underline"
                >
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  Preview mail
                </button>
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
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  {(["to", "cc"] as const).map((kind) => {
                    const addresses = kind === "to" ? row.to : row.cc;
                    if (addresses.length === 0) return null;
                    return (
                      <div key={kind} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="w-6 text-slate-500 dark:text-slate-400">{kind === "to" ? "To:" : "Cc:"}</span>
                        {addresses.map((address) => (
                          <label key={address} className={`inline-flex items-center gap-1.5 break-all ${st.state === "sent" ? "" : "cursor-pointer"}`}>
                            {st.state !== "sent" && (
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-[#0057BC]"
                                checked={!off.has(addrKey(kind, row.key, address))}
                                disabled={st.state === "sending"}
                                onChange={() => toggleAddress(kind, row.key, address)}
                              />
                            )}
                            {address}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                  {st.state !== "sent" && row.toSel.length === 0 && (
                    <p className="text-slate-500 dark:text-slate-400">No To address is ticked, so no mail will be sent to this company.</p>
                  )}
                </div>
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
          {sendable.length === 0
            ? choosable.length > 0
              ? "No mail selected"
              : "Nothing to send"
            : `Send ${sendable.length} ${sendable.length === 1 ? "mail" : "mails"}`}
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="w-4 h-4 accent-[#0057BC]" />
          Attach the PDFs
        </label>
      </div>
      {preview && <MailPreviewModal {...preview} onClose={() => setPreview(null)} />}
    </GlassCard>
  );
}
