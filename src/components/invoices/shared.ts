import type { Customer } from "@/lib/invoice/customer-record";

export interface Built {
  url: string;
  fileName: string;
}

/**
 * The SWR keys of the two saved-invoice lists. **One spelling for the list and for the screens that
 * refresh it** - the issue screens refreshed `/api/invoices?status=` after the list had moved to
 * these two keys, so a newly issued invoice did not appear until the page was reloaded. The two lists are
 * read apart so neither can crowd the other out of the newest-N cap.
 */
export const ISSUED_INVOICES_KEY = "/api/invoices?status=issued";
export const CANCELLED_INVOICES_KEY = "/api/invoices?status=cancelled";

export async function customersFetcher(url: string): Promise<{ customers: Customer[] }> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The customers could not be read (${response.status}).`);
  return data;
}

/** The look of a form control on these screens (white with a black border, rule from the UI guide). */
export const FIELD =
  "rounded-md border border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-1.5 text-sm";
