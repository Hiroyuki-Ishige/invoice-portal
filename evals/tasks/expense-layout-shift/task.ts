import { claimSheet, makeWorkbook, shift } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** The usual expenses sheet with 2 columns and 3 rows inserted in front of it. Figures made up. */
const task: EvalTask = {
  name: "expense-layout-shift",
  kind: "expense",
  firstSequence: 1,
  inputs: async () => [
    {
      label: "2026-11",
      file: await makeWorkbook({
        請求_出向者立替費用: {
          A1: "memo",
          ...shift(claimSheet({ year: 2026, month: 11 }, [["HLAM", 80000], ["HOGV", 0], ["HOGV2", 33000]], 113000), 2, 3),
        },
      }),
    },
  ],
  checks: (result) => {
    const input = result.inputs[0];
    if (input.error) return [`a shifted expenses sheet was refused: ${input.error}`];
    return input.invoices.map((i) => `${i.customerCode} ${i.amount}`).join(",") === "HLAM 80000,HOGV2 33000"
      ? []
      : [`expected HLAM 80000 and HOGV2 33000, got ${input.invoices.map((i) => `${i.customerCode} ${i.amount}`).join(", ")}`];
  },
};
export default task;
