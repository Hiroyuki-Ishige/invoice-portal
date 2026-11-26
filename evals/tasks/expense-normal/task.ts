import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** A usual month of the expenses sheet: zeros, a `※` mark, a total under the table. Figures made up. */
const task: EvalTask = {
  name: "expense-normal",
  kind: "expense",
  firstSequence: 101,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2026-10": {
      invoices: [
        "HYM1AC2026-101 HLAM 120000 INVOICE 2p | Reimbursement for the expense",
        "HYM1AC2026-102 HOMS-J 35500 INVOICE 2p | Reimbursement for the expense",
        "HYM1AC2026-103 HOGV2 250000 INVOICE 2p | Reimbursement for the expense",
      ],
      date: "31-Oct-2026",
      warnings: [],
      notices: 3,
      noticeSubjectPrefix: "[TEST]",
    },
  },
  inputs: async () => [
    {
      label: "2026-10",
      file: await makeWorkbook({
        請求_出向者立替費用: claimSheet(
          { year: 2026, month: 10 },
          [
            ["HLAM", 120000],
            ["HOGV", 0],
            ["HOMS-J※", 35500],
            ["HOMT", 0],
            ["HOGV2", 250000],
            ["HLAO", 0],
          ],
          405500
        ),
      }),
    },
  ],
};
export default task;
