/**
 * The customer master the evals run against. **Every name and address here is made up** - only the
 * codes are the real ones (`customers-seed.ts`), because the Excel sheets key on them.
 * HOMS is left out on purpose: the "unregistered code" task needs a code with no customer.
 */
import type { Customer } from "../../src/lib/invoice/customer-record";
import type { InvoiceTitle } from "../../src/lib/invoice/invoice-record";

const fake = (code: string, name: string, expense: InvoiceTitle, patentRd: InvoiceTitle): Customer => ({
    id: `00000000-0000-0000-0000-${code.replace(/[^A-Z0-9]/g, "").padEnd(12, "0").slice(0, 12)}`,
    code,
    name,
    addressLines: [`${code} Example Street 1, Sample Industrial Park,`, "Example City 00000, Testland"],
    tradingPartnerId: `${code}(ex-Z000)`,
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense, "patent-rd": patentRd },
    notifyTo: [],
    notifyCc: [],
});

export const EVAL_CUSTOMERS: Customer[] = [
  fake("HLAM", "EXAMPLE LAMPHUN TEST CO", "INVOICE", "INVOICE"),
  fake("HOGV", "EXAMPLE GLASS TEST VIETNAM", "INVOICE", "INVOICE"),
  fake("HOMS-J", "EXAMPLE MEMORY TEST Japan Branch", "INVOICE", "INVOICE"),
  fake("HOMT", "EXAMPLE MEMORY TECH TEST", "INVOICE", "INVOICE"),
  fake("HOGV2", "EXAMPLE GLASS TEST VIETNAM II", "INVOICE", "INVOICE"),
  fake("HLAO", "EXAMPLE LAOS TEST CO", "INVOICE", "DEBIT NOTE"),
];
