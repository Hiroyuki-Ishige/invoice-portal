"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { BusyRing } from "@/components/ui/Loading";
import { PRIMARY_ACTION_FILL } from "@/components/ui/Button";
import type { Customer } from "@/lib/invoice/customer-record";
import type { EntityAccess } from "@/lib/types/user-profile";

/** The access map a list of company codes stands for: `{ HLAM: "view" }`. A company is a customer code. */
export function accessFromCodes(codes: string[]): EntityAccess {
  const access: EntityAccess = {};
  for (const code of codes) access[code] = "view";
  return access;
}

/** The ticked codes - only those the customer master still has, in its order. */
export function codesFromAccess(access: EntityAccess | undefined, customers: Customer[]): string[] {
  if (!access) return [];
  const granted = new Set(Object.keys(access).map((code) => code.toLowerCase()));
  return customers.filter((c) => granted.has(c.code.toLowerCase())).map((c) => c.code);
}

/**
 * Tick the companies a **User** may see invoices of. Admin and F&A Admin see every company and need
 * no list. A User with none ticked sees no invoice.
 */
export function CompanyPicker({
  customers,
  loading,
  error,
  value,
  onChange,
}: {
  customers: Customer[] | undefined;
  loading: boolean;
  error?: string;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const selected = new Set(value);
  const toggle = (code: string) => onChange(selected.has(code) ? value.filter((c) => c !== code) : [...value, code]);

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading companies...</p>;
  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!customers || customers.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No company is registered yet. Add them in Admin &gt; Customers.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {customers.map((customer) => (
          <label key={customer.id} className="flex items-start gap-2 text-sm text-[#2D2A28] dark:text-white cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-[#0057BC]"
              checked={selected.has(customer.code)}
              onChange={() => toggle(customer.code)}
            />
            <span>
              <span className="font-medium">{customer.code}</span>{" "}
              <span className="text-slate-500 dark:text-slate-400">{customer.name}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-4 text-sm">
        <button type="button" onClick={() => onChange(customers.map((c) => c.code))} className="text-[#0057BC] dark:text-[#00A3DE] hover:underline">
          Select all
        </button>
        <button type="button" onClick={() => onChange([])} className="text-slate-500 dark:text-slate-400 hover:underline">
          Clear
        </button>
      </div>
    </div>
  );
}

/** Edit one user's companies and save them. The save itself is the caller's (a PATCH). */
export function CompaniesDialog({
  name,
  customers,
  loading,
  error,
  initial,
  onSave,
  onClose,
}: {
  name: string;
  customers: Customer[] | undefined;
  loading: boolean;
  error?: string;
  initial: string[];
  onSave: (codes: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [codes, setCodes] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  /* Saving replaces the whole list, so it is refused until the companies have loaded: `initial` is read
     once, and a save before that would write an empty list over what the user already has. */
  const ready = !loading && !error && !!customers;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setSaveError("");
    try {
      await onSave(codes);
    } catch (err) {
      // Stay open, with what was ticked, so a failed save is not typed again from nothing.
      setSaveError(err instanceof Error ? err.message : "Could not save the companies.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-3 animate-[fadeIn_0.3s_ease-in-out]" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Companies of ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-2xl animate-[popIn_0.3s_ease-in-out]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#2D2A28] dark:text-white">Companies of {name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              They can see the invoices of the companies ticked here, and no others. With none ticked they see no invoice.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <CompanyPicker customers={customers} loading={loading} error={error} value={codes} onChange={setCodes} />
        {saveError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {saveError}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          {busy && <BusyRing size={22} />}
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !ready}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed ${PRIMARY_ACTION_FILL}`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
