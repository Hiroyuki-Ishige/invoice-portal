import type { CustomerInput } from "./customer-record";

/**
 * **Starter data for the customer master**, offered by a button on Admin > Customers while the
 * table is empty - not read by the invoice screen. Copied from the issued documents
 * HYM1AC2026-182 / -183 / -184, the only three whose details were known.
 *
 * HOGV2, HOMT, HOMS (with HUSA), HLAO and the rest are not here on purpose: an address is
 * not something to invent. They are registered on the screen as they become known.
 */
export const STARTER_CUSTOMERS: CustomerInput[] = [
  {
    code: "HLAM",
    name: "HOYA LAMPHUN LTD",
    addressLines: ["60/26 MOO, 4 TAMBOL BANKLANG, AMPHUR MUANG,", "LAMPHUN, 51000 THAILAND"],
    tradingPartnerId: "HOGT(ex-A412)",
    paymentTerms: "Bank Transfer",
  },
  {
    code: "HOGV",
    name: "HOYA GLASS DISK VIETNAM LTD.",
    addressLines: ["Plot J-3&4, Thang Long Industrial Park, Thien Loc Commune,", "Hanoi City, Vietnam"],
    tradingPartnerId: "HOGV(ex-AV11)",
    paymentTerms: "Bank Transfer",
  },
  {
    code: "HOMS-J",
    name: "HOYA MEMORY DISK SINGAPORE Japan Branch",
    addressLines: ["35 floor Shinjuku Park Tower, 3-7-1, Nishi-Shinjuku, Shinjuku-ku,", "Tokyo 163-1035, Japan"],
    tradingPartnerId: "HMSJ(ex-CG12)",
    paymentTerms: "Bank Transfer",
  },
];
