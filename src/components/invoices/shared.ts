import type { Customer } from "@/lib/invoice/customer-record";

export interface Built {
  url: string;
  fileName: string;
}

export async function customersFetcher(url: string): Promise<{ customers: Customer[] }> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The customers could not be read (${response.status}).`);
  return data;
}

/** The look of a form control on these screens (white with a black border, rule from the UI guide). */
export const FIELD =
  "rounded-md border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm";
