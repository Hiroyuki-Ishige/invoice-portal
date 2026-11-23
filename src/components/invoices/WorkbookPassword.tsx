"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { BusyRing } from "@/components/ui/Loading";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import { PasswordCancelledError, WrongPasswordError, decryptWorkbook, isEncryptedWorkbook } from "@/lib/invoice/office-crypto";
import { SheetReadError } from "@/lib/invoice/xlsx-sheet";
import { FIELD } from "./shared";

interface Request {
  fileName: string;
  buffer: ArrayBuffer;
  resolve: (workbook: ArrayBuffer) => void;
  reject: (error: Error) => void;
}

/**
 * Reading a workbook that may be password-protected.
 *
 * `openWorkbook(file)` gives back the workbook's bytes: as they are for an ordinary file, or after
 * asking for the password (a dialog, rendered as `passwordDialog`) and decrypting it **in the
 * browser** for a protected one. A wrong password asks again; Cancel rejects with
 * `PasswordCancelledError`. The password is held only by the dialog while it is open.
 */
export function useOpenWorkbook(): { openWorkbook: (file: File) => Promise<ArrayBuffer>; passwordDialog: ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);

  const openWorkbook = useCallback(async (file: File): Promise<ArrayBuffer> => {
    const buffer = await file.arrayBuffer();
    if (!isEncryptedWorkbook(buffer)) return buffer;
    return new Promise<ArrayBuffer>((resolve, reject) => setRequest({ fileName: file.name, buffer, resolve, reject }));
  }, []);

  const passwordDialog = request ? (
    <PasswordDialog
      key={request.fileName}
      request={request}
      onDone={() => setRequest(null)}
    />
  ) : null;

  return { openWorkbook, passwordDialog };
}

function PasswordDialog({ request, onDone }: { request: Request; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = useCallback(() => {
    request.reject(new PasswordCancelledError());
    onDone();
  }, [request, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, cancel]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const workbook = await decryptWorkbook(request.buffer, password);
      request.resolve(workbook);
      onDone();
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        setError("That password does not open the file. Try again.");
        setPassword("");
      } else {
        request.reject(err instanceof SheetReadError ? err : new SheetReadError("The file could not be decrypted."));
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-3 animate-[fadeIn_0.3s_ease-in-out]">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Password for the Excel file"
        className="w-full max-w-md space-y-3 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-2xl animate-[popIn_0.3s_ease-in-out]"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#0057BC] dark:text-[#00A3DE]" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">This file has a password</h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 break-all">
          Enter the password to open <strong>{request.fileName}</strong>. It is used in this browser only and is not sent or saved.
        </p>
        <input
          type="password"
          className={`${FIELD} w-full`}
          aria-label="Password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          {busy && (
            <span className="mr-auto inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <BusyRing size={22} /> Opening...
            </span>
          )}
          <button type="button" onClick={cancel} disabled={busy} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!password || busy}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed ${PRIMARY_ACTION_FILL}`}
          >
            Open file
          </button>
        </div>
      </form>
    </div>
  );
}
