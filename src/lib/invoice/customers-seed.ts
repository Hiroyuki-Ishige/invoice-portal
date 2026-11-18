import type { CustomerInput } from "./customer-record";

/**
 * **Starter data for the customer master**, offered by a button on Admin > Customers for the
 * ones not registered yet - not read by the invoice screen. Copied from issued documents:
 * HYM1AC2026-182 / -183 / -184 (expenses) and -186 / -188 / -189 / -190 (patent and R&D).
 *
 * HOMS (with HUSA) and the rest are not here on purpose: an address is not something to
 * invent. They are registered on the screen as they become known.
 */
export const STARTER_CUSTOMERS: CustomerInput[] = [
  {
    code: "HLAM",
    name: "HOYA LAMPHUN LTD",
    addressLines: ["60/26 MOO, 4 TAMBOL BANKLANG, AMPHUR MUANG,", "LAMPHUN, 51000 THAILAND"],
    tradingPartnerId: "HOGT(ex-A412)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "INVOICE" },
  },
  {
    code: "HOGV",
    name: "HOYA GLASS DISK VIETNAM LTD.",
    addressLines: ["Plot J-3&4, Thang Long Industrial Park, Thien Loc Commune,", "Hanoi City, Vietnam"],
    tradingPartnerId: "HOGV(ex-AV11)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "INVOICE" },
  },
  {
    code: "HOMS-J",
    name: "HOYA MEMORY DISK SINGAPORE Japan Branch",
    addressLines: ["35 floor Shinjuku Park Tower, 3-7-1, Nishi-Shinjuku, Shinjuku-ku,", "Tokyo 163-1035, Japan"],
    tradingPartnerId: "HMSJ(ex-CG12)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "INVOICE" },
  },
  {
    code: "HOMT",
    name: "HOYA MEMORY DISK TECHNOLOGIES LTD.",
    addressLines: [
      "Room IPC03, IPC Building of Thang Long Industrial Park II corporation,",
      "Thang Long Industrial Park II, Nguyen Van Linh Commune, Hung Yen Province, Vietnam",
    ],
    tradingPartnerId: "HOMT(ex-CF11)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "INVOICE" },
  },
  {
    code: "HOGV2",
    name: "HOYA GLASS DISK VIETNAM II LTD.",
    addressLines: ["Plot A-9, Thang Long Industrial Park II, Nguyen Van Linh Commune,", "Hung Yen Province, Vietnam"],
    tradingPartnerId: "HGV2(ex-C811)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "INVOICE" },
  },
  {
    code: "HLAO",
    name: "HOYA LAOS Co., Ltd.",
    addressLines: ["A-04, Saysettha Development Zone, Nano Village,", "Saysettha District Vientiane Capital, Laos PDR"],
    tradingPartnerId: "HLAO(ex-D111)",
    paymentTerms: "Bank Transfer",
    defaultTitles: { expense: "INVOICE", "patent-rd": "DEBIT NOTE" },
  },
];
