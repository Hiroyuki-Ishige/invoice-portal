import { makeWorkbook, patentSheets, shift } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** Both Patent & R&D sheets with columns and rows inserted (by different amounts). Figures made up. */
const task: EvalTask = {
  name: "patent-layout-shift",
  kind: "patent-rd",
  firstSequence: 301,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2026-12": {
      invoices: [
        "HYM1AC2026-301 HOMT 2000000 INVOICE 2p | Monthly fee for delegation of technology development",
        "HYM1AC2026-302 HOMT 150000 INVOICE 2p | Monthly fee for delegation of technology development (New Business)",
        "HYM1AC2026-303 HOGV 210000 INVOICE 2p | Monthly fee for patent administration",
        "HYM1AC2026-304 HLAO 64000 DEBIT NOTE 2p | Monthly fee for patent administration",
        "HYM1AC2026-305 HOGV 9000 INVOICE 2p | Monthly fee for patent administration (New Business)",
      ],
      warnings: [],
      notices: 3,
    },
  },
  inputs: async () => {
    const { rd, patent } = patentSheets({ year: 2026, month: 12 }, {
      rd: 2000000,
      rdNb: 150000,
      patent: [["HOGV", 210000], ["HLAO", 64000]],
      patentNb: [["HOGV", 9000], ["HOGV2", 0]],
    });
    return [{ label: "2026-12", file: await makeWorkbook({ 請求_研究: shift(rd, 2, 2), 請求_特許: shift(patent, 1, 3) }) }];
  },
  checks: (result) => {
    const input = result.inputs[0];
    if (input.error) return [`shifted Patent & R&D sheets were refused: ${input.error}`];
    const got = input.invoices.map((i) => `${i.customerCode} ${i.amount}`).join(",");
    return got === "HOMT 2000000,HOMT 150000,HOGV 210000,HLAO 64000,HOGV 9000" ? [] : [`unexpected invoices: ${got}`];
  },
};
export default task;
