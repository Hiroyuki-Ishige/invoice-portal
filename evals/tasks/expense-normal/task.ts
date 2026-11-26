import { claimSheet, makeWorkbook } from "../../lib/workbook";
import type { EvalTask } from "../../lib/types";

/** A usual month of the expenses sheet: zeros, a `※` mark, a total under the table. Figures made up. */
const task: EvalTask = {
  name: "expense-normal",
  kind: "expense",
  firstSequence: 101,
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
