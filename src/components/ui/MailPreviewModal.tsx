"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface MailPreviewProps {
  /** Shown as typed: addresses, or a note when there are none. */
  to: string;
  cc?: string;
  /** The subject as it will arrive, prefix included. */
  subject: string;
  /** File names that travel with the message. */
  attachments?: string[];
  /** The mail body, as `renderMailShell` made it. */
  html: string;
  onClose: () => void;
}

/**
 * A mail shown as the reader will get it - nothing is sent. The one dialog every mail preview uses
 * (the invitation, the invoice notice).
 *
 * The HTML sits in a sandboxed iframe (scripts off, links switched off): it is a mail body, not part of
 * this page, and its own styles must not touch the app's. The frame is as tall as its content, so the
 * whole mail is there to read, and the dialog scrolls when it is longer than the screen.
 */
export function MailPreviewModal({ to, cc, subject, attachments, html, onClose }: MailPreviewProps) {
  /* Reading the content's height needs allow-same-origin; scripts stay off, so the mail still cannot run
     anything. **Never add allow-scripts beside allow-same-origin**: together they lift the sandbox, and the
     frame could then reach this page and the MSAL tokens in localStorage. */
  const [height, setHeight] = useState(640);
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}a{pointer-events:none}</style></head><body>${html}</body></html>`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 animate-[fadeIn_0.3s_ease-in-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mail preview"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl animate-[popIn_0.3s_ease-in-out]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">Mail preview</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing is sent from here.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 border-b border-slate-200 dark:border-slate-700 px-5 py-3 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">To</dt>
          <dd className="min-w-0 break-all text-[#2D2A28] dark:text-white">{to || "(no address yet)"}</dd>
          {cc ? (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Cc</dt>
              <dd className="min-w-0 break-all text-[#2D2A28] dark:text-white">{cc}</dd>
            </>
          ) : null}
          <dt className="text-slate-500 dark:text-slate-400">Subject</dt>
          <dd className="min-w-0 text-[#2D2A28] dark:text-white">{subject}</dd>
          {attachments && attachments.length > 0 ? (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Attached</dt>
              <dd className="min-w-0 break-all text-[#2D2A28] dark:text-white">{attachments.join(", ")}</dd>
            </>
          ) : null}
        </dl>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f1f4f7]">
          <iframe
            title="Mail"
            sandbox="allow-same-origin"
            srcDoc={srcDoc}
            style={{ height }}
            onLoad={(e) => {
              const doc = e.currentTarget.contentDocument;
              if (doc) setHeight(doc.documentElement.scrollHeight);
            }}
            className="block w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
