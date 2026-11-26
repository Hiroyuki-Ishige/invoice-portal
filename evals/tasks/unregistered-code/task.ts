import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** A code the customer master does not have (HOMS) beside one it has. Figures made up. */
const task: EvalTask = {
  name: "unregistered-code",
  kind: "expense",
  firstSequence: 1,
  // The acceptance criteria a machine can decide (task.md); the grader keeps the wording.
  expect: {
    "2026-07": {
      invoices: [
        "HYM1AC2026-001 HLAM 50000 INVOICE 2p | Reimbursement for the expense",
        "HYM1AC2026-002 HOMS-J 7000 INVOICE 2p | Reimbursement for the expense",
      ],
      unregistered: [
        "HOMS",
      ],
      notices: 2,
      warnings: [],
    },
  },
  inputs: async () => [
    {
      label: "2026-07",
      file: await makeWorkbook({
        請求_出向者立替費用: claimSheet(
          { year: 2026, month: 7 },
          [
            ["HLAM", 50000],
            ["HOMS", 44000],
            ["HOMS-J", 7000],
          ],
          101000
        ),
      }),
    },
  ],
};
export default task;
