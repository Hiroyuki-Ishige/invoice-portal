import { makeWorkbook, patentSheets } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** Both Patent & R&D sheets under slightly different names. Figures made up. */
const task: EvalTask = {
  name: "patent-sheet-name",
  kind: "patent-rd",
  firstSequence: 401,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2027-01": {
      invoices: [
        "HYM1AC2026-401 HOMT 700000 INVOICE 2p | Monthly fee for delegation of technology development",
        "HYM1AC2026-402 HOGV 50000 INVOICE 2p | Monthly fee for patent administration",
      ],
      warnings: [
        "請求-研究 (FY2026)",
        "請求_特許 ",
      ],
    },
  },
  inputs: async () => {
    const { rd, patent } = patentSheets({ year: 2027, month: 1 }, {
      rd: 700000,
      rdNb: 0,
      patent: [["HOGV", 50000]],
      patentNb: [["HOGV", 0]],
    });
    return [{ label: "2027-01", file: await makeWorkbook({ "請求-研究 (FY2026)": rd, "請求_特許 ": patent }) }];
  },
  checks: (result) => (result.inputs[0].error ? [`refused: ${result.inputs[0].error}`] : []),
};
export default task;
